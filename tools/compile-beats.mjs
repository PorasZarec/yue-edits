#!/usr/bin/env node
/**
 * Declarative Beat Manifest Compiler for Split-Pop HyperFrames projects.
 *
 * Allows agents (Claude Code, Cursor, Codex, Antigravity) to edit a compact `beats.json`
 * manifest (layout schedule, camera zoom speed/focus, Katana MGRT takeovers, captions, SFX)
 * and compile it into `index.html` — or extract `beats.json` from an existing `index.html`.
 *
 * Combined with `tools/patch-render.mjs`, tweaking a single timestamp (e.g. "make the 0:12
 * zoom-in faster") only requires editing a few lines in `beats.json`, running `compile-beats.mjs`,
 * and patch-rendering that 2-second window.
 *
 * Usage:
 *   node tools/compile-beats.mjs <projectDir> [--beats beats.json] [--extract]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kitDir = join(root, 'kit');

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    beats: { type: 'string', default: 'beats.json' },
    extract: { type: 'boolean', default: false },
  },
});

const rawProject = positionals[0];
if (!rawProject) {
  console.error('Usage: node tools/compile-beats.mjs <projectDir> [--beats beats.json] [--extract]');
  process.exit(1);
}

function resolveProjectDir(input) {
  if (isAbsolute(input) && existsSync(input)) return input;
  const fromRoot = resolve(root, input);
  if (existsSync(fromRoot)) return fromRoot;
  const fromProjects = join(kitDir, 'video-projects', input);
  if (existsSync(fromProjects)) return fromProjects;
  throw new Error(`Project directory not found: ${input}`);
}

const projectDir = resolveProjectDir(rawProject);
const beatsPath = isAbsolute(opts.beats) ? opts.beats : join(projectDir, opts.beats);
const indexHtmlPath = join(projectDir, 'index.html');

if (opts.extract) {
  if (!existsSync(indexHtmlPath)) {
    throw new Error(`Cannot --extract: index.html not found in ${projectDir}`);
  }
  const html = readFileSync(indexHtmlPath, 'utf8');
  const durMatch = html.match(/id=["']root["'][^>]*data-duration=["']([^"']+)["']/i);
  const duration = durMatch ? Number(durMatch[1]) : 6.0;

  const faceModesMatch = html.match(/const\s+FACE_MODES\s*=\s*(\{[\s\S]*?\});/);
  const scheduleMatch = html.match(/const\s+SCHEDULE\s*=\s*(\[[\s\S]*?\]);/);
  const captionsMatch = html.match(/const\s+CAPTION_CHUNKS\s*=\s*(\[[\s\S]*?\]);/);

  let faceModes = {
    SPLIT_WIDE: { x: -29, y: 485, scale: 1.56, opacity: 1 },
    SPLIT_TIGHT: { x: -128, y: 330, scale: 1.83, opacity: 1 },
    FULLSCREEN_ZOOM: { x: -220, y: -320, scale: 1.82, opacity: 1 },
    FULLSCREEN_GRAPHICS: { x: -29, y: 485, scale: 1.56, opacity: 0 },
  };
  if (faceModesMatch) {
    try { faceModes = Function(`"use strict"; return (${faceModesMatch[1]});`)(); } catch {}
  }

  let layoutSchedule = [];
  if (scheduleMatch) {
    try {
      const rawSched = Function(`"use strict"; return (${scheduleMatch[1]});`)();
      layoutSchedule = rawSched.map((item) =>
        Array.isArray(item)
          ? { time: item[0], mode: item[1], transitionDur: item[2] ?? 0.24 }
          : item
      );
    } catch {}
  } else {
    const modeCalls = [...html.matchAll(/scheduleLayoutMode\(\s*([\d.]+)\s*,\s*["']([^"']+)["'](?:\s*,\s*([\d.]+))?\s*\)/g)];
    layoutSchedule = [
      { time: 0, mode: 'SPLIT_WIDE', transitionDur: 0.24 },
      ...modeCalls.map((m) => ({
        time: Number(m[1]),
        mode: m[2],
        transitionDur: m[3] ? Number(m[3]) : 0.24,
      })),
    ];
  }

  const ambientPushes = [...html.matchAll(/ambientPush\(\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*,\s*([\d.]+))?\s*\)/g)].map((m) => ({
    start: Number(m[1]),
    end: Number(m[2]),
    fromScale: m[3] ? Number(m[3]) : 1.0,
    toScale: m[4] ? Number(m[4]) : 1.07,
  }));

  const trackFocuses = [...html.matchAll(/trackFocus\(\s*([\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)(?:\s*,\s*([\d.]+))?(?:\s*,\s*([\d.]+))?(?:\s*,\s*([\d.]+))?\s*\)/g)].map((m) => ({
    time: Number(m[1]),
    panX: Number(m[2]),
    panY: Number(m[3]),
    zoom: m[4] ? Number(m[4]) : 1.2,
    holdDur: m[5] ? Number(m[5]) : 0.45,
    inDur: m[6] ? Number(m[6]) : 0.22,
  }));

  let captionChunks = [];
  if (captionsMatch) {
    try { captionChunks = Function(`"use strict"; return (${captionsMatch[1]});`)(); } catch {}
  }

  const sfx = [...html.matchAll(/<audio\b[^>]*id=["'](sx-[^"']+)["'][^>]*>/gi)].map((m) => {
    const tag = m[0];
    const getAttr = (name) => tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1];
    return {
      id: m[1],
      start: Number(getAttr('data-start') || 0),
      duration: Number(getAttr('data-duration') || 0.2),
      volume: Number(getAttr('data-volume') || 0.3),
      src: getAttr('src') || 'assets/sfx/pop.wav',
    };
  });

  const manifest = {
    duration,
    videoSrc: 'assets/cut.mp4',
    faceModes,
    layoutSchedule,
    cameraRig: {
      ambientPushes,
      trackFocuses,
    },
    captionChunks,
    sfx,
  };

  writeFileSync(beatsPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Extracted beats manifest (${layoutSchedule.length} layout cues, ${captionChunks.length} caption chunks, ${sfx.length} SFX) -> ${beatsPath}`);
  process.exit(0);
}

if (!existsSync(beatsPath)) {
  throw new Error(`Beats manifest not found at ${beatsPath}. Run with --extract first or create beats.json.`);
}

const manifest = JSON.parse(readFileSync(beatsPath, 'utf8'));

// If index.html already exists, patch its declarative data blocks (FACE_MODES, SCHEDULE / scheduleLayoutMode, CAPTION_CHUNKS, cameraRig, duration) in-place
if (existsSync(indexHtmlPath)) {
  let html = readFileSync(indexHtmlPath, 'utf8');

  if (manifest.duration) {
    html = html.replace(
      /(id=["']root["'][^>]*data-duration=["'])[^"']+(['"])/i,
      `$1${manifest.duration}$2`
    );
    html = html.replace(/const\s+COMP_DURATION\s*=\s*[\d.]+;/, `const COMP_DURATION = ${manifest.duration};`);
  }

  if (manifest.faceModes) {
    html = html.replace(
      /const\s+FACE_MODES\s*=\s*\{[\s\S]*?\};/,
      `const FACE_MODES = ${JSON.stringify(manifest.faceModes)};`
    );
  }

  if (Array.isArray(manifest.layoutSchedule) && manifest.layoutSchedule.length > 0) {
    if (/const\s+SCHEDULE\s*=\s*\[/.test(html)) {
      const compactSched = manifest.layoutSchedule.map((s) =>
        Array.isArray(s) ? s : [s.time, s.mode, ...(s.transitionDur !== undefined ? [s.transitionDur] : [])]
      );
      html = html.replace(
        /const\s+SCHEDULE\s*=\s*\[[\s\S]*?\];/,
        `const SCHEDULE = ${JSON.stringify(compactSched)};`
      );
    }
  }

  if (html.includes('// __CAMERA_SCHEDULE_START__') && html.includes('// __CAMERA_SCHEDULE_END__')) {
    const lines = ['// __CAMERA_SCHEDULE_START__'];
    for (const p of manifest.cameraRig?.ambientPushes || []) {
      lines.push(`      ambientPush(${p.start}, ${p.end}, ${p.fromScale ?? 1.0}, ${p.toScale ?? 1.07});`);
    }
    for (const f of manifest.cameraRig?.trackFocuses || []) {
      lines.push(
        `      trackFocus(${f.time}, ${f.panX}, ${f.panY}, ${f.zoom ?? 1.2}, ${f.holdDur ?? 0.45}, ${f.inDur ?? 0.22});`
      );
    }
    for (const s of manifest.layoutSchedule || []) {
      const t = Array.isArray(s) ? s[0] : s.time;
      const mode = Array.isArray(s) ? s[1] : s.mode;
      const dur = Array.isArray(s) ? (s[2] ?? 0.24) : (s.transitionDur ?? 0.24);
      if (t > 0) {
        lines.push(`      scheduleLayoutMode(${t}, ${JSON.stringify(mode)}, ${dur});`);
      }
    }
    lines.push('      // __CAMERA_SCHEDULE_END__');
    html = html.replace(
      /\/\/ __CAMERA_SCHEDULE_START__[\s\S]*?\/\/ __CAMERA_SCHEDULE_END__/,
      lines.join('\n')
    );
  }

  if (Array.isArray(manifest.captionChunks) && manifest.captionChunks.length > 0) {
    html = html.replace(
      /const\s+CAPTION_CHUNKS\s*=\s*\[[\s\S]*?\];/,
      `const CAPTION_CHUNKS = ${JSON.stringify(manifest.captionChunks)};`
    );
  }

  // Upgrade trackFocus helper if present so it accepts optional 6th parameter `inDur`
  html = html.replace(
    /function\s+trackFocus\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/,
    `function trackFocus(time, panX, panY, zoom = 1.2, holdDur = 0.45, inDur = 0.22) {
        const safeX = Math.max(-110, Math.min(110, panX));
        const safeY = Math.max(-85, Math.min(85, panY));
        tl.to("#mg-camera", { x: safeX, y: safeY, scale: zoom, duration: inDur, ease: "expo.out" }, time);
        tl.to("#mg-camera", { x: 0, y: 0, scale: 1.0, duration: 0.34, ease: "power2.inOut" }, time + inDur + holdDur);
      }`
  );

  writeFileSync(indexHtmlPath, html, 'utf8');
  console.log(`Compiled ${beatsPath} -> ${indexHtmlPath}`);
} else {
  // Copy template index.html first, then apply manifest
  const tplPath = join(root, 'tools', 'templates', 'split-pop', 'index.html');
  writeFileSync(indexHtmlPath, readFileSync(tplPath, 'utf8'), 'utf8');
  console.log(`Initialized ${indexHtmlPath} from split-pop template; re-running compiler...`);
  const r = await import('node:child_process');
  r.spawnSync(process.execPath, [fileURLToPath(import.meta.url), projectDir, '--beats', beatsPath], { stdio: 'inherit' });
}
