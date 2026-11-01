#!/usr/bin/env node
// Downloads and caches local SVG/clipart/emoji/brand-logo assets into a project's assets/icons/
// directory so HyperFrames compositions remain 100% local and deterministic.
//
// Usage:
//   node tools/fetch-assets.mjs <output-dir> <spec1> [spec2 ...]
//
// Spec formats:
//   noto:rocket                 -> Colorful Google Noto Emoji clipart SVG
//   twemoji:fire                -> Colorful Twemoji clipart SVG
//   fluent-emoji-flat:trophy    -> Microsoft Fluent Emoji clipart SVG
//   logos:claude-icon           -> Official multi-color brand logo SVG
//   simple-icons:anthropic      -> Brand mark SVG (auto-colored white if monochrome)
//   lucide:sparkles             -> Crisp vector icon SVG
//   builtin:cursor              -> Built-in colorful vector clipart/icon (always works offline)
//   rocket                      -> Shorthand: tries built-in colorful clipart first, then Iconify
//
// Example:
//   node tools/fetch-assets.mjs kit/video-projects/demo/assets/icons noto:rocket logos:claude-icon lucide:terminal cursor fire check warning

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [, , outArg, ...specs] = process.argv;
if (!outArg || specs.length === 0) {
  console.error('Usage: node tools/fetch-assets.mjs <output-dir> <spec1> [spec2 ...]');
  process.exit(1);
}

const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });

// Rich, colorful built-in SVG cliparts & UI icons (zero-network fallback & instant high-contrast clipart)
const BUILTIN_CLIPART = {
  cursor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
    <defs>
      <filter id="sh" x="-20%" y="-20%" width="150%" height="150%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.65"/>
      </filter>
    </defs>
    <path filter="url(#sh)" d="M14 8 L52 28 L34 34 L44 52 L36 56 L26 38 L14 48 Z" fill="#FFFFFF" stroke="#080A0F" stroke-width="4" stroke-linejoin="round"/>
  </svg>`,
  rocket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <defs>
      <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFD60A"/>
        <stop offset="100%" stop-color="#EF4444"/>
      </linearGradient>
    </defs>
    <path d="M28 92 C16 104 14 114 14 114 C14 114 24 112 36 100 Z" fill="url(#rg)"/>
    <path d="M74 18 C96 14 112 16 112 16 C112 16 114 32 110 54 C104 78 82 94 64 100 L28 64 C34 46 50 24 74 18 Z" fill="#F8FAFC" stroke="#0F172A" stroke-width="5"/>
    <path d="M84 16 C102 15 112 16 112 16 C112 16 113 26 112 44 L84 16 Z" fill="#EF4444"/>
    <circle cx="78" cy="50" r="13" fill="#38BDF8" stroke="#0F172A" stroke-width="5"/>
    <path d="M28 64 L12 72 L20 86 L36 80 Z" fill="#EF4444" stroke="#0F172A" stroke-width="4"/>
    <path d="M64 100 L56 116 L42 108 L48 92 Z" fill="#EF4444" stroke="#0F172A" stroke-width="4"/>
  </svg>`,
  fire: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <path d="M66 10 C66 10 108 42 104 82 C101 106 82 120 64 120 C44 120 24 104 24 78 C24 56 40 42 44 34 C44 34 42 50 52 54 C48 34 66 10 66 10 Z" fill="#EF4444" stroke="#080A0F" stroke-width="4"/>
    <path d="M64 46 C64 46 88 66 86 90 C84 106 74 116 64 116 C52 116 42 106 42 90 C42 74 56 64 64 46 Z" fill="#FFD60A"/>
    <circle cx="64" cy="98" r="12" fill="#FFFBEB"/>
  </svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <circle cx="64" cy="64" r="54" fill="#22C55E" stroke="#080A0F" stroke-width="6"/>
    <path d="M38 66 L56 84 L92 46" fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <path d="M64 14 L118 108 L10 108 Z" fill="#FFD60A" stroke="#080A0F" stroke-width="6" stroke-linejoin="round"/>
    <rect x="58" y="44" width="12" height="34" rx="6" fill="#080A0F"/>
    <circle cx="64" cy="92" r="7" fill="#080A0F"/>
  </svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <circle cx="64" cy="64" r="54" fill="#EF4444" stroke="#080A0F" stroke-width="6"/>
    <path d="M44 44 L84 84 M84 44 L44 84" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round"/>
  </svg>`,
  bolt: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <path d="M74 10 L26 70 L62 70 L52 118 L102 56 L66 56 Z" fill="#FFD60A" stroke="#080A0F" stroke-width="6" stroke-linejoin="round"/>
  </svg>`,
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <path d="M36 20 H92 V54 C92 72 80 84 64 84 C48 84 36 72 36 54 Z" fill="#FFD60A" stroke="#080A0F" stroke-width="5"/>
    <path d="M36 28 H18 V46 C18 58 26 66 36 66" fill="none" stroke="#FFD60A" stroke-width="8" stroke-linecap="round"/>
    <path d="M92 28 H110 V46 C110 58 102 66 92 66" fill="none" stroke="#FFD60A" stroke-width="8" stroke-linecap="round"/>
    <rect x="56" y="84" width="16" height="20" fill="#F59E0B" stroke="#080A0F" stroke-width="4"/>
    <rect x="38" y="102" width="52" height="14" rx="5" fill="#FFD60A" stroke="#080A0F" stroke-width="4"/>
  </svg>`,
  money: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <rect x="12" y="30" width="104" height="68" rx="12" fill="#22C55E" stroke="#080A0F" stroke-width="6"/>
    <circle cx="64" cy="64" r="20" fill="#16A34A"/>
    <text x="64" y="76" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-weight="900" font-size="38" fill="#FFFFFF">$</text>
  </svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <path d="M64 12 L76 48 L112 60 L76 72 L64 108 L52 72 L16 60 L52 48 Z" fill="#FFD60A" stroke="#080A0F" stroke-width="4" stroke-linejoin="round"/>
    <path d="M100 14 L104 26 L116 30 L104 34 L100 46 L96 34 L84 30 L96 26 Z" fill="#FFFFFF"/>
    <path d="M28 82 L32 94 L44 98 L32 102 L28 114 L24 102 L12 98 L24 94 Z" fill="#22C55E"/>
  </svg>`,
  terminal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <rect x="12" y="20" width="104" height="88" rx="14" fill="#111827" stroke="#374151" stroke-width="6"/>
    <circle cx="28" cy="36" r="5" fill="#EF4444"/>
    <circle cx="44" cy="36" r="5" fill="#FFD60A"/>
    <circle cx="60" cy="36" r="5" fill="#22C55E"/>
    <path d="M32 58 L48 72 L32 86" fill="none" stroke="#22C55E" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="58" y1="86" x2="86" y2="86" stroke="#FFD60A" stroke-width="8" stroke-linecap="round"/>
  </svg>`,
  chart_up: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <rect x="14" y="14" width="100" height="100" rx="18" fill="#0F172A" stroke="#22C55E" stroke-width="5"/>
    <path d="M28 88 L52 64 L70 76 L98 38" fill="none" stroke="#22C55E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M78 38 H98 V58" fill="none" stroke="#22C55E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  chart_down: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <rect x="14" y="14" width="100" height="100" rx="18" fill="#0F172A" stroke="#EF4444" stroke-width="5"/>
    <path d="M28 38 L52 62 L70 50 L98 88" fill="none" stroke="#EF4444" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M78 88 H98 V68" fill="none" stroke="#EF4444" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

async function fetchIconify(prefix, name, color) {
  const query = color ? `?color=${encodeURIComponent(color)}&height=128` : '?height=128';
  const url = `https://api.iconify.design/${prefix}/${name}.svg${query}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.includes('<svg')) return null;
  return text;
}

