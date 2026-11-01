#!/usr/bin/env node
// Synthesizes clean, deterministic 48kHz 16-bit mono WAV sound effects for split-pop:
//   - whoosh.wav      (soft air transition for split/panel/card entries)
//   - whoosh-soft.wav (shorter, lighter air swipe for secondary moves)
//   - click.wav       (dry UI cursor click / button press)
//   - pop.wav         (subtle tactile pop for clipart / 3D emoji / icon reveals)
//   - tap.wav         (damped wood/ceramic tap for list items & keyword hits)
//   - chime.wav       (warm two-note resolution tone for green wins / payoffs)
//
// Usage:
//   node tools/synth-sfx.mjs [output-dir]
//
// If my-sounds/ contains custom overrides (e.g. my-sounds/click.wav), those are copied first.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] || join(root, 'kit', 'video-projects', 'demo', 'assets', 'sfx'));
const mySoundsDir = join(root, 'my-sounds');

mkdirSync(outDir, { recursive: true });

const SR = 48000;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);      // PCM chunk size
  buf.writeUInt16LE(1, 20);       // PCM format
  buf.writeUInt16LE(1, 22);       // 1 channel (mono)
  buf.writeUInt32LE(SR, 24);      // sample rate
  buf.writeUInt32LE(SR * 2, 28);  // byte rate
  buf.writeUInt16LE(2, 32);       // block align
  buf.writeUInt16LE(16, 34);      // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(filePath, buf);
}

// Deterministic PRNG for noise shaping
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. Soft air whoosh (band-passed noise + gentle low body sweep, peak at ~35% duration)
function makeWhoosh(durationSec = 0.24, seed = 101, gain = 0.28) {
  const n = Math.floor(SR * durationSec);
  const out = new Float64Array(n);
  const rand = mulberry32(seed);
  let lp = 0;
  let bp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = i / n;
    // Envelope peaks early (u ~ 0.35) so impact aligns near onset
    const env = Math.sin(Math.PI * Math.pow(u, 0.72)) * Math.exp(-2.2 * u);
    const white = rand() * 2 - 1;
    const cutoff = 0.04 + 0.14 * Math.sin(Math.PI * u);
    lp += cutoff * (white - lp);
    bp += 0.25 * (lp - bp);
    const sub = Math.sin(2 * Math.PI * (95 + 110 * u) * t) * 0.22;
    out[i] = (bp * 1.9 + sub) * env * gain;
  }
  return out;
}

// 2. Dry UI cursor click (crisp transient + tiny mechanical release click)
function makeClick() {
  const durationSec = 0.065;
  const n = Math.floor(SR * durationSec);
  const out = new Float64Array(n);
  const rand = mulberry32(202);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Primary press transient at t=0
    const env1 = Math.exp(-t * 260);
    const tone1 = Math.sin(2 * Math.PI * 1450 * t) * 0.55 + Math.sin(2 * Math.PI * 2900 * t) * 0.25;
    const noise1 = (rand() * 2 - 1) * Math.exp(-t * 420) * 0.4;
    // Subtle release tick at t=0.024s
    const dt = t - 0.024;
    const env2 = dt >= 0 ? Math.exp(-dt * 340) * 0.38 : 0;
    const tone2 = dt >= 0 ? Math.sin(2 * Math.PI * 1950 * dt) : 0;
    out[i] = (env1 * (tone1 + noise1) + env2 * tone2) * 0.45;
  }
  return out;
}

// 3. Tactile pop (upward pitch envelope for clipart / icon / emoji bounce-in)
function makePop() {
  const durationSec = 0.085;
  const n = Math.floor(SR * durationSec);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const freq = 260 + 520 * (1 - Math.exp(-t * 65));
    phase += (2 * Math.PI * freq) / SR;
    const env = Math.exp(-t * 48) * Math.min(1, t * 400);
    out[i] = Math.sin(phase) * env * 0.42;
  }
  return out;
}

// 4. Damped tap (soft wood/ceramic touch for keyword pops & list bullets)
function makeTap() {
  const durationSec = 0.07;
  const n = Math.floor(SR * durationSec);
  const out = new Float64Array(n);
  const rand = mulberry32(404);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 140) * Math.min(1, t * 600);
    const body = Math.sin(2 * Math.PI * 420 * t) * 0.65 + Math.sin(2 * Math.PI * 890 * t) * 0.25;
    const thud = (rand() * 2 - 1) * Math.exp(-t * 320) * 0.25;
    out[i] = (body + thud) * env * 0.42;
  }
  return out;
}

// 5. Warm chime (subtle fifth interval for green payoff / check completion)
function makeChime() {
  const durationSec = 0.42;
  const n = Math.floor(SR * durationSec);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env1 = Math.exp(-t * 9.5) * Math.min(1, t * 180);
    const note1 = Math.sin(2 * Math.PI * 587.33 * t) * 0.5; // D5
    const dt = t - 0.055;
    const env2 = dt >= 0 ? Math.exp(-dt * 8.0) * Math.min(1, dt * 180) : 0;
    const note2 = dt >= 0 ? Math.sin(2 * Math.PI * 880.0 * dt) * 0.55 : 0; // A5
    out[i] = (note1 * env1 + note2 * env2) * 0.34;
  }
  return out;
}

const presets = {
  'whoosh.wav': () => makeWhoosh(0.24, 101, 0.28),
  'whoosh-soft.wav': () => makeWhoosh(0.16, 102, 0.22),
  'click.wav': makeClick,
  'pop.wav': makePop,
  'tap.wav': makeTap,
  'chime.wav': makeChime,
};

for (const [name, generator] of Object.entries(presets)) {
  const target = join(outDir, name);
  const custom = join(mySoundsDir, name);
  if (existsSync(custom)) {
    copyFileSync(custom, target);
    console.log(`Copied user sound: ${name} -> ${target}`);
  } else {
    writeWav(target, generator());
    console.log(`Synthesized SFX:   ${name} -> ${target}`);
  }
}
