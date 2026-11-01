# Yue Edits — Skill-First Local AI Video Editor

This folder is the user's 100% local, skill-first personal video editor. They record; you edit.

## Available Skills

- **`split-pop`** (`.agents/skills/split-pop/SKILL.md`): Dedicated high-engagement split-screen video editing skill (3-mode layout: 65–70% Split-Screen with 58% top dark motion-graphics stage and 42% bottom head-centered speaker, 20–25% edge-to-edge Full-Screen Speaker zoom-in with zero black cover bars, and ~10% Full-Screen Higgsfield Katana MGRT hyper-text + clipart takeover; dual-layer graphics camera rig with continuous subtle zoom-in + sharp `expo.out` pop-in tracking; exact `y=1120px` seam-centered single-line BOLD UPPERCASE captions with clean drop-shadow only and White + Yellow/Green/Red keyword highlights). Read and follow it whenever the user invokes `/split-pop`, `$split-pop`, or asks to edit a video using `split-pop`.
- **`face-track`** (`.agents/skills/face-track/SKILL.md`): Standalone facial-landmark tracking & auto-reframe skill powered by the MIT-licensed YuNet ONNX 5-landmark detector (`tools/face-landmark-tracker.mjs`). Tracks the middle of the eyebrows (`glabella`, default) or nose (`nose`), supports `smooth` deadzone follow and tight `lock-on` stabilization, handles out-of-frame recovery automatically, and outputs a full-screen `1080x1920` speaker-focused video (default with chin-safe captions, `--clean`, or `--debug` crosshair HUD). Read and follow it whenever the user invokes `/face-track`, `$face-track`, or asks to use `face-track`.
- **`yue-edits`** (`.agents/skills/yue-edits/SKILL.md`): General setup, 100% local `faster-whisper` transcription, surgical partial-segment patch rendering (`tools/patch-render.mjs` + `tools/compile-beats.mjs`), style setup, and default editing workflow. Read it before you act on "start", "edit this", a dropped or new video, notes on a draft, or anything about the user's general style or rules.
- **`conventional-commits`** (`.agents/skills/conventional-commits/SKILL.md`): Format commit messages using the Conventional Commits 1.0.0 specification whenever asked to commit changes.

## Surgical Partial-Segment Revisions (Save ~90% of Tokens & Render Time)

Whenever the user asks to tweak a specific timestamp or beat on an existing render (e.g., *"at 0:12 make the zoom-in faster"*), do **not** re-render the full video:
1. Update the target beat in `beats.json` (and run `node tools/compile-beats.mjs kit/video-projects/<slug>`) or edit that beat in `index.html`.
2. Render and splice **only** the affected time slice:
   ```bash
   node tools/patch-render.mjs kit/video-projects/<slug> --from <startSec> --to <endSec> --base outbox/<slug>-v1.mp4 --out outbox/<slug>-v2.mp4
   ```

## Autonomous Execution & Stopping Contract

When running automated or parallel video editing tasks:
1. Complete all planned pipeline stages: asset initialization, transcript cuts, composition, audio mastering, and outbox render.
2. Verify output via `VERIFY.md` and self-checks.
3. **TERMINATION RULE**: Once the primary deliverable (e.g., Draft v1 rendered to outbox) is complete:
   - Output a concise markdown summary of the rendered file path and duration.
   - Print `TASK COMPLETED`.
   - **DO NOT** ask open-ended conversational questions (e.g., "Trim to 42s or keep 52.9s?").
   - **DO NOT** solicit confirmation or propose unsolicited revisions or extra render passes.
   - Stop execution immediately so parallel batch runs conclude cleanly.
