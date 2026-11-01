#!/usr/bin/env node
/**
 * YuNet ONNX 5-Landmark Head & Face Tracker for Split-Pop (v3).
 *
 * Powered by the MIT-licensed OpenCV Zoo YuNet ONNX detector (`tools/face_landmark_worker.py`).
 * Tracks the speaker's exact Glabella (Middle of the Eyebrows), Nose Tip, Forehead, and Chin
 * across the video and computes both:
 *   1. Baseline `gsapFaceModes` (`SPLIT_WIDE`, `SPLIT_TIGHT`, `FULLSCREEN_ZOOM`, `FULLSCREEN_GRAPHICS`)
 *   2. Continuous smoothed per-timestamp `keyframes[]` for `#face-wrapper` so the speaker's face
 *      is dynamically tracked throughout both Split-Screen and Full-Screen Speaker modes.
 *
 * Geometry guarantees (1080x1920 canvas with permanently locked y=1120px seam captions):
 *   - Captions are NEVER moved from `y = 1120px` (`#captions-stage` stays at `top: 1120px; y: 0`).
 *   - In `SPLIT_WIDE` / `SPLIT_TIGHT` (bottom panel `y = 1120..1920`):
 *       Glabella is centered horizontally at `x = 540px`, and `y` is framed so the top of the
 *       forehead stays below `y = 1165px` (never hit by the `y = 1120px` caption).
 *   - In `FULLSCREEN_ZOOM` (1080x1920 edge-to-edge speaker):
 *       Scaled (`scale >= 1.84`) to eliminate ceiling negative space above the speaker's head
 *       (matching the ideal 0:00 framing), placing the speaker's eyes (`glabella`) at the upper
 *       focal point (`y ≈ 690px`) and the speaker's chin right at `y ≈ 1110px` so the locked
 *       `y = 1120px` caption sits cleanly on the chin/upper chest without touching the mouth.
 *
 * Usage:
 *   node tools/track-head.mjs <video-path> [--crop-bottom <ratio>] [--anchor glabella|nose] [--sample-fps 4]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = join(root, 'tools', 'models');
const modelPath = join(modelDir, 'face_detection_yunet_2023mar.onnx');
const YUNET_URL =
  'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx';

const { values: opts, positionals: [videoArg] } = parseArgs({
  allowPositionals: true,
  options: {
    'crop-bottom': { type: 'string', default: '0.25' },
    anchor: { type: 'string', default: 'glabella' },
    'sample-fps': { type: 'string', default: '4' },
  },
});

if (!videoArg || !existsSync(videoArg)) {
  console.error(
    'Usage: node tools/track-head.mjs <video-path> [--crop-bottom <ratio>] [--anchor glabella|nose] [--sample-fps 4]'
  );
  process.exit(1);
}

if (!existsSync(modelPath)) {
  mkdirSync(modelDir, { recursive: true });
  console.log('Downloading MIT-licensed OpenCV YuNet ONNX model (~230 KB)...');
  const dl = spawnSync('curl.exe', ['-sL', YUNET_URL, '-o', modelPath], { windowsHide: true });
  if (dl.status !== 0 || !existsSync(modelPath)) {
    throw new Error('Could not download YuNet ONNX model.');
  }
}

const videoPath = resolve(videoArg);
const { dir, name } = parse(videoPath);
const faceTrackJson = join(dir, `${name}.face-track.json`);

// Run YuNet 5-landmark worker to extract per-frame glabella, nose, forehead_y, and chin_y
const pyRes = spawnSync(
  'python',
  [
    join(root, 'tools', 'face_landmark_worker.py'),
    videoPath,
    '--model', modelPath,
    '--anchor', opts.anchor,
    '--mode', 'smooth',
    '--crop-bottom', opts['crop-bottom'],
    '--sample-fps', opts['sample-fps'],
    '--out-json', faceTrackJson,
  ],
  { encoding: 'utf8', windowsHide: true }
);

if (pyRes.status !== 0 || !existsSync(faceTrackJson)) {
  throw new Error(`face_landmark_worker.py failed: ${pyRes.stderr || pyRes.stdout}`);
}

const ftReport = JSON.parse(readFileSync(faceTrackJson, 'utf8'));
const { meta } = ftReport;
const rawCropArg = Number(opts['crop-bottom'] || 0);
const cropBottomRatio =
  rawCropArg > 1 ? Math.min(0.45, rawCropArg / meta.height) : Math.max(0, Math.min(0.45, rawCropArg));

// Scale factor from source video dimensions to 1080x1920 object-fit: cover canvas
const coverScale = Math.max(1080 / meta.width, 1920 / meta.height);
const coverOffsetX = (1080 - meta.width * coverScale) * 0.5;
const coverOffsetY = (1920 - meta.height * coverScale) * 0.5;
const toCanvasX = (px) => px * coverScale + coverOffsetX;
const toCanvasY = (py) => py * coverScale + coverOffsetY;
const cleanMaxY = 1920 * (1 - cropBottomRatio);

// Extract valid landmark detections in 1080x1920 canvas coordinates
const rawFrames = ftReport.keyframes.map((kf) => {
  const det = kf.landmarks;
  if (!det) return { time: kf.time, valid: false };
  const anchorPt = opts.anchor === 'nose' ? det.nose : det.glabella;
  return {
    time: kf.time,
    valid: true,
    gx: toCanvasX(anchorPt[0]),
    gy: toCanvasY(anchorPt[1]),
    noseX: toCanvasX(det.nose[0]),
    noseY: toCanvasY(det.nose[1]),
    foreheadY: toCanvasY(det.forehead_y),
    chinY: toCanvasY(det.chin_y),
    bh: det.bbox[3] * coverScale,
  };
});

const validDetections = rawFrames.filter((f) => f.valid);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const medGx = validDetections.length ? median(validDetections.map((d) => d.gx)) : 540;
const medGy = validDetections.length ? median(validDetections.map((d) => d.gy)) : 760;
const medForeheadY = validDetections.length ? median(validDetections.map((d) => d.foreheadY)) : medGy - 85;
const medChinY = validDetections.length ? median(validDetections.map((d) => d.chinY)) : medGy + 220;

/**
 * Given smoothed (gx, gy, foreheadY, chinY) in 1080x1920 source coords, compute exact
 * #face-wrapper { x, y, scale, opacity } for each layout mode while keeping #captions-stage
 * permanently locked at y = 1120px.
 */
