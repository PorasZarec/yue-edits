---
name: face-track
description: Standalone facial-landmark video tracking and auto-reframe skill (/face-track or "use face-track"). Uses the MIT-licensed OpenCV YuNet ONNX 5-landmark detector to track the Middle of the Eyebrows (glabella, default) or the Nose Tip (nose), supports Smooth Camera Follow (AutoFlip deadzone + EMA glide) and Tight Lock-On Stabilization (--mode lock-on), detects Out-of-Frame and Edge-Clip events with 3-tier recovery (coast <0.8s, wide zoom >=0.8s while speaking, auto-cut when silent + out of frame), and outputs a full-screen 1080x1920 speaker-focused video (with chin-safe lower-third captions, --clean pure video, or --debug crosshair HUD).
---

Claude Code only reads skills from `.claude/skills/`. The skill itself lives at the shared
Agent Skills path so every agent uses the same file: read
`.agents/skills/face-track/SKILL.md` now and follow it.
