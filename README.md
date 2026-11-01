# Yue Edits (`yue-edits`)

![License](https://img.shields.io/badge/license-MIT-green?style=flat-square) ![Agent Skills](https://img.shields.io/badge/Agent-Skills-8A2BE2?style=flat-square) ![Claude Code](https://img.shields.io/badge/Claude%20Code-ready-D97757?style=flat-square&logo=anthropic&logoColor=white) ![100% Local](https://img.shields.io/badge/pipeline-100%25%20local-brightgreen?style=flat-square)

A **100% local, skill-first AI video editor** that runs inside your AI coding agent (Claude Code, Antigravity, Cursor, Codex, Windsurf) with **zero cloud API keys** and **surgical partial-segment rendering**.

Drop a raw video into `inbox/` and trigger a skill (`/split-pop`, `/face-track`, or `"edit this"`). When you want to tweak a specific moment (e.g., *"at 0:12 make the zoom-in faster"*), the agent patches `beats.json` and runs `tools/patch-render.mjs --from 11.5 --to 13.5` to re-render **only that 2-second slice** and splice it into your MP4 in seconds — saving ~90% of tokens and render time.

---

## Included Agent Skills

| Skill | Trigger | What It Produces |
| :--- | :--- | :--- |
| **`/split-pop`** | `/split-pop` or *"use split-pop"* | High-engagement `1080x1920` vertical edit: trims cold-open fillers (*"Alright so"*), **3-mode layout** (~65–70% 58/42 Split-Screen, ~20–25% edge-to-edge Full-Screen Speaker zoom-in with zero black cover bars, ~10% Full-Screen **Higgsfield Katana MGRT** hyper-text + clipart takeover), **dual-layer graphics camera rig** (continuous subtle zoom + sharp `expo.out` pop-in tracking), exact `y=1120px` seam-centered single-line BOLD UPPERCASE captions (clean drop-shadow only, **no outer stroke**) with White + Yellow/Green/Red keyword highlights, continuous clipart/icons, and synced WAV SFX. |
| **`/face-track`** | `/face-track` or *"use face-track"* | Standalone 5-landmark facial tracking & auto-reframe powered by the MIT-licensed **OpenCV Zoo YuNet ONNX** detector (`tools/face-landmark-tracker.mjs`). Locks onto the **Middle of the Eyebrows (`glabella`, default)** or **Nose Tip (`nose`)**, supports `smooth` deadzone follow and tight `lock-on` stabilization, 3-tier Out-of-Frame recovery, and `--clean` / `--debug` crosshair HUD modes. |
| **`/yue-edits`** | `"start"`, `"edit this"` | One-time environment setup, 100% local `faster-whisper` word-level transcription, surgical partial-segment patch rendering, and persistent user rules (`my-rules.md`). |
| **`/conventional-commits`** | `"commit"` | Formats repository commits following the Conventional Commits 1.0.0 specification. |

---

## Core CLI Tools (`tools/`)

```bash
# 1. 100% Local Word-Level Transcription (faster-whisper, no API keys needed)
node tools/transcribe.mjs <video.mp4> [--model turbo|small|medium|large-v3]

# 2. Surgical Partial-Segment Patch Renderer (re-renders only [from..to] and splices into base MP4)
node tools/patch-render.mjs <projectDir> --from <startSec> --to <endSec> [--base <in.mp4>] [--out <out.mp4>] [--patch-audio]

# 3. Declarative Beat Manifest Compiler (extracts or compiles compact beats.json -> index.html)
node tools/compile-beats.mjs <projectDir> [--beats beats.json] [--extract]

# 4. Split-Pop Head Tracker (computes SPLIT_WIDE, SPLIT_TIGHT, FULLSCREEN_ZOOM without black bars)
node tools/track-head.mjs <video.mp4> [--crop-bottom 0.25]

# 5. Standalone 5-Landmark YuNet ONNX Tracker (glabella / nose + out-of-frame recovery)
node tools/face-landmark-tracker.mjs <video.mp4> [--anchor glabella|nose] [--mode smooth|lock-on]

# 6. Local Clipart / Icon Fetcher & Procedural WAV SFX Synthesizer
node tools/fetch-assets.mjs <outDir> noto:fire lucide:zap brand:github
node tools/synth-sfx.mjs <outDir>
```

---

## Setup (Once)

1. Open this folder in your agent (`claude`, Antigravity, Cursor, or Codex).
2. Run:
   ```bash
   node setup.mjs
   ```
   *(Requires Node.js 22+, Git, FFmpeg, Chrome, and Python with `pip install faster-whisper onnxruntime av pillow numpy`.)*

---

## Folder Structure

```text
yue-edits/
  .agents/skills/    shared Agent Skills (split-pop, face-track, yue-edits, conventional-commits)
  .claude/skills/    Claude Code skill pointers
  AGENTS.md          entry instructions for all agents (imported by CLAUDE.md)
  setup.mjs          one-time local setup (safe to re-run)
  tools/             local transcription, patch-render, compile-beats, face trackers, SFX, templates
  inbox/             drop raw videos here
  outbox/            rendered drafts and finals
  my-style.md        your personal style preferences (gitignored)
  my-rules.md        rules learned from your revision notes (gitignored)
  my-sounds/         optional custom audio/SFX (gitignored)
  kit/               Herk Edit Kit + HyperFrames rendering engine (installed by setup.mjs)
```

---

## Credits & License

- Built on [Herk Edit Kit](https://github.com/nateherkai/herk-edit-kit) by Nate Herk (MIT), [HyperFrames](https://github.com/heygen-com/hyperframes), and [GSAP](https://gsap.com/).
- Face landmark detection uses the MIT-licensed [OpenCV Zoo YuNet ONNX model](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet).
- Licensed under [MIT](LICENSE).
