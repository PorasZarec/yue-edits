---
name: split-pop
description: Edit a talking-head video into a Split-Pop vertical short (1080x1920, 30fps) with a 3-mode dynamic layout (Split-Screen with Katana MGRT graphics & 0:00 hook, Full-Screen Speaker Close-Up with YuNet face tracking & zero ceiling negative space, and ~10% Full-Screen Higgsfield Katana MGRT takeovers with zero redundant subtitles), permanently locked y=1120px seam captions across both Split & Full-Screen Speaker modes, simultaneous card+icon entrances, >=0.8s beat hold buffer, Reels/TikTok safe-zone compliance, and surgical partial-segment re-rendering.
---

# Split-Pop Video Editor (`split-pop` — v4)

Transform a raw vertical talking-head clip into a **Split-Pop** vertical short (`1080x1920`, `30fps`) modeled after high-retention tech/creator reels and Higgsfield AI's **Katana** MGRT motion graphics engine.

## Non-Negotiable Visual & Pacing Rules (v4)

1. **Hook-First Trim & Opening Split-Screen Katana Motion Hook (`0:00` Rule):**
   - Inspect `assets/raw.json` word timestamps first and cut dead leading filler words (`"Alright so"`, `"Um"`, `"So"`, throat-clearing) at the very start of `cut.mp4` so frame `0` begins immediately on the core hook phrase (e.g., *"I've now been..."*).
   - **Open at `0:00` with Split-Screen Katana Motion Graphics (`#top-stage` active + Speaker below):** Every video MUST open at `0:00` in Split-Screen (`SPLIT_WIDE` / `SPLIT_TIGHT`) with high-energy Katana-style motion graphics, cliparts, and badges animating in `#top-stage` during the very first sentence while the speaker talks in the bottom panel (`y = 1120..1920`).
   - **Trim Trailing Dead Pauses Before Full-Screen Takeovers (No Caption Spoilers):** When cutting from the speaker to a `FULLSCREEN_GRAPHICS` takeover, trim any trailing pause `> 0.12s` at the end of the preceding `keep` segment in `cut.mp4`, and set the previous caption chunk's `cEnd <= takeoverStart - 0.05s`. Never display the next scene's caption on the speaker's face during a pause before the graphics cut — let the clipart/MGRT graphic lead the viewer's eye!

2. **3-Mode Dynamic Layout Schedule (Never Static):**
   - **Mode A — Split-Screen (`SPLIT_WIDE` / `SPLIT_TIGHT`, ~65–70% of runtime):**
     - Top `58%` (`y = 0..1120px`): `#top-stage` dark grid stage (`#0b0d12`) with floating cards, prompt boxes, clipart badges, and kinetic typography centered around the top-stage focal point (`y ≈ 520–560px`).
     - Bottom `42%` (`y = 1120..1920px`): Speaker's talking-head shot tracked continuously via `tools/track-head.mjs` (`glabella` centered at `x = 540px`, `y ≈ 1355–1370px`, forehead `>= 1168px` so the locked `y = 1120px` seam caption never hits the eyebrows/eyes).
   - **Mode B — Full-Screen Speaker Close-Up (`FULLSCREEN_ZOOM`, ~20–25% of runtime):**
     - **NEVER put a black cover bar (`#fs-bed`) beneath the speaker's face** to hide old burned-in captions, and **NEVER leave awkward car-ceiling/wall negative space above the speaker's head**.
     - Scale and position `#face-wrapper` (`scale ≈ 1.95–2.05`) so old burned-in subtitles below `cleanMaxY` are pushed completely off the bottom of the `1920px` canvas (`>= 1920px`), the top of the speaker's hair sits near the top of the frame (`0px` ceiling negative space), and the **speaker's eyes (`glabella`) sit clearly above the locked `y = 1120px` seam caption** (`glabella` at `y ≈ 810–820px`).
   - **Mode C — Full-Screen MGRT / Higgsfield Katana Takeover (`FULLSCREEN_GRAPHICS`, ~10% of runtime, 2–4 beats per 60s):**
     - Hide the speaker completely and take over the full `1080x1920` canvas (`#fs-mg-stage`) with oversized Twemoji/Lucide clipart badges, bold kinetic hyper-text (`110–148px`), and counter/list cards.
     - **Occupy the Vertical Midpoint (`y = 960px`) First:** Every full-screen takeover (`#fs-mg-stage`) MUST anchor its primary visual cluster dead-center on the vertical midpoint of the `1080x1920` canvas (`y = 960px`) using `justify-content: center; align-items: center; transform-origin: 540px 960px`. Never leave empty negative space in the middle of the frame.
     - **Reels / TikTok / Shorts UI Safe Zone (`x = 120..960px`):** All `.fg-scene` containers and `.kt-line` rows MUST stay within `x = 120..960px` (`padding: 80px 120px; max-width: 840px; width: 100%`). Never let full-screen kinetic text extend into the right-hand `120px` gutter (`x = 960..1080px`) where Instagram Reels, TikTok, and YouTube Shorts render the Heart, Comment, Share, and Repost icons.
     - **NO Subtitles / Captions During Full-Screen MGRT (`#captions-stage` Hidden):** Whenever `FULLSCREEN_GRAPHICS` is active, set `#captions-stage` to `opacity: 0` (and omit `CAPTION_CHUNKS` during those windows). Instead, animate **all** spoken words/phrases directly inside the full-screen Katana motion graphics (`#fs-mg-stage`) timed to the speaker's voice so the viewer's eye stays locked on the center graphics without redundant bottom captions.

