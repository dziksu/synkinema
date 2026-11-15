"""Optional Chatterbox Turbo runtime, isolated from Synkinema's dependencies."""

import argparse
import io
import os
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

PROVIDER = "chatterbox"
MODEL = "chatterbox-turbo"
REVISION = "749d1c1a46eb10492095d68fbcf55691ccf137cd"
VERSION = "0.1.7"
LICENSE_URL = f"https://huggingface.co/ResembleAI/chatterbox-turbo/tree/{REVISION}"
INPUT_LIMIT = 500
MODEL_FILES = (
    "ve.safetensors",
    "t3_turbo_v1.safetensors",
    "s3gen_meanflow.safetensors",
    "added_tokens.json",
    "merges.txt",
    "special_tokens_map.json",
    "tokenizer_config.json",
    "vocab.json",
)
REFERENCE_LIMIT_BYTES = 10 * 1024**2
VOICE_ID = re.compile(r"[a-zA-Z0-9_-]{1,80}")


def valid_reference(stream):
    try:
        with wave.open(stream, "rb") as wav:
            rate = wav.getframerate()
            return rate > 0 and 5 * rate < wav.getnframes() <= 30 * rate
    except (EOFError, ValueError, wave.Error):
        return False


class Chatterbox:
    def __init__(self, root: Path):
        directory = Path(os.environ.get("SYNKINEMA_CHATTERBOX_DIR") or root / "models" / MODEL).expanduser()
        self.model = directory / "model"
        self.references = directory / "voices"
        python = os.environ.get("SYNKINEMA_CHATTERBOX_PYTHON")
        self.python = Path(python).expanduser() if python else None
        self.runtime_ready = False

    def voice_files(self):
        return {
            path.stem: path
            for path in sorted(self.references.glob("*.wav"))
            if VOICE_ID.fullmatch(path.stem) and not path.is_symlink() and path.is_file()
        }

    def read_reference(self, voice_id):
        path = self.voice_files().get(voice_id)
        if path is not None:
            try:
                with path.open("rb") as stream:
                    reference = stream.read(REFERENCE_LIMIT_BYTES + 1)
                if len(reference) <= REFERENCE_LIMIT_BYTES and valid_reference(io.BytesIO(reference)):
                    return reference
            except OSError:
                pass
        raise ValueError("Select a configured Chatterbox reference (PCM WAV, over 5 and up to 30 seconds)")

    def unavailable_reason(self):
        if not self.python or not self.python.is_absolute() or not self.python.is_file():
            return (
                "Set SYNKINEMA_CHATTERBOX_PYTHON to the Chatterbox virtual environment's Python executable."
            )
        if not all((self.model / name).is_file() for name in MODEL_FILES):
            return "Install the pinned Chatterbox Turbo model in the server's Chatterbox model directory."
        if not self.runtime_ready:
            try:
                subprocess.run(
                    [
                        str(self.python),
                        "-I",
                        "-c",
                        (
                            "from importlib.metadata import version\n"
                            "from importlib.util import find_spec\n"
                            "import sys\n"
                            "sys.exit(version('chatterbox-tts') != sys.argv[1] or not find_spec('pkg_resources'))"
                        ),
                        VERSION,
                    ],
                    check=True,
                    timeout=5,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                self.runtime_ready = True
            except (OSError, subprocess.SubprocessError):
                return f"Install chatterbox-tts=={VERSION} and its compatible PerTh setup in the virtual environment."
        return None

    def status(self):
        voices = []
        for voice_id, path in self.voice_files().items():
            try:
                with path.open("rb") as stream:
                    if path.stat().st_size <= REFERENCE_LIMIT_BYTES and valid_reference(stream):
                        voices.append({"id": voice_id, "name": voice_id})
            except OSError:
                continue
        reason = self.unavailable_reason()
        if reason is None and not voices:
            reason = "Add a reference voice WAV to the server's Chatterbox voices directory."
        return {
            "id": PROVIDER,
            "name": "Chatterbox Turbo",
            "local": True,
            "configured": reason is None,
            "input_limit": INPUT_LIMIT,
            "model_id": MODEL,
            "languages": [{"id": "en", "name": "English"}],
            "voices": voices,
            "reason": reason,
            "license_url": LICENSE_URL,
            "upstream_archived": True,
        }

    def generate(self, text: str, reference: bytes, output: Path):
        if reason := self.unavailable_reason():
            raise ValueError(reason)
        with tempfile.TemporaryDirectory(prefix="chatterbox-", dir=output.parent) as directory:
            reference_path = Path(directory) / "reference.wav"
            reference_path.write_bytes(reference)
            try:
                subprocess.run(
                    [str(self.python), "-I", __file__, str(self.model), str(reference_path), str(output)],
                    input=text,
                    encoding="utf-8",
                    check=True,
                    timeout=300,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except subprocess.TimeoutExpired as exc:
                raise ValueError("Chatterbox generation timed out; try a shorter line") from exc
            except (OSError, subprocess.CalledProcessError) as exc:
                raise ValueError(
                    "Chatterbox synthesis failed; check the runtime, model and reference WAV"
                ) from exc


def main():
    parser = argparse.ArgumentParser(description="Generate a watermarked Turbo take from text on stdin.")
    parser.add_argument("model", type=Path)
    parser.add_argument("reference", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    text = sys.stdin.read(INPUT_LIMIT + 1).strip()
    if not text or len(text) > INPUT_LIMIT:
        parser.error(f"Enter 1–{INPUT_LIMIT} characters of English text on stdin.")

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    import numpy as np
    import soundfile
    from chatterbox.tts_turbo import ChatterboxTurboTTS

    model = ChatterboxTurboTTS.from_local(args.model.resolve(), device="cpu")
    waveform = model.generate(text, audio_prompt_path=str(args.reference)).squeeze(0).detach().cpu().numpy()
    if not waveform.size or not np.isfinite(waveform).all() or not np.any(np.abs(waveform) > 0.0001):
        raise ValueError("Chatterbox returned empty or invalid audio")
    soundfile.write(args.output, waveform, model.sr, format="WAV", subtype="PCM_16")


if __name__ == "__main__":
    main()
