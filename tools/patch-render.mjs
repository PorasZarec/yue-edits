#!/usr/bin/env node
/**
 * Surgical Partial Segment Patch Renderer for HyperFrames projects.
 *
 * Renders ONLY a specific time window [startSec .. endSec] of a project's composition
 * and splices the newly rendered slice directly into an existing MP4 render.
 * Saves ~85-95% of render time and agent iteration tokens when tweaking a single beat.
 *
 * Usage:
 *   node tools/patch-render.mjs <projectDir> --from <startSec> --to <endSec> [options]
 *
 * Options:
 *   --from <sec>        Start time in seconds (required, e.g. 11.5)
 *   --to <sec>          End time in seconds (required, e.g. 13.5)
 *   --base <mp4>        Existing full render MP4 to patch (auto-detected if omitted)
 *   --out <mp4>         Output patched MP4 path (defaults to overwriting --base or outbox/<slug>-patched.mp4)
 *   --quality <tier>    draft | standard | high (default: draft)
 *   --fps <num>         Frames per second (default: 30)
 *   --patch-audio       Also splice the newly rendered slice's audio (use if SFX inside the window changed)
 *   --slice-only <mp4>  Only render the [from..to] slice to this path without splicing into a base MP4
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kitDir = join(root, 'kit');

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    base: { type: 'string' },
    out: { type: 'string' },
    quality: { type: 'string', default: 'draft' },
    fps: { type: 'string', default: '30' },
    'patch-audio': { type: 'boolean', default: false },
    'slice-only': { type: 'string' },
  },
});

const rawProject = positionals[0];
if (!rawProject || opts.from === undefined || opts.to === undefined) {
  console.error(
    'Usage: node tools/patch-render.mjs <projectDir> --from <startSec> --to <endSec> [--base <mp4>] [--out <mp4>] [--quality draft|standard|high] [--patch-audio]'
  );
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
const indexHtmlPath = join(projectDir, 'index.html');
if (!existsSync(indexHtmlPath)) {
  throw new Error(`index.html not found in ${projectDir}`);
}

const startSec = Number(opts.from);
const endSec = Number(opts.to);
if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) {
  throw new Error(`Invalid time range: --from ${opts.from} --to ${opts.to} (must have 0 <= from < to)`);
}
const sliceDur = Number((endSec - startSec).toFixed(3));

function run(cmd, args, cwd = root, inherit = false) {
  const isNodeCmd = process.platform === 'win32' && (cmd === 'npx' || cmd === 'npm');
  const r = isNodeCmd
    ? spawnSync([cmd, ...args].join(' '), {
        cwd,
        encoding: 'utf8',
        stdio: inherit ? 'inherit' : 'pipe',
        shell: true,
        windowsHide: true,
      })
    : spawnSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        stdio: inherit ? 'inherit' : 'pipe',
        windowsHide: true,
      });
  if (r.error || r.status !== 0) {
    const detail = r.stderr ? r.stderr.trim().split('\n').slice(-8).join('\n') : r.error?.message || `exit ${r.status}`;
    throw new Error(`${cmd} failed:\n${detail}`);
  }
  return r.stdout ? r.stdout.trim() : '';
}

function probeDuration(filePath) {
  const out = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ]);
  return Number(out);
}

function autoDetectBaseMp4(projDir) {
  const rendersDir = join(projDir, 'renders');
  if (existsSync(rendersDir)) {
    const mp4s = readdirSync(rendersDir)
      .filter((f) => f.endsWith('.mp4') && !f.startsWith('.patch'))
      .map((f) => ({ path: join(rendersDir, f), mtime: statSync(join(rendersDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (mp4s.length) return mp4s[0].path;
  }
  const slug = basename(projDir);
  const outboxDir = join(root, 'outbox');
  if (existsSync(outboxDir)) {
    const matches = readdirSync(outboxDir)
      .filter((f) => f.startsWith(slug) && f.endsWith('.mp4'))
      .map((f) => ({ path: join(outboxDir, f), mtime: statSync(join(outboxDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (matches.length) return matches[0].path;
  }
  return null;
}

const baseMp4 = opts['slice-only']
  ? null
  : opts.base
    ? resolve(root, opts.base)
    : autoDetectBaseMp4(projectDir);

if (!opts['slice-only'] && (!baseMp4 || !existsSync(baseMp4))) {
  throw new Error(
    `Could not find an existing base MP4 to patch. Pass --base <path/to/render.mp4> or --slice-only <out.mp4>.`
  );
}

const outMp4 = opts['slice-only']
  ? resolve(root, opts['slice-only'])
  : opts.out
    ? resolve(root, opts.out)
    : baseMp4;

const origHtml = readFileSync(indexHtmlPath, 'utf8');

// Detect the primary video asset referenced in index.html (usually assets/cut.mp4 or assets/raw.mp4)
const videoSrcMatch = origHtml.match(/<video[^>]+src=["']([^"']+)["']/i);
const origVideoRel = videoSrcMatch ? videoSrcMatch[1] : 'assets/cut.mp4';
const origVideoAbs = join(projectDir, origVideoRel);
const patchVideoRel = 'assets/.patch-cut.mp4';
const patchVideoAbs = join(projectDir, patchVideoRel);
const patchCompName = '.patch-slice.html';
const patchCompAbs = join(projectDir, patchCompName);
const rendersDir = join(projectDir, 'renders');
mkdirSync(rendersDir, { recursive: true });
const sliceRenderRel = 'renders/.patch-slice.mp4';
const sliceRenderAbs = join(projectDir, sliceRenderRel);

const t0 = Date.now();
console.log(`\n== Patch Render [${startSec.toFixed(2)}s .. ${endSec.toFixed(2)}s] (${sliceDur.toFixed(2)}s slice)`);
console.log(`   Project : ${projectDir}`);
if (baseMp4) console.log(`   Base MP4: ${baseMp4}`);
console.log(`   Output  : ${outMp4}`);

try {
  // 1. Slice the source video asset [startSec .. endSec] so HyperFrames only extracts frames for the slice
  if (existsSync(origVideoAbs)) {
    console.log(`1/3 Slicing source video (${origVideoRel}) [${startSec}s .. ${endSec}s]...`);
    run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-ss', String(startSec),
      '-t', String(sliceDur),
      '-i', origVideoAbs,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16',
      '-c:a', 'aac', '-b:a', '192k',
      patchVideoAbs,
    ]);
  }

  // 2. Build temporary .patch-slice.html with shifted GSAP timeline and slice duration
  let patchedHtml = origHtml;

  // Update #root data-duration
  patchedHtml = patchedHtml.replace(
    /(<div[^>]+id=["']root["'][^>]*data-duration=["'])[^"']+(['"])/i,
    `$1${sliceDur}$2`
  );

  // Update <video> and primary <audio> tags pointing to origVideoRel
  const escapedVideoRel = origVideoRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mediaTagRe = new RegExp(`(<(?:video|audio)\\b[^>]*src=["'])${escapedVideoRel}(["'][^>]*>)`, 'gi');
  patchedHtml = patchedHtml.replace(mediaTagRe, (fullTag) => {
    return fullTag
      .replace(new RegExp(`src=["']${escapedVideoRel}["']`, 'i'), `src="${patchVideoRel}"`)
      .replace(/data-duration=["'][^"']+["']/i, `data-duration="${sliceDur}"`)
      .replace(/data-start=["'][^"']+["']/i, `data-start="0"`);
  });

  // Shift SFX <audio> tags into [0 .. sliceDur] and drop out-of-window SFX tags so runtime duration stays exact
  patchedHtml = patchedHtml.replace(/<audio\b[^>]*>/gi, (audioTag) => {
    if (audioTag.includes(patchVideoRel)) return audioTag;
    const startMatch = audioTag.match(/data-start=["']([^"']+)["']/i);
    if (!startMatch) return audioTag;
    const sfxStart = Number(startMatch[1]);
    if (!Number.isFinite(sfxStart) || sfxStart < startSec || sfxStart >= endSec) {
      return '<!-- out-of-slice sfx omitted -->';
    }
    const shiftedStart = Number((sfxStart - startSec).toFixed(3));
    return audioTag.replace(/data-start=["'][^"']+["']/i, `data-start="${shiftedStart}"`);
  });
  patchedHtml = patchedHtml.replace(/<!-- out-of-slice sfx omitted -->\s*<\/audio>/gi, '');

  // Inject GSAP time-offset wrapper right before </script>
  const gsapPatchSnippet = `
      // --- Injected by tools/patch-render.mjs ---
      ;(function() {
        const __origTl = window.__timelines && window.__timelines["main"];
        if (__origTl && typeof gsap !== "undefined") {
          __origTl.pause();
          const __offset = ${startSec};
          const __dur = ${sliceDur};
          const __patchTl = gsap.timeline({
            paused: true,
            onUpdate() {
              __origTl.totalTime(__patchTl.time() + __offset, true);
            }
          });
          __patchTl.to({}, { duration: __dur });
          const __origTotalTime = __patchTl.totalTime.bind(__patchTl);
          __patchTl.totalTime = function(time, suppressEvents) {
            if (arguments.length === 0) return __origTotalTime();
            const res = __origTotalTime(time, suppressEvents);
            __origTl.totalTime(Math.max(0, Number(time) || 0) + __offset, true);
            return res;
          };
          const __origSeek = __patchTl.seek.bind(__patchTl);
          __patchTl.seek = function(time, suppressEvents) {
            const res = __origSeek(time, suppressEvents);
            __origTl.seek(Math.max(0, Number(time) || 0) + __offset, true);
            return res;
          };
          __origTl.totalTime(__offset, true);
          window.__timelines["main"] = __patchTl;
        }
      })();
    </script>`;

  const lastScriptClose = patchedHtml.lastIndexOf('</script>');
  if (lastScriptClose === -1) {
    throw new Error('Could not find closing </script> tag in index.html');
  }
  patchedHtml = patchedHtml.slice(0, lastScriptClose) + gsapPatchSnippet + patchedHtml.slice(lastScriptClose + 9);
  writeFileSync(patchCompAbs, patchedHtml, 'utf8');

  // 3. Render only the slice via HyperFrames
  console.log(`2/3 Rendering ${sliceDur.toFixed(2)}s slice via HyperFrames (quality=${opts.quality}, fps=${opts.fps})...`);
  const hfCliJs = join(kitDir, 'node_modules', 'hyperframes', 'dist', 'cli.js');
  if (!existsSync(hfCliJs)) {
    throw new Error(`HyperFrames CLI not found at ${hfCliJs}. Run 'node setup.mjs' first.`);
  }
  const hfArgs = [
    hfCliJs,
    'render',
    projectDir,
    '--composition', patchCompName,
    '--quality', opts.quality,
    '--fps', opts.fps,
    '--output', sliceRenderAbs,
  ];

  run(process.execPath, hfArgs, kitDir, true);

  if (opts['slice-only']) {
    mkdirSync(dirname(outMp4), { recursive: true });
    copyFileSync(sliceRenderAbs, outMp4);
    console.log(`\nSlice rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outMp4}`);
    process.exit(0);
  }

  // 4. Splice [0..startSec] + [slice] + [endSec..baseDur] via FFmpeg
  console.log(`3/3 Splicing rendered slice into base video via FFmpeg...`);
  const baseDur = probeDuration(baseMp4);
  const hasPre = startSec > 0.02;
  const hasPost = endSec < baseDur - 0.02;

  const tempOutMp4 = join(rendersDir, `.patch-merged-${Date.now()}.mp4`);
  const vParts = [];
  const aParts = [];
  let vConcatInputs = '';
  let aConcatInputs = '';
  let segCount = 0;

  if (hasPre) {
    vParts.push(`[0:v]trim=start=0:end=${startSec},setpts=PTS-STARTPTS[vpre]`);
    vConcatInputs += '[vpre]';
    if (opts['patch-audio']) {
      aParts.push(`[0:a]atrim=start=0:end=${startSec},asetpts=PTS-STARTPTS[apre]`);
      aConcatInputs += '[apre]';
    }
    segCount++;
  }

  vParts.push(`[1:v]trim=start=0:end=${sliceDur},setpts=PTS-STARTPTS[vslice]`);
  vConcatInputs += '[vslice]';
  if (opts['patch-audio']) {
    aParts.push(`[1:a]atrim=start=0:end=${sliceDur},asetpts=PTS-STARTPTS[aslice]`);
    aConcatInputs += '[aslice]';
  }
  segCount++;

  if (hasPost) {
    vParts.push(`[0:v]trim=start=${endSec},setpts=PTS-STARTPTS[vpost]`);
    vConcatInputs += '[vpost]';
    if (opts['patch-audio']) {
      aParts.push(`[0:a]atrim=start=${endSec},asetpts=PTS-STARTPTS[apost]`);
      aConcatInputs += '[apost]';
    }
    segCount++;
  }

  const filterGraph = [
    ...vParts,
    `${vConcatInputs}concat=n=${segCount}:v=1:a=0[outv]`,
    ...(opts['patch-audio'] ? [...aParts, `${aConcatInputs}concat=n=${segCount}:v=0:a=1[outa]`] : []),
  ].join(';');

  const ffArgs = [
    '-y', '-loglevel', 'error',
    '-i', baseMp4,
    '-i', sliceRenderAbs,
    '-filter_complex', filterGraph,
    '-map', '[outv]',
    ...(opts['patch-audio'] ? ['-map', '[outa]', '-c:a', 'aac', '-b:a', '192k'] : ['-map', '0:a?', '-c:a', 'copy']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    tempOutMp4,
  ];

  run('ffmpeg', ffArgs);
  mkdirSync(dirname(outMp4), { recursive: true });
  copyFileSync(tempOutMp4, outMp4);
  rmSync(tempOutMp4, { force: true });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Patch complete in ${elapsed}s! Updated [${startSec}s .. ${endSec}s] -> ${outMp4}`);
} finally {
  rmSync(patchCompAbs, { force: true });
  rmSync(patchVideoAbs, { force: true });
  rmSync(sliceRenderAbs, { force: true });
}
