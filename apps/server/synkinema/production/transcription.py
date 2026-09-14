"""Pinned offline recognition and honest reference alignment (not forced transcription)."""

import difflib
import importlib.util
import json
import sys
import unicodedata
from pathlib import Path

from .contracts import Transcript, WordTiming

MODELS = {
    "tiny.en": ("Systran/faster-whisper-tiny.en", "0d3d19a32d3338f10357c0889762bd8d64bbdeba"),
    "tiny": ("Systran/faster-whisper-tiny", "d90ca5fe260221311c53c58e660288d3deb8d356"),
}
FILES = ["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"]


def status(root):
    runtime = importlib.util.find_spec("faster_whisper") is not None
    return [
        {
            "model": name,
            "repository": repo,
            "revision": rev,
            "runtime_available": runtime,
            "installed": all((root / "models" / "transcriber" / name / f).is_file() for f in FILES),
            "english_only": name.endswith(".en"),
            "license": "MIT",
            "install_task": {"type": "install_transcriber", "model": name},
        }
        for name, (repo, rev) in MODELS.items()
    ]


def normalize(word):
    return "".join(c for c in unicodedata.normalize("NFKD", word.casefold()) if c.isalnum())


def align(words, reference, language, model):
    recognized = " ".join(w.word for w in words)
    result = Transcript(
        language=language,
        model=model,
        model_revision=MODELS[model][1],
        text=recognized,
        words=words,
        speech_end_ms=words[-1].end_ms if words else 0,
        reference_text=reference,
    )
    if not words:
        result.warnings.append("No speech recognized; no caption timing was invented.")
        return result
    if reference is None:
        return result
    authored = reference.split()
    matcher = difflib.SequenceMatcher(
        a=[normalize(w) for w in authored], b=[normalize(w.word) for w in words], autojunk=False
    )
    result.match_ratio = round(matcher.ratio(), 4)
    if result.match_ratio < 0.65:
        result.warnings.append(
            "Reference mismatch: alignment refused. Check the recording/text before composing."
        )
        return result
    starts, matched = {0: words[0].start_ms, len(authored): words[-1].end_ms}, set()
    for block in matcher.get_matching_blocks():
        for i in range(block.size):
            starts[block.a + i] = words[block.b + i].start_ms
            matched.add(block.a + i)
    times = []
    for i in range(len(authored) + 1):
        lo = max(n for n in starts if n <= i)
        hi = min(n for n in starts if n >= i)
        times.append(
            starts[i] if i in starts else round(starts[lo] + (starts[hi] - starts[lo]) * (i - lo) / (hi - lo))
        )
    for i, word in enumerate(authored):
        result.aligned_words.append(
            WordTiming(
                word=word,
                start_ms=times[i],
                end_ms=max(times[i] + 1, times[i + 1]),
                estimated=i not in matched,
            )
        )
    if len(matched) != len(authored):
        result.warnings.append(
            "Some authored words use interpolated timing; estimated=true marks them. Inspect names and mismatches."
        )
    return result


def recognize(model_path, media_path, language, model_name):
    from faster_whisper import WhisperModel

    model = WhisperModel(
        str(model_path), device="cpu", compute_type="int8", cpu_threads=2, local_files_only=True
    )
    segments, _ = model.transcribe(
        str(media_path),
        language=language,
        beam_size=5,
        word_timestamps=True,
        vad_filter=False,
        condition_on_previous_text=False,
    )
    words = []
    for segment in segments:
        for w in segment.words:
            words.append(
                {
                    "word": w.word.strip(),
                    "start_ms": max(0, round(w.start * 1000)),
                    "end_ms": max(1, round(w.end * 1000)),
                    "probability": w.probability,
                }
            )
    return words


if __name__ == "__main__":
    request = json.loads(Path(sys.argv[1]).read_text())
    print(
        json.dumps(
            recognize(request["model_path"], request["media_path"], request["language"], request["model"]),
            ensure_ascii=False,
        )
    )