for (const rawSpec of specs) {
  const cleanName = rawSpec.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  const outFile = join(outDir, `${cleanName}.svg`);

  if (existsSync(outFile)) {
    console.log(`Already cached: ${outFile}`);
    continue;
  }

  let [prefix, name] = rawSpec.includes(':') ? rawSpec.split(':', 2) : ['auto', rawSpec];
  const key = name.replace(/-/g, '_').toLowerCase();

  if (prefix === 'builtin' && BUILTIN_CLIPART[key]) {
    writeFileSync(outFile, BUILTIN_CLIPART[key], 'utf8');
    console.log(`Wrote builtin clipart: ${outFile}`);
    continue;
  }

  let svg = null;
  try {
    if (prefix === 'auto') {
      if (BUILTIN_CLIPART[key]) {
        svg = BUILTIN_CLIPART[key];
      } else {
        // Try colorful emoji/clipart sets first, then logos, then Lucide vector
        for (const [p, col] of [
          ['noto', null],
          ['fluent-emoji-flat', null],
          ['twemoji', null],
          ['logos', null],
          ['lucide', '#FFD60A'],
        ]) {
          svg = await fetchIconify(p, name, col);
          if (svg) break;
        }
      }
    } else {
      const defaultColor = prefix === 'lucide' || prefix === 'ph' || prefix === 'simple-icons' ? '#FFFFFF' : null;
      svg = await fetchIconify(prefix, name, defaultColor);
    }
  } catch {
    // Offline or network error -> fall back to builtin clipart
  }

  if (!svg) {
    svg = BUILTIN_CLIPART[key] || BUILTIN_CLIPART.sparkles;
    console.log(`Fallback clipart used for "${rawSpec}" -> ${outFile}`);
  } else {
    console.log(`Fetched clipart/icon "${rawSpec}" -> ${outFile}`);
  }
  writeFileSync(outFile, svg, 'utf8');
}