3. **Continuous YuNet 5-Landmark Face Tracking (`tools/track-head.mjs` / `face-track`):**
   - Always run `node tools/track-head.mjs kit/video-projects/<slug>/assets/cut.mp4 --crop-bottom <ratio>` after cutting the video.
   - `tools/track-head.mjs` runs the MIT-licensed OpenCV Zoo **YuNet ONNX 5-landmark detector** (`tools/face_landmark_worker.py`) to track the speaker's exact `glabella` (midpoint between the eyebrows), `nose`, `forehead_y`, and `chin_y` across the entire video.
   - Apply the per-timestamp `keyframes[]` from `assets/cut.head-track.json` inside `index.html` so the bottom speaker panel (`SPLIT_WIDE` / `SPLIT_TIGHT`) and full-screen speaker mode (`FULLSCREEN_ZOOM`) smoothly follow the speaker's head movements (`glabella` stays locked to `x = 540px`) instead of using a static crop.

4. **Permanently Locked Seam Captions (`y = 1120px`, `capY: 0` Always) & Typography Discipline:**
   - **Permanently Locked at `y = 1120px` (`capY: 0` in Both Split & Full-Screen Speaker Modes):** `#captions-stage` is positioned at `top: 1120px; height: 0; align-items: center; y: 0` so the vertical midpoint of the single-line caption text sits dead-center on the `y = 1120px` seam boundary (`#seam-line`).
   - **Never Move `#captions-stage` Down to the Chin in `FULLSCREEN_ZOOM`:** Keep `capY: 0` (`y: 0` on `#captions-stage`) during both `SPLIT_WIDE` / `SPLIT_TIGHT` and `FULLSCREEN_ZOOM` so viewers' eyes stay locked on a single consistent reading line (`y = 1120px`) across the entire video. It is completely fine for the locked `y = 1120px` caption to sit across the speaker's lower jaw/chin in `FULLSCREEN_ZOOM` as long as the speaker's eyes (`glabella` near `y = 815px`) are clearly above it.
   - **Uniform Letter-Spacing (`letter-spacing: 0em`):** Use uniform `letter-spacing: 0em` across all captions (`.cap-word`), cards (`.mg-card`), and Katana hyper-text (`.katana-hyper-text`). Never mix negative tracking (`-0.03em`) with wide tracking (`0.14em`) on main display/caption text.
   - **NO Outer Strokes:** Never apply `-webkit-text-stroke` or paint-order outlines on `.cap-word`. Use clean multi-layered drop-shadows (`text-shadow: 0 4px 12px rgba(0,0,0,0.88), 0 12px 32px rgba(0,0,0,0.68)`) plus `#seam-bridge` (`y = 1060..1180`) for contrast.

5. **Colloquial Transcription & Word-Timing Audit:**
   - **Colloquial Speech Accuracy (`"gonna"`, `"wanna"`, `"gotta"`):** Always verify Whisper's transcript against how the speaker actually pronounces casual contractions. When the speaker says *"gonna"* (`"I'm gonna tell you"`), write `"GONNA"` in `CAPTION_CHUNKS` instead of formalizing it into `"GOING TO"`.
   - **Word-Timing Audit (No Silence-Bleed & No Inverted Durations):**
     - Whisper frequently stretches the first word after a pause backward across the silence gap (e.g., a word spoken at `34.63s` given `start: 34.50s` before a jump-cut). Always clamp `w.start` so no word begins before its actual vocal onset (`w.end - w.start <= 0.45s` for normal words) and never bleeds across a `keeps[]` cut boundary.
     - Validate every word in `CAPTION_CHUNKS` so `w.end >= w.start + 0.08` (never subtract a fixed offset from `chunk.end` that makes `w.end < w.start`).

