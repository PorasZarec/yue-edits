"""100% Local word timestamps with faster-whisper. Prints [{text, start, end}] as JSON.

Called by tools/transcribe.mjs. Uses CUDA GPU when available, otherwise int8 on CPU.
"""
import json
import sys

from faster_whisper import WhisperModel

video = sys.argv[1]
requested_model = sys.argv[2] if len(sys.argv) > 2 else "turbo"


def load_model(device, compute_type):
    try:
        return WhisperModel(requested_model, device=device, compute_type=compute_type)
    except Exception:
        if requested_model != "small":
            return WhisperModel("small", device=device, compute_type=compute_type)
        raise


def transcribe(device, compute_type):
    model = load_model(device, compute_type)
    segments, _ = model.transcribe(video, word_timestamps=True, vad_filter=True)
    return [
        {"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for s in segments
        for w in (s.words or [])
    ]


try:
    words = transcribe("cuda", "int8_float16")
except Exception as e:
    print(f"GPU unavailable ({e}); using CPU int8", file=sys.stderr)
    words = transcribe("cpu", "int8")

print(json.dumps(words))
