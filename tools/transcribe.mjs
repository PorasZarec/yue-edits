#!/usr/bin/env node
// 100% Local word-level transcription via faster-whisper in the format Herk Edit Kit's cutting tools expect:
// { text, audio_duration_secs, words: [{ text, start, end }] }, written beside the video.
//
//   node tools/transcribe.mjs <video> [--model turbo|small|medium|large-v3]
//
// Runs 100% offline on this computer using Python + faster-whisper (no API keys or cloud uploads).
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opts, positionals: [video] } = parseArgs({
  allowPositionals: true,
  options: {
    local: { type: 'boolean', default: true }, // kept as a no-op flag for backwards compatibility
    model: { type: 'string', default: 'turbo' },
  },
});

const { model } = opts;
if (!video || !existsSync(video)) {
  console.error('Usage: node tools/transcribe.mjs <video> [--model turbo|small|medium|large-v3]');
  process.exit(1);
}

const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  if (r.error || r.status !== 0) {
    throw new Error(`${cmd} failed: ${r.error?.message || r.stderr.trim().split('\n').pop()}`);
  }
  return r.stdout;
};

const { dir, name } = parse(resolve(video));
const out = join(dir, `${name}.json`);
const duration = Number(
  run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])
);

const json = run('python', [join(root, 'tools', 'transcribe_local.py'), resolve(video), model]);
let words = JSON.parse(json);

words = words.filter((w) => w.text && w.end >= w.start);
if (!words.length) {
  console.error('No words with timestamps came back. Is there speech in this video?');
  process.exit(4);
}

writeFileSync(
  out,
  JSON.stringify(
    {
      text: words.map((w) => w.text).join(' '),
      audio_duration_secs: duration,
      words,
    },
    null,
    2
  )
);
console.log(`Wrote ${words.length} words (${duration.toFixed(1)} s) to ${out}`);
