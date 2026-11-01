#!/usr/bin/env python3
"""
MIT-Licensed YuNet ONNX Facial Landmark Tracker & Smart Auto-Reframe Worker.
Tracks 5 YuNet landmarks (Right Eye, Left Eye, Nose Tip, Right Mouth, Left Mouth)
and derives the exact Glabella (Middle of the Eyebrows) and Chin Safe-Line.

Implements:
- Anchor selection: 'glabella' (default, mid-eyebrows) or 'nose' (nose tip)
- Tracking modes: 'smooth' (AutoFlip deadzone + EMA glide) or 'lock-on' (pixel-pinned)
- 3-Tier Out-of-Frame Recovery:
    Tier 1 (<0.8s loss): Coast / hold last known good camera position
    Tier 2 (>=0.8s loss while speaking): Smooth zoom-out to wide center frame
    Tier 3 (loss while silent): Mark for auto-cut & report timestamp
- Optional direct 1080x1920 MP4 rendering (--clean or --debug HUD overlay)
"""

import argparse
import json
import math
import os
import subprocess
import sys
import numpy as np
import onnxruntime as ort
import av
from PIL import Image, ImageDraw, ImageFont


def decode_yunet_single_frame(sess, pil_img, orig_w, orig_h, crop_bottom_ratio=0.0, conf_thresh=0.45):
    img640 = pil_img.resize((640, 640), Image.Resampling.BILINEAR)
    arr = np.asarray(img640, dtype=np.float32)[:, :, ::-1]  # RGB -> BGR
    inp = np.transpose(arr, (2, 0, 1))[None, ...]
    outs = dict(zip([o.name for o in sess.get_outputs()], sess.run(None, {"input": inp})))

    max_valid_y = orig_h * (1.0 - crop_bottom_ratio)
    best = None

    for s in (8, 16, 32):
        cls = np.clip(outs[f"cls_{s}"][0, :, 0], 0.0, 1.0)
        obj = np.clip(outs[f"obj_{s}"][0, :, 0], 0.0, 1.0)
        bbox = outs[f"bbox_{s}"][0]
        kps = outs[f"kps_{s}"][0]
        scores = np.sqrt(cls * obj)

        idx = int(np.argmax(scores))
        sc = float(scores[idx])
        if sc < conf_thresh:
            continue

        ws = 640 // s
        r, c = divmod(idx, ws)
        cx = float((c + bbox[idx, 0]) * s * (orig_w / 640.0))
        cy = float((r + bbox[idx, 1]) * s * (orig_h / 640.0))
        bw = float(math.exp(float(bbox[idx, 2])) * s * (orig_w / 640.0))
        bh = float(math.exp(float(bbox[idx, 3])) * s * (orig_h / 640.0))

        if cy > max_valid_y:
            continue

        pts = []
        for k in range(5):
            px = float((c + kps[idx, 2 * k]) * s * (orig_w / 640.0))
            py = float((r + kps[idx, 2 * k + 1]) * s * (orig_h / 640.0))
            pts.append((px, py))

        if best is None or sc > best["score"]:
            re, le, nose, rm, lm = pts
            mid_eyes = ((re[0] + le[0]) * 0.5, (re[1] + le[1]) * 0.5)
            # Glabella (middle of the eyebrows): sits slightly above mid_eyes along the nose->mid_eyes vector
            glabella = (
                mid_eyes[0] + 0.25 * (mid_eyes[0] - nose[0]),
                mid_eyes[1] + 0.25 * (mid_eyes[1] - nose[1]),
            )
            mid_mouth = ((rm[0] + lm[0]) * 0.5, (rm[1] + lm[1]) * 0.5)
            chin_y = min(max_valid_y, mid_mouth[1] + 0.32 * bh)
            forehead_y = max(0.0, glabella[1] - 0.28 * bh)

            # Estimate horizontal yaw ratio (-1 = looking left, +1 = looking right)
            eye_dist = max(1.0, abs(le[0] - re[0]))
            yaw_ratio = (nose[0] - mid_eyes[0]) / (eye_dist * 0.5)

            x1 = cx - bw * 0.5
            y1 = cy - bh * 0.5
            x2 = cx + bw * 0.5
            y2 = cy + bh * 0.5
            edge_margin_x = orig_w * 0.035
            edge_margin_y = orig_h * 0.035
            edge_clip = (
                x1 < edge_margin_x
                or x2 > (orig_w - edge_margin_x)
                or y1 < edge_margin_y
                or y2 > (max_valid_y - edge_margin_y)
            )

            best = {
                "score": round(sc, 4),
                "bbox": [round(x1, 1), round(y1, 1), round(bw, 1), round(bh, 1)],
                "glabella": [round(glabella[0], 1), round(glabella[1], 1)],
                "nose": [round(nose[0], 1), round(nose[1], 1)],
                "right_eye": [round(re[0], 1), round(re[1], 1)],
                "left_eye": [round(le[0], 1), round(le[1], 1)],
                "right_mouth": [round(rm[0], 1), round(rm[1], 1)],
                "left_mouth": [round(lm[0], 1), round(lm[1], 1)],
                "forehead_y": round(forehead_y, 1),
                "chin_y": round(chin_y, 1),
                "yaw_ratio": round(float(yaw_ratio), 3),
                "edge_clip": bool(edge_clip),
            }

    return best