function solveModesForPoint(gx, gy, foreheadY, chinY) {
  // 1. SPLIT_WIDE: Bottom panel y = 1120..1920.
  //     Caption sits at y = 1120px (bottom of caption text ≈ 1154px).
  //     Place glabella near y = 1370px (scale = 1.14) so car ceiling is cropped behind y = 1120px,
  //     forehead stays >= 1170px below the caption, and cleanMaxY * scale + y >= 1920.
  const splitWideScale = 1.14;
  const swX = Math.min(0, Math.max(Math.round(1080 - 1080 * splitWideScale), Math.round(540 - gx * splitWideScale)));
  let swY = Math.round(1370 - gy * splitWideScale);
  const minSwYForCaptionClearance = Math.ceil(1170 - foreheadY * splitWideScale);
  const minSwYForCleanBottom = Math.ceil(1920 - cleanMaxY * splitWideScale);
  swY = Math.max(swY, minSwYForCaptionClearance, minSwYForCleanBottom);

  // 2. SPLIT_TIGHT: Tighter bottom-panel framing (scale = 1.24, glabella near y = 1355px), forehead >= 1168px.
  const splitTightScale = 1.24;
  const stX = Math.min(0, Math.max(Math.round(1080 - 1080 * splitTightScale), Math.round(540 - gx * splitTightScale)));
  let stY = Math.round(1355 - gy * splitTightScale);
  const minStYForCaptionClearance = Math.ceil(1168 - foreheadY * splitTightScale);
  const minStYForCleanBottom = Math.ceil(1920 - cleanMaxY * splitTightScale);
  stY = Math.max(stY, minStYForCaptionClearance, minStYForCleanBottom);

  // 3. FULLSCREEN_ZOOM (v4 — permanently locked y = 1120px seam caption, capY = 0):
  //    - Scale = 1.95..2.05 so ceiling negative space above the head is cropped out and old burned-in
  //      subtitles below cleanMaxY are pushed completely off-screen (> 1920px).
  //    - Eyes (glabella) sit at y = 815px (clearly above the permanently locked y = 1120px seam caption).
  //    - #captions-stage stays locked at y = 1120px (capY: 0) across both Split and Fullscreen modes!
  const targetFsGlabellaY = 815;
  const spanBelowGlabella = Math.max(220, cleanMaxY - gy);
  const reqScaleClean = (1920 - targetFsGlabellaY) / spanBelowGlabella;
  const fsScale = +Math.max(1.95, Math.min(2.08, reqScaleClean)).toFixed(3);

  const fsX = Math.min(0, Math.max(Math.round(1080 - 1080 * fsScale), Math.round(540 - gx * fsScale)));
  let fsY = Math.round(targetFsGlabellaY - gy * fsScale);
  const minFsYForCleanBottom = Math.ceil(1920 - cleanMaxY * fsScale);
  fsY = Math.min(0, Math.max(minFsYForCleanBottom, fsY));

  return {
    SPLIT_WIDE: { x: +swX.toFixed(1), y: +swY.toFixed(1), scale: splitWideScale, opacity: 1, capY: 0 },
    SPLIT_TIGHT: { x: +stX.toFixed(1), y: +stY.toFixed(1), scale: splitTightScale, opacity: 1, capY: 0 },
    FULLSCREEN_ZOOM: { x: +fsX.toFixed(1), y: +fsY.toFixed(1), scale: fsScale, opacity: 1, capY: 0 },
    FULLSCREEN_GRAPHICS: { x: +swX.toFixed(1), y: +swY.toFixed(1), scale: splitWideScale, opacity: 0, capY: 0 },
  };
}

