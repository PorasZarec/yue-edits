---
name: face-track
description: Standalone facial-landmark video tracking and auto-reframe skill (/face-track or "use face-track"). Uses the MIT-licensed OpenCV YuNet ONNX 5-landmark detector to track the Middle of the Eyebrows (glabella, default) or the Nose Tip (nose), supports Smooth Camera Follow (AutoFlip deadzone + EMA glide) and Tight Lock-On Stabilization (--mode lock-on), detects Out-of-Frame and Edge-Clip events with 3-tier recovery (coast <0.8s, wide zoom >=0.8s while speaking, auto-cut when silent + out of frame), and outputs a full-screen 1080x1920 speaker-focused video (with chin-safe lower-third captions, --clean pure video, or --debug crosshair HUD).
---

# `face-track`: Standalone Facial Landmark Tracking & Auto-Reframe Skill

When the user invokes `/face-track`, `$face-track`, or asks to edit/track a video using `face-track`, follow every rule in this file strictly. Run commands from the repository root (`yue-edits/`) unless a step specifies `kit/`.

---

## 1. Open-Source MIT Landmark Engine (`YuNet ONNX`)

`face-track` runs `tools/face-landmark-tracker.mjs`, powered by OpenCV Zoo's **MIT-licensed `face_detection_yunet_2023mar.onnx`** model (`tools/models/face_detection_yunet_2023mar.onnx`).

On every sampled frame, it detects 5 exact facial landmarks (`right_eye`, `left_eye`, `nose_tip`, `right_mouth`, `left_mouth`) and computes:
1. **Middle of the Eyebrows (`--anchor glabella`, Default):**
   - Computed from the midpoint between the eyes shifted upward along the nose-to-eye bridge vector.
   - Best for locking viewer eye-contact at a constant vertical height (`x = 540px, y = 720px` on the `1080x1920` canvas) even when the speaker nods or gestures.
   - Automatically shifts to `nose` on strong sideways profile turns (`|yaw_ratio| > 0.38`) so the speaker gets natural look-room.
2. **Nose Tip (`--anchor nose`):**
   - Tracks the exact tip of the nose (`landmark #2` in YuNet).
   - Use whenever the user says *"track the nose"*, *"lock on nose"*, or for dynamic head-turn tracking.
3. **Chin Safe-Line (`chin_y` & `recommended_caption_y`):**
   - Computes the exact lower jaw/chin boundary in `1080x1920` coordinates so lower-third captions are placed safely below the chin (`y >= chin_y + 110px`).

---

## 2. Camera Tracking Modes (`smooth` vs. `lock-on`)

- **`--mode smooth` (Default — AutoFlip Deadzone + Smooth Glide):**
  - Holds the virtual camera steady inside a `±4.5%` center deadzone so tiny micro-movements while speaking don't shake the frame.
  - Smoothly glides (`EMA` damping) when the speaker leans or moves outside the deadzone.
- **`--mode lock-on` (Tight Subject-Lock Stabilization):**
  - Triggered when the user asks for *"lock-on"*, *"pin the eyebrows"*, *"pin the nose"*, or *"stabilize on the face"*.
  - Pins the chosen landmark (`glabella` or `nose`) to `(x = 540px, y = 720px)` on every keyframe (`--sample-fps 24` or `30`) so the speaker's eyebrows or nose stay locked dead-center while the background shifts around them.

---

## 3. Smart 3-Tier Out-of-Frame & Edge-Clip Recovery

`tools/face-landmark-tracker.mjs` automatically classifies every moment the character leaves the frame or touches the border and prints an **Out-of-Frame & Edge-Clip Report**:

| State | Condition | Automatic Action |
| :--- | :--- | :--- |
| **`TRACKING`** | Face detected cleanly inside bounds | Tracks `glabella` (mid-eyebrows) or `nose` normally. |
| **`EDGE_WARNING`** | Face bbox touches within `3.5%` of raw frame border | Clamps crop window to prevent black bars and logs the exact timestamp in the report. |
| **`TIER1_COAST_HOLD`** | Face lost briefly (`< 0.8s`, e.g., quick head duck or hand gesture) | Freezes/coasts the camera at the last known good `(x, y, scale)` position so the camera never jerks wildly. |
| **`TIER2_WIDE_ZOOM_FALLBACK`** | Face lost for `>= 0.8s` while the speaker is still talking | Smoothly zooms out toward a wide center shot so the full scene remains visible until the face returns. |
| **`TIER3_AUTO_CUT_SILENT_OOF`** | Face is out of frame (`>= 0.45s`) AND audio is silent | Automatically trims/cuts out the dead out-of-frame segment and logs the cut in the report. |

---

## 4. Visual Output Modes (`default`, `--clean`, `--debug`)

1. **Default Output (Full-Screen `1080x1920` + Chin-Safe Captions):**
   - Full-screen `1080x1920` speaker-focused video with silence/out-of-frame cuts and single-line BOLD UPPERCASE captions positioned safely below `recommended_caption_y` (using `tools/templates/face-track/index.html`).
2. **Pure Face-Tracked Video (`--clean` or when user asks for "no captions / just track"):**
   - Renders the `1080x1920` landmark-tracked & cut MP4 directly via `node tools/face-landmark-tracker.mjs <video> --render-out outbox/<slug>-v1.mp4 --clean` with zero text or overlays.
3. **Diagnostic Landmark Crosshair Preview (`--debug` or when user asks to "show the tracking point / crosshair"):**
   - Renders a `1080x1920` MP4 with the live green face bounding box, cyan eye/mouth dots, a high-contrast Red/Yellow crosshair locked onto the **Glabella (Mid-Eyebrow)** or **Nose**, and a top status banner (`ANCHOR | MODE | STATE`).

---

## 5. Step-by-Step Execution Workflow

1. **Find Source Video:**
   - Pick the video specified by the user or the newest file in `inbox/`. Create `<slug>` from the filename + date.
2. **Run Landmark Tracker & Out-of-Frame Analyzer:**
   - Choose `--anchor glabella` (default) or `--anchor nose`.
   - Choose `--mode smooth` (default) or `--mode lock-on` (use `--sample-fps 24` when in `lock-on` mode).
   - If the source video has old burned-in captions at the bottom, pass `--crop-bottom 0.25`.
   - If the user asked for **`--clean`** (no captions) or **`--debug`** (crosshair HUD), render directly:
     ```bash
     node tools/face-landmark-tracker.mjs <video-path> --anchor glabella --mode smooth --render-out outbox/<slug>-v1.mp4 [--clean | --debug]
     ```
3. **For Default Output (Full-Screen Tracked Video + Chin-Safe Captions):**
   - From `kit/`: run `npm run new-video -- <slug>` and copy the source to `kit/video-projects/<slug>/assets/raw.mp4`.
   - Transcribe with `node tools/transcribe.mjs kit/video-projects/<slug>/assets/raw.mp4` and cut dead air + `TIER3_AUTO_CUT_SILENT_OOF` intervals to `assets/cut.mp4`.
   - Run `node tools/face-landmark-tracker.mjs kit/video-projects/<slug>/assets/cut.mp4 --anchor <glabella|nose> --mode <smooth|lock-on>`.
   - Assemble `kit/video-projects/<slug>/index.html` from `tools/templates/face-track/index.html`, plugging in `keyframes` from `cut.face-track.json` and setting `#captions-stage` top to `summary.recommended_caption_y`.
   - Render to `outbox/<slug>-v1.mp4`.
4. **Report Results to User:**
   - Always share:
     - Which landmark was tracked (`GLABELLA (Mid-Eyebrows)` or `NOSE`) and which mode (`SMOOTH` or `LOCK-ON`).
     - The detection rate (`%`) and any **Out-of-Frame / Edge-Clip** timestamps discovered and how they were handled.
     - The output path in `outbox/`.
