"""Offline quality/timing pass on locally generated voice takes; no transcription service."""

import difflib
import json
import re
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
model = WhisperModel(
    "tiny.en",
    device="cpu",
    compute_type="int8",
    cpu_threads=2,
    download_root="/tmp/synkinema-reel-asr-model",
    local_files_only=True,
)
state = json.loads((ROOT / "out/manifest.json").read_text())
results = {}
for key, take in state["takes"].items():
    segments, info = model.transcribe(
        take["path"], language="en", word_timestamps=True, beam_size=3, condition_on_previous_text=False
    )
    words = []
    for segment in segments:
        words.extend({"word": w.word.strip(), "start": w.start, "end": w.end} for w in segment.words)
    reference = take["text"].split()

    def normal(s):
        return re.sub("[^a-z0-9]", "", s.lower().replace("é", "e"))

    matcher = difflib.SequenceMatcher(a=[normal(w) for w in reference], b=[normal(w["word"]) for w in words])
    points = {}
    for block in matcher.get_matching_blocks():
        for i in range(block.size):
            points[block.a + i] = words[block.b + i]["start"]
    points[len(reference)] = words[-1]["end"]
    if 0 not in points:
        points[0] = 0.0
    # Interpolate only unmatched transcript words; captions retain the exact authored script.
    aligned = []
    for i, word in enumerate(reference):
        lo = max(n for n in points if n <= i)
        hi = min(n for n in points if n >= i)
        start = points[i] if i in points else points[lo] + (points[hi] - points[lo]) * (i - lo) / (hi - lo)
        aligned.append({"word": word, "start": round(start, 3)})
    results[key] = {
        "recognized": " ".join(w["word"] for w in words),
        "words": words,
        "aligned_script": aligned,
        "speech_end": words[-1]["end"],
        "match_ratio": round(matcher.ratio(), 3),
    }
    print(key, results[key]["match_ratio"], results[key]["recognized"], flush=True)
    (ROOT / "out/voice-alignment.json").write_text(json.dumps(results, indent=2))