// Smooth landmark trajectory with EMA + deadzone (AutoFlip style) so face tracking is fluid
let smoothGx = medGx;
let smoothGy = medGy;
let smoothForeheadY = medForeheadY;
let smoothChinY = medChinY;
const alpha = 0.28;
const deadzonePx = 10;

const splitPopKeyframes = rawFrames.map((f) => {
  if (f.valid) {
    if (Math.abs(f.gx - smoothGx) > deadzonePx) smoothGx += alpha * (f.gx - smoothGx);
    if (Math.abs(f.gy - smoothGy) > deadzonePx) smoothGy += alpha * (f.gy - smoothGy);
    if (Math.abs(f.foreheadY - smoothForeheadY) > deadzonePx) smoothForeheadY += alpha * (f.foreheadY - smoothForeheadY);
    if (Math.abs(f.chinY - smoothChinY) > deadzonePx) smoothChinY += alpha * (f.chinY - smoothChinY);
  }
  const modes = solveModesForPoint(smoothGx, smoothGy, smoothForeheadY, smoothChinY);
  return {
    t: f.time,
    glabella: [+smoothGx.toFixed(1), +smoothGy.toFixed(1)],
    chinY: +smoothChinY.toFixed(1),
    modes,
  };
});

const baselineModes = solveModesForPoint(medGx, medGy, medForeheadY, medChinY);

const result = {
  source: videoPath,
  tracker: 'YuNet ONNX 5-Landmark (tools/face_landmark_worker.py)',
  anchor: opts.anchor,
  meta,
  cropBottomRatio: +cropBottomRatio.toFixed(4),
  headCenter: {
    normX: +(medGx / 1080).toFixed(4),
    normY: +(medGy / 1920).toFixed(4),
    pxX: Math.round(medGx),
    pxY: Math.round(medGy),
    chinPxY: Math.round(medChinY),
    foreheadPxY: Math.round(medForeheadY),
    confidence: `${ftReport.summary.detection_rate_pct}% (${ftReport.summary.face_detected_samples}/${ftReport.summary.total_samples} frames)`,
  },
  layout: {
    canvas: { width: 1080, height: 1920 },
    topStage: { x: 0, y: 0, width: 1080, height: 1120 },
    seamBoundaryY: 1120,
    captionLockedY: 1120, // Permanently locked at y=1120px in Split & Full-Screen Speaker modes; hidden in FULLSCREEN_GRAPHICS
    speakerBottomPanel: { x: 0, y: 1120, width: 1080, height: 800 },
  },
  gsapFaceModes: baselineModes,
  keyframes: splitPopKeyframes,
};

const outJson = join(dir, `${name}.head-track.json`);
writeFileSync(outJson, JSON.stringify(result, null, 2));

console.log(`YuNet Face-Track (${result.headCenter.confidence}): glabella=(${result.headCenter.pxX}px, ${result.headCenter.pxY}px), chinY=${result.headCenter.chinPxY}px`);
console.log(`Locked Caption Line: y = 1120px (never moved; speaker framed so chin=1110px in Fullscreen & forehead>=1170px in Split)`);
console.log(`Saved ${splitPopKeyframes.length} dynamic face-track keyframes -> ${outJson}`);
console.log(`Baseline GSAP Face Modes:`, JSON.stringify(result.gsapFaceModes));
