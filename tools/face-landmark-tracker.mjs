#!/usr/bin/env node
// MIT-Licensed YuNet ONNX Facial Landmark Tracker & Smart Auto-Reframe CLI
//
// Tracks exact facial landmarks on every sampled frame:
//   - Middle of the Eyebrows ("glabella", default)
//   - Nose Tip ("nose")
//   - Left Eye, Right Eye, Left Mouth, Right Mouth, Chin Safe-Line
//
// Supports:
//   --anchor glabella | nose     (default: glabella)
//   --mode smooth | lock-on      (default: smooth; lock-on pins landmark dead-center)
//   --crop-bottom <ratio>        (e.g. 0.25 to crop out old burned-in subtitles)
//   --zoom <factor>              (default: 1.35)
//   --render-out <mp4-path>      (optional: directly render 1080x1920 tracked MP4)
//   --clean                      (render pure face-tracked video without captions/HUD)
//   --debug                      (render diagnostic crosshair + landmark HUD overlay)
//
// Usage:
//   node tools/face-landmark-tracker.mjs <video-path> [options]

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
    anchor: { type: 'string', default: 'glabella' },
    mode: { type: 'string', default: 'smooth' },
    'crop-bottom': { type: 'string', default: '0' },
    zoom: { type: 'string', default: '1.35' },
    'sample-fps': { type: 'string', default: '15' },
    'render-out': { type: 'string', default: '' },
    clean: { type: 'boolean', default: false },
    debug: { type: 'boolean', default: false },
  },
});

if (!videoArg || !existsSync(videoArg)) {
  console.error(
    'Usage: node tools/face-landmark-tracker.mjs <video> [--anchor glabella|nose] [--mode smooth|lock-on] [--crop-bottom 0.25] [--render-out out.mp4] [--clean] [--debug]'
  );
  process.exit(1);
}

if (!['glabella', 'nose'].includes(opts.anchor)) {
  console.error(`Invalid --anchor "${opts.anchor}". Choose "glabella" (mid-eyebrows) or "nose".`);
  process.exit(1);
}

if (!['smooth', 'lock-on'].includes(opts.mode)) {
  console.error(`Invalid --mode "${opts.mode}". Choose "smooth" or "lock-on".`);
  process.exit(1);
}

// Ensure MIT YuNet ONNX model is cached locally
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
const outJson = join(dir, `${name}.face-track.json`);
const renderOut = opts['render-out'] ? resolve(opts['render-out']) : '';

const pyArgs = [
  join(root, 'tools', 'face_landmark_worker.py'),
  videoPath,
  '--model',
  modelPath,
  '--anchor',
  opts.anchor,
  '--mode',
  opts.mode,
  '--crop-bottom',
  opts['crop-bottom'],
  '--zoom',
  opts.zoom,
  '--sample-fps',
  opts['sample-fps'],
  '--out-json',
  outJson,
];

if (renderOut) {
  pyArgs.push('--render-out', renderOut);
}
if (opts.debug) {
  pyArgs.push('--debug');
}

const r = spawnSync('python', pyArgs, { encoding: 'utf8', stdio: 'inherit', windowsHide: true });
if (r.status !== 0) {
  console.error('face_landmark_worker.py failed.');
  process.exit(r.status || 1);
}

const report = JSON.parse(readFileSync(outJson, 'utf8'));
const { summary, config, meta } = report;

console.log(`\n=== /face-track Landmark & Out-of-Frame Report ===`);
console.log(`Source:          ${videoPath} (${meta.width}x${meta.height}, ${meta.duration}s @ ${meta.fps}fps)`);
console.log(`Model:           ${report.model}`);
console.log(`Tracked Anchor:  ${config.anchor.toUpperCase()} (${config.anchor === 'glabella' ? 'Middle of Eyebrows' : 'Nose Tip'})`);
console.log(`Camera Mode:     ${config.mode.toUpperCase()} (${config.mode === 'lock-on' ? 'Tight Pixel-Pinned Stabilization' : 'AutoFlip Deadzone + Smooth Glide'})`);
console.log(`Detection Rate:  ${summary.detection_rate_pct}% (${summary.face_detected_samples}/${summary.total_samples} sampled frames)`);
console.log(`Safe Caption Y:  y = ${summary.recommended_caption_y}px (Chin median at y = ${summary.median_canvas_chin_y}px)`);

if (summary.out_of_frame_or_edge_events.length === 0) {
  console.log(`Out-of-Frame:    None (Speaker stayed cleanly inside frame 100% of the video)`);
} else {
  console.log(`Out-of-Frame / Edge Events (${summary.out_of_frame_or_edge_events.length}):`);
  for (const ev of summary.out_of_frame_or_edge_events) {
    console.log(
      `  - [${ev.start.toFixed(2)}s - ${ev.end.toFixed(2)}s] (${ev.duration.toFixed(2)}s) -> ${ev.recovery} (silent=${ev.silent})`
    );
  }
}
console.log(`Saved JSON:      ${outJson}`);
if (renderOut) {
  console.log(`Rendered Video:  ${renderOut} (${opts.debug ? 'DEBUG CROSSHAIR HUD' : 'CLEAN 1080x1920'})`);
}