def detect_silence_intervals(video_path, duration):
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats", "-i", video_path,
        "-vn", "-af", "silencedetect=n=-32dB:d=0.35", "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    log = proc.stderr or ""
    starts, ends = [], []
    for line in log.splitlines():
        if "silence_start:" in line:
            try:
                starts.append(float(line.split("silence_start:")[1].strip().split()[0]))
            except Exception:
                pass
        elif "silence_end:" in line:
            try:
                ends.append(float(line.split("silence_end:")[1].strip().split()[0]))
            except Exception:
                pass
    intervals = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else duration
        intervals.append((s, e))
    return intervals


def is_silent_at(t, silence_intervals):
    for s, e in silence_intervals:
        if s <= t <= e:
            return True
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video", help="Input video path")
    parser.add_argument("--model", required=True, help="Path to YuNet ONNX model")
    parser.add_argument("--anchor", choices=["glabella", "nose"], default="glabella")
    parser.add_argument("--mode", choices=["smooth", "lock-on"], default="smooth")
    parser.add_argument("--crop-bottom", type=float, default=0.0)
    parser.add_argument("--zoom", type=float, default=1.35)
    parser.add_argument("--sample-fps", type=float, default=15.0)
    parser.add_argument("--out-json", required=True)
    parser.add_argument("--render-out", default="")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    sess = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
    container = av.open(args.video)
    vstream = container.streams.video[0]
    orig_w = vstream.width
    orig_h = vstream.height
    fps = float(vstream.average_rate or 30.0)
    duration = float(container.duration / av.time_base) if container.duration else float(vstream.duration * vstream.time_base)

    silence_intervals = detect_silence_intervals(args.video, duration)

    # Step 1: Sample frames at sample_fps for landmark tracking
    sample_step = max(1, int(round(fps / args.sample_fps)))
    raw_samples = []

    frame_idx = 0
    for frame in container.decode(video=0):
        if frame_idx % sample_step == 0:
            t = float(frame.pts * vstream.time_base) if frame.pts is not None else (frame_idx / fps)
            pil_img = frame.to_image()
            det = decode_yunet_single_frame(sess, pil_img, orig_w, orig_h, args.crop_bottom)
            raw_samples.append({
                "frame": frame_idx,
                "time": round(t, 3),
                "silent": is_silent_at(t, silence_intervals),
                "detection": det,
            })
        frame_idx += 1
    container.close()

    # Step 2: Classify Out-of-Frame durations and apply 3-Tier Recovery
    # Group consecutive missing-detection samples into loss runs
    n = len(raw_samples)
    i = 0
    oof_events = []
    while i < n:
        if raw_samples[i]["detection"] is None:
            j = i
            while j < n and raw_samples[j]["detection"] is None:
                j += 1
            t_start = raw_samples[i]["time"]
            t_end = raw_samples[j - 1]["time"] + (sample_step / fps)
            loss_dur = round(t_end - t_start, 3)
            all_silent = all(raw_samples[k]["silent"] for k in range(i, j))

            if all_silent and loss_dur >= 0.45:
                tier = "TIER3_AUTO_CUT_SILENT_OOF"
            elif loss_dur < 0.8:
                tier = "TIER1_COAST_HOLD"
            else:
                tier = "TIER2_WIDE_ZOOM_FALLBACK"

            oof_events.append({
                "start": round(t_start, 3),
                "end": round(t_end, 3),
                "duration": loss_dur,
                "silent": all_silent,
                "recovery": tier,
            })
            for k in range(i, j):
                raw_samples[k]["oof_tier"] = tier
            i = j
        else:
            det = raw_samples[i]["detection"]
            if det["edge_clip"]:
                raw_samples[i]["oof_tier"] = "EDGE_WARNING"
                oof_events.append({
                    "start": raw_samples[i]["time"],
                    "end": round(raw_samples[i]["time"] + (sample_step / fps), 3),
                    "duration": round(sample_step / fps, 3),
                    "silent": raw_samples[i]["silent"],
                    "recovery": "EDGE_WARNING",
                })
            else:
                raw_samples[i]["oof_tier"] = "TRACKING"
            i += 1

    # Merge contiguous EDGE_WARNING events for cleaner reporting
    merged_events = []
    for ev in oof_events:
        if (
            merged_events
            and merged_events[-1]["recovery"] == ev["recovery"]
            and abs(ev["start"] - merged_events[-1]["end"]) <= (sample_step / fps) * 1.5
        ):
            merged_events[-1]["end"] = ev["end"]
            merged_events[-1]["duration"] = round(merged_events[-1]["end"] - merged_events[-1]["start"], 3)
        else:
            merged_events.append(ev)

    # Step 3: Solve Camera Path (Anchor: glabella vs nose; Mode: smooth vs lock-on)
    # Target canvas is 1080x1920. We place the tracked anchor at x=540, y=720 (upper-middle eye-line).
    max_valid_h = orig_h * (1.0 - args.crop_bottom)
    default_cx = orig_w * 0.5
    default_cy = max_valid_h * 0.42

    cam_x = default_cx
    cam_y = default_cy
    cam_zoom = args.zoom

    # Deadzone in source pixels (4.5% of frame width/height for smooth mode)
    dz_x = orig_w * 0.045 if args.mode == "smooth" else 0.0
    dz_y = orig_h * 0.045 if args.mode == "smooth" else 0.0
    alpha = 0.22 if args.mode == "smooth" else 0.88  # lock-on tracks tightly

    keyframes = []
    for s in raw_samples:
        det = s["detection"]
        tier = s["oof_tier"]
        active_anchor_name = args.anchor

        if det is not None:
            # Auto-switch to nose on strong profile turn (>0.38 yaw) if default glabella
            if args.anchor == "glabella" and abs(det["yaw_ratio"]) > 0.38:
                active_anchor_name = "nose (profile-turn)"
                target_pt = det["nose"]
            else:
                target_pt = det[args.anchor]

            tx, ty = target_pt[0], target_pt[1]
            if abs(tx - cam_x) > dz_x:
                cam_x = cam_x + alpha * (tx - cam_x)
            if abs(ty - cam_y) > dz_y:
                cam_y = cam_y + alpha * (ty - cam_y)
            cam_zoom = cam_zoom + 0.18 * (args.zoom - cam_zoom)
        else:
            if tier == "TIER1_COAST_HOLD":
                # Hold last known cam_x, cam_y, cam_zoom steady
                pass
            elif tier == "TIER2_WIDE_ZOOM_FALLBACK":
                # Smoothly ease out toward wide center frame
                cam_x = cam_x + 0.15 * (default_cx - cam_x)
                cam_y = cam_y + 0.15 * (default_cy - cam_y)
                cam_zoom = cam_zoom + 0.15 * (1.05 - cam_zoom)

        # Convert source (cam_x, cam_y, cam_zoom) to 1080x1920 HyperFrames #face-wrapper transform
        base_scale = max(1080.0 / orig_w, 1920.0 / max_valid_h) * cam_zoom
        scaled_w = orig_w * base_scale
        scaled_h = max_valid_h * base_scale

        # Place anchor at (540, 720) on the 1080x1920 canvas
        wrap_x = 540.0 - cam_x * base_scale
        wrap_y = 720.0 - cam_y * base_scale

        # Clamp so crop never exposes black bars outside source frame or enters cropped bottom region
        wrap_x = min(0.0, max(1080.0 - scaled_w, wrap_x))
        wrap_y = min(0.0, max(1920.0 - scaled_h, wrap_y))

        # Chin position in 1080x1920 canvas coordinates (for safe lower-third caption placement)
        src_chin_y = det["chin_y"] if det is not None else (cam_y + orig_h * 0.18)
        canvas_chin_y = round(wrap_y + src_chin_y * base_scale)
        safe_caption_y = max(1320, min(1620, canvas_chin_y + 110))

        keyframes.append({
            "time": s["time"],
            "state": tier,
            "anchor_used": active_anchor_name,
            "source_anchor_px": [round(cam_x, 1), round(cam_y, 1)],
            "wrapper": {
                "x": round(wrap_x, 1),
                "y": round(wrap_y, 1),
                "scale": round(base_scale, 4),
            },
            "canvas_chin_y": canvas_chin_y,
            "safe_caption_y": safe_caption_y,
            "landmarks": det,
        })

    # Compute summary stats
    tracked_count = sum(1 for k in keyframes if k["landmarks"] is not None)
    avg_chin_y = int(round(np.median([k["canvas_chin_y"] for k in keyframes]))) if keyframes else 1180
    recommended_caption_y = max(1320, min(1580, avg_chin_y + 110))

    report = {
        "source": os.path.abspath(args.video),
        "model": "face_detection_yunet_2023mar.onnx (MIT License)",
        "meta": {
            "width": orig_w,
            "height": orig_h,
            "fps": round(fps, 2),
            "duration": round(duration, 3),
        },
        "config": {
            "anchor": args.anchor,
            "mode": args.mode,
            "crop_bottom": args.crop_bottom,
            "zoom": args.zoom,
            "sample_fps": args.sample_fps,
        },
        "summary": {
            "total_samples": len(keyframes),
            "face_detected_samples": tracked_count,
            "detection_rate_pct": round((tracked_count / max(1, len(keyframes))) * 100.0, 1),
            "median_canvas_chin_y": avg_chin_y,
            "recommended_caption_y": recommended_caption_y,
            "out_of_frame_or_edge_events": merged_events,
        },
        "keyframes": keyframes,
    }

    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Step 4: Optional Direct Video Render (--render-out for --clean or --debug preview)
    if args.render_out:
        render_tracked_video(args, orig_w, orig_h, fps, max_valid_h, keyframes)