6. **Simultaneous Card + Clipart Entrance & Minimum `>= 0.8s` Beat Hold Buffer:**
   - **Never Leave Empty Icon Holes Inside Cards:** Every `.mg-card` or `.mg-row` and its primary `.clipart-badge` icon MUST enter together (`iconStart = cardStart + 0.06s`). Never pop a card on screen with a blank/invisible left icon slot waiting `1–2s` for a later keyword; if a later spoken word relates to that card, trigger a secondary emphasis pulse (`scale: 1 -> 1.18 -> 1`) on the already-visible icon at that keyword's timestamp.
   - **Minimum `>= 0.8s` Reading & Animation Hold Buffer Before Scene Cuts:** Every card, list row (e.g., `#b7-r3` `"THE PHONE"`), or clipart animation in a beat MUST finish its entrance animation at least `0.8s–1.0s` before the scene cuts (`bOff` / `scheduleLayoutMode`). If the last row's spoken trigger happens near a cut, either extend the Split-Screen beat across the next spoken clause so viewers have time to process all items, or trigger the final row `0.35s` earlier.

7. **Dual-Layer Graphics Camera Rig:**
   - **Layer 1 (`#mg-ambient-zoom`) — Continuous Subtle Push:** Every Split-Screen beat runs a continuous slow push (`scale: 1.0 -> 1.07`, `ease: "none"`) across its entire duration so the graphic panel is never frozen.
   - **Layer 2 (`#mg-camera`) — Sharp Track & Focus on Popping Inputs:** Whenever a card, badge, or button pops in, keyframe a sharp `expo.out` (`0.20s–0.24s`) camera zoom (`1.16x–1.25x`) and pan (`x, y` clamped to `±110px` horizontal, `±85px` vertical so text stays 100% readable inside safe margins) before settling back (`power2.inOut`).

---

## Step-by-Step Workflow

1. **Create Workspace:**
   - Copy `raw.mp4` into `kit/video-projects/<slug>/assets/raw.mp4`.
2. **Transcribe & Frame-Exact Jump-Cut (`cut.mp4` + `cut.json`):**
   - Run `node tools/transcribe.mjs kit/video-projects/<slug>/assets/raw.mp4`.
   - Remove leading filler words at the very start (e.g. *"Alright so"*), trim trailing dead pauses (`> 0.12s`) before `FULLSCREEN_GRAPHICS` takeovers, cut pauses `> 0.30s` and retakes in one frame-exact FFmpeg pass to `assets/cut.mp4`, and write retimed words to `assets/cut.json`.
   - Audit colloquial contractions (`"gonna"` vs `"going to"`) and clamp any Whisper word `start` timestamps that bleed across pauses.
3. **Run YuNet 5-Landmark Face Tracker (`tools/track-head.mjs`):**
   - Run `node tools/track-head.mjs kit/video-projects/<slug>/assets/cut.mp4 --crop-bottom <ratio>`.
   - Embed the output `keyframes[]` and `gsapFaceModes` (`SPLIT_WIDE`, `SPLIT_TIGHT`, `FULLSCREEN_ZOOM`, `FULLSCREEN_GRAPHICS` — all with `capY: 0`) into `index.html` so `#face-wrapper` continuously tracks the speaker's `glabella` across every second of the video.
4. **Prepare Clipart/Icons & SFX:**
   - Run `node tools/synth-sfx.mjs` and `node tools/fetch-assets.mjs`.
5. **Assemble Composition from `tools/templates/split-pop/index.html`:**
   - Open at `0:00` in Split-Screen Mode with Katana motion graphics in `#top-stage` during the first sentence before cutting to the first `FULLSCREEN_GRAPHICS` takeover.
   - Schedule ~65–70% Split-Screen, ~20–25% Full-Screen Speaker (with `scale ≈ 1.95–2.05`, `glabella` at `y ≈ 815px` clearly above the locked `y = 1120px` caption, zero ceiling negative space), and ~10% Full-Screen Katana MGRT Takeover (`FULLSCREEN_GRAPHICS` with `#captions-stage` hidden, all spoken words animated inside `#fs-mg-stage` at the midpoint `y = 960px`, and safe-zone width `<= 840px` / `x = 120..960px`).
   - Verify that every card's icon enters simultaneously with its card (`cardStart + 0.06s`), every beat's final element holds for `>= 0.8s` before cutting, `letter-spacing: 0em` is uniform, and captions stay permanently locked at `y = 1120px` (`capY: 0`) with clean drop-shadows and **no outer stroke**.
6. **Lint, Verify Frames & Render Initial Draft:**
   - Run `npx hyperframes lint` and `npx hyperframes render`, inspect frames for all 3 modes, copy to `outbox/<slug>-v1.mp4`, and run `node tools/compile-beats.mjs kit/video-projects/<slug> --extract`.
7. **Surgical Partial-Segment Revisions (Token & Render Time Saver):**
   - Whenever the user asks to adjust a specific timestamp or beat, edit only that beat and run:
     ```bash
     node tools/patch-render.mjs kit/video-projects/<slug> --from <startSec> --to <endSec> --base outbox/<slug>-v1.mp4 --out outbox/<slug>-v2.mp4
     ```
