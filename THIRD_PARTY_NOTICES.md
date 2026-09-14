# Third-party components

Synkinema source code is MIT. This does not relicense bundled dependencies or demo media.

- React, Vite, TypeScript, Tailwind, Zustand, TanStack Query, Radix, react-dropzone and
  Lucide: see each installed package's LICENSE (MIT/ISC/Apache as applicable).
- FastAPI, Pydantic, SQLAlchemy, MCP SDK and Uvicorn: see upstream license notices.
- NumPy and Pillow retain their BSD-style / HPND licenses.
- Supertonic SDK 1.3.1 is MIT; ONNX Runtime, SoundFile and Hugging Face Hub retain
  their own included dependency notices. The **Supertonic 3 weights are OpenRAIL-M,
  not MIT**. They are installed separately from the Docker image into the data
  volume, with their complete LICENSE preserved. Pinned upstream model:
  https://huggingface.co/supertone-oss-archive/supertonic-3/tree/aafc6e32416a594460b32413efc49d7fe4ce6d46
  License and use restrictions (including clear disclosure of machine-generated outputs):
  https://huggingface.co/supertone-oss-archive/supertonic-3/blob/aafc6e32416a594460b32413efc49d7fe4ce6d46/LICENSE
  Preserve this license and its restrictions when redistributing the model or
  making it available through a service. Upstream was archived September 9, 2026.
- FFmpeg installed by Debian in the image includes GPL components such as libx264.
  FFmpeg is invoked as an independent executable. The Docker distribution is not MIT-only.
  Configuration and version: `docker run --rm --entrypoint ffmpeg synkinema:local -version`.
  Upstream sources: https://ffmpeg.org/download.html and https://sources.debian.org/src/ffmpeg/.
- DejaVu fonts retain the Bitstream Vera / DejaVu font notices included by Debian.
- Demo photographs: see `examples/polish-wildlife/CREDITS.md`; they are not MIT.
- The demo voice is generated locally with the installed macOS Zosia voice as a testing
  fixture. It is separate from the software license. Replace with an appropriately
  licensed recording or TTS take when preparing a public production release.

- faster-whisper and CTranslate2 retain their MIT licenses; PyAV and Hugging Face
  Tokenizers retain their upstream notices. Optional Whisper tiny.en/tiny weights
  are MIT, downloaded separately at pinned Systran model revisions documented by
  get_production_capabilities. Sources: https://github.com/SYSTRAN/faster-whisper,
  https://github.com/OpenNMT/CTranslate2, https://github.com/PyAV-Org/PyAV,
  https://github.com/huggingface/tokenizers, and
  https://huggingface.co/Systran/faster-whisper-tiny.en.