def interpolate_kf(keyframes, t):
    if not keyframes:
        return None
    if t <= keyframes[0]["time"]:
        return keyframes[0]
    if t >= keyframes[-1]["time"]:
        return keyframes[-1]
    lo, hi = 0, len(keyframes) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if keyframes[mid]["time"] <= t:
            lo = mid
        else:
            hi = mid
    k0, k1 = keyframes[lo], keyframes[hi]
    span = max(1e-6, k1["time"] - k0["time"])
    u = (t - k0["time"]) / span
    return {
        "state": k0["state"],
        "anchor_used": k0["anchor_used"],
        "source_anchor_px": [
            k0["source_anchor_px"][0] + u * (k1["source_anchor_px"][0] - k0["source_anchor_px"][0]),
            k0["source_anchor_px"][1] + u * (k1["source_anchor_px"][1] - k0["source_anchor_px"][1]),
        ],
        "wrapper": {
            "x": k0["wrapper"]["x"] + u * (k1["wrapper"]["x"] - k0["wrapper"]["x"]),
            "y": k0["wrapper"]["y"] + u * (k1["wrapper"]["y"] - k0["wrapper"]["y"]),
            "scale": k0["wrapper"]["scale"] + u * (k1["wrapper"]["scale"] - k0["wrapper"]["scale"]),
        },
        "landmarks": k0["landmarks"],
    }


