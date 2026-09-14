"""Pinned, offline Supertonic 3 adapter. Installation is an explicit server CLI action."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
from typing import Literal, get_args

import numpy as np

MANIFEST = json.loads(Path(__file__).with_name("supertonic_model.json").read_text())
MODEL = "supertonic-3"
REVISION = MANIFEST["revision"]
Language = Literal[
    "en",
    "ko",
    "ja",
    "ar",
    "bg",
    "cs",
    "da",
    "de",
    "el",
    "es",
    "et",
    "fi",
    "fr",
    "hi",
    "hr",
    "hu",
    "id",
    "it",
    "lt",
    "lv",
    "nl",
    "pl",
    "pt",
    "ro",
    "ru",
    "sk",
    "sl",
    "sv",
    "tr",
    "uk",
    "vi",
]
LANGUAGE_NAMES = dict(
    zip(
        get_args(Language),
        [
            "English",
            "Korean",
            "Japanese",
            "Arabic",
            "Bulgarian",
            "Czech",
            "Danish",
            "German",
            "Greek",
            "Spanish",
            "Estonian",
            "Finnish",
            "French",
            "Hindi",
            "Croatian",
            "Hungarian",
            "Indonesian",
            "Italian",
            "Lithuanian",
            "Latvian",
            "Dutch",
            "Polish",
            "Portuguese",
            "Romanian",
            "Russian",
            "Slovak",
            "Slovenian",
            "Swedish",
            "Turkish",
            "Ukrainian",
            "Vietnamese",
        ],
        strict=True,
    )
)
VOICES = tuple(f"{prefix}{index}" for prefix in ("F", "M") for index in range(1, 6))
INPUT_LIMIT = 1000
LICENSE_URL = f"https://huggingface.co/{MANIFEST['repo']}/blob/{REVISION}/LICENSE"


def model_directory(root=None):
    return Path(
        os.environ.get("SYNKINEMA_SUPERTONIC_DIR")
        or Path(root or os.environ.get("SYNKINEMA_DATA", ".data")) / "models" / MODEL
    ).resolve()


def model_files_ready(directory):
    try:
        return all(
            (directory / name).is_file() and (directory / name).stat().st_size == meta["size"]
            for name, meta in MANIFEST["files"].items()
        )
    except OSError:
        return False


def verify_model(directory):
    for name, meta in MANIFEST["files"].items():
        path = directory / name
        if not path.is_file() or path.stat().st_size != meta["size"]:
            raise ValueError(
                f"Supertonic model missing or incomplete: {name}. Run python -m synkinema.supertonic_tts --install"
            )
        with path.open("rb") as source:
            if "sha256" in meta:
                checksum = hashlib.file_digest(source, "sha256").hexdigest()
            else:
                digest = hashlib.sha1(f"blob {meta['size']}\0".encode())
                digest.update(source.read())
                checksum = digest.hexdigest()
        if checksum != meta.get("sha256", meta.get("git_sha1")):
            raise ValueError(f"Supertonic model checksum mismatch: {name}")


def install(directory):
    from huggingface_hub import snapshot_download

    snapshot_download(
        MANIFEST["repo"],
        revision=REVISION,
        local_dir=str(directory),
        allow_patterns=list(MANIFEST["files"]),
        max_workers=3,
    )
    verify_model(directory)
    return {
        "model": MODEL,
        "revision": REVISION,
        "directory": str(directory),
        "bytes": sum(f["size"] for f in MANIFEST["files"].values()),
    }


class Supertonic:
    def __init__(self, root):
        self.directory = model_directory(root)
        self.engine = None
        self.load_error = None

    def status(self):
        installed = importlib.util.find_spec("supertonic") is not None
        ready = installed and model_files_ready(self.directory)
        return {
            "id": "supertonic",
            "name": "Supertonic 3",
            "local": True,
            "configured": ready and not self.load_error,
            "input_limit": INPUT_LIMIT,
            "model_id": MODEL,
            "languages": [{"id": code, "name": name} for code, name in LANGUAGE_NAMES.items()],
            "voices": [{"id": v, "name": v} for v in VOICES],
            "reason": self.load_error
            or (None if ready else "Install the Supertonic SDK and pinned model on the server."),
            "license_url": LICENSE_URL,
            "upstream_archived": True,
        }

    def generate(self, request, output):
        if self.engine is None:
            try:
                verify_model(self.directory)
                import onnxruntime

                onnxruntime.disable_telemetry_events()
                from supertonic import TTS

                threads = max(1, min(8, int(os.environ.get("SYNKINEMA_TTS_THREADS", "4"))))
                self.engine = TTS(
                    model=MODEL,
                    model_dir=self.directory,
                    auto_download=False,
                    intra_op_num_threads=threads,
                    inter_op_num_threads=1,
                )
                self.load_error = None
            except Exception as exc:
                self.load_error = "Supertonic could not load. Verify the pinned model and server runtime."
                raise ValueError(self.load_error) from exc
        try:
            samples, _duration = self.engine.synthesize(
                request.text,
                voice_style=self.engine.get_voice_style(request.voice_id),
                lang=request.language,
                total_steps=request.steps,
                speed=request.speed,
                verbose=False,
            )
            if not samples.size or not np.isfinite(samples).all() or not np.any(np.abs(samples) > 0.0001):
                raise ValueError("Supertonic returned empty or invalid audio")
            if samples.size / self.engine.sample_rate > 300:
                raise ValueError("Supertonic output exceeds five minutes; split the text into smaller takes")
            self.engine.save_audio(samples, str(output))
        except Exception as exc:
            raise ValueError(
                "Supertonic synthesis failed; check the selected language and try a shorter text."
            ) from exc


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Install/verify the pinned local Supertonic 3 model (~401 MB)."
    )
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--directory", type=Path, default=model_directory())
    args = parser.parse_args()
    if args.install:
        print(json.dumps(install(args.directory)))
    else:
        verify_model(args.directory)
        print(json.dumps({"verified": True, "model": MODEL, "revision": REVISION}))