def render_tracked_video(args, orig_w, orig_h, fps, max_valid_h, keyframes):
    temp_video = args.render_out + ".tmp_video.mp4"
    in_container = av.open(args.video)
    vstream = in_container.streams.video[0]

    out_container = av.open(temp_video, mode="w")
    out_stream = out_container.add_stream("libx264", rate=int(round(fps)))
    out_stream.width = 1080
    out_stream.height = 1920
    out_stream.pix_fmt = "yuv420p"
    out_stream.options = {"crf": "18", "preset": "fast"}

    frame_idx = 0
    for frame in in_container.decode(video=0):
        t = float(frame.pts * vstream.time_base) if frame.pts is not None else (frame_idx / fps)
        kf = interpolate_kf(keyframes, t)
        if kf and kf["state"] == "TIER3_AUTO_CUT_SILENT_OOF":
            frame_idx += 1
            continue

        pil_img = frame.to_image()
        scale = kf["wrapper"]["scale"]
        wx = kf["wrapper"]["x"]
        wy = kf["wrapper"]["y"]

        # Crop box in source coordinates corresponding to 1080x1920 window
        crop_w = 1080.0 / scale
        crop_h = 1920.0 / scale
        crop_x1 = max(0.0, min(orig_w - crop_w, -wx / scale))
        crop_y1 = max(0.0, min(max_valid_h - crop_h, -wy / scale))

        cropped = pil_img.crop((crop_x1, crop_y1, crop_x1 + crop_w, crop_y1 + crop_h))
        out_img = cropped.resize((1080, 1920), Image.Resampling.BILINEAR)

        if args.debug:
            draw = ImageDraw.Draw(out_img)
            # Map source coordinates to 1080x1920 canvas
            def to_canvas(pt):
                return ((pt[0] - crop_x1) * scale, (pt[1] - crop_y1) * scale)

            det = kf["landmarks"]
            if det:
                bx, by, bw, bh = det["bbox"]
                p1 = to_canvas((bx, by))
                p2 = to_canvas((bx + bw, by + bh))
                draw.rectangle([p1[0], p1[1], p2[0], p2[1]], outline=(34, 197, 94), width=4)

                # Draw eyes & mouth dots in cyan
                for kname in ("right_eye", "left_eye", "right_mouth", "left_mouth"):
                    px, py = to_canvas(det[kname])
                    draw.ellipse([px - 7, py - 7, px + 7, py + 7], fill=(56, 189, 248))

                # Draw both Glabella and Nose, highlighting the active anchor with a large crosshair
                glab_c = to_canvas(det["glabella"])
                nose_c = to_canvas(det["nose"])
                active_c = glab_c if "glabella" in kf["anchor_used"] else nose_c
                secondary_c = nose_c if "glabella" in kf["anchor_used"] else glab_c

                # Secondary landmark small yellow dot
                draw.ellipse(
                    [secondary_c[0] - 8, secondary_c[1] - 8, secondary_c[0] + 8, secondary_c[1] + 8],
                    outline=(255, 214, 10),
                    width=3,
                )
                # Active landmark crosshair (Red/Yellow high-contrast target)
                ax, ay = active_c
                r = 26
                draw.ellipse([ax - r, ay - r, ax + r, ay + r], outline=(255, 214, 10), width=4)
                draw.line([ax - r - 14, ay, ax + r + 14, ay], fill=(239, 68, 68), width=4)
                draw.line([ax, ay - r - 14, ax, ay + r + 14], fill=(239, 68, 68), width=4)

            # Status HUD Banner at top
            draw.rectangle([40, 40, 1040, 130], fill=(11, 13, 18))
            hud_text = f"ANCHOR: {kf['anchor_used'].upper()}  |  MODE: {args.mode.upper()}  |  STATE: {kf['state']}"
            draw.text((68, 72), hud_text, fill=(255, 214, 10))

        out_frame = av.VideoFrame.from_image(out_img)
        for packet in out_stream.encode(out_frame):
            out_container.mux(packet)

        frame_idx += 1

    for packet in out_stream.encode():
        out_container.mux(packet)

    out_container.close()
    in_container.close()

    # Mux audio from source if no Tier-3 cuts, or copy video
    has_tier3_cuts = any(k["state"] == "TIER3_AUTO_CUT_SILENT_OOF" for k in keyframes)
    if not has_tier3_cuts:
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-i", temp_video, "-i", args.video,
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-map", "0:v:0", "-map", "1:a:0?",
                "-shortest", "-movflags", "+faststart", args.render_out,
            ],
            check=True,
        )
        os.remove(temp_video)
    else:
        os.replace(temp_video, args.render_out)


if __name__ == "__main__":
    main()
