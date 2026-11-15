# Chatterbox Turbo

Chatterbox Turbo generates English speech locally from a reference voice. It accepts
up to 500 characters per take, including expressive tags such as `[chuckle]`
and `[laugh]`. Its output includes Resemble's inaudible PerTh watermark.
Resemble AI retired the project in August 2026. The code and weights are available
under MIT. [Upstream project](https://github.com/resemble-ai/chatterbox)
· [Turbo model](https://huggingface.co/ResembleAI/chatterbox-turbo)

## Install on the machine running the engine

From the Synkinema checkout, create a separate Python 3.12 environment. The
weights take about 3 GB, plus space for PyTorch and the other runtime dependencies.

```sh
CHATTERBOX_VENV="$HOME/.local/share/synkinema/chatterbox-venv"
python3.12 -m venv "$CHATTERBOX_VENV"
"$CHATTERBOX_VENV/bin/python" -m pip install \
  'chatterbox-tts==0.1.7' 'resemble-perth==1.0.1' 'setuptools==80.9.0'

export SYNKINEMA_CHATTERBOX_DIR="$PWD/.data/models/chatterbox-turbo"
export SYNKINEMA_CHATTERBOX_PYTHON="$CHATTERBOX_VENV/bin/python"
mkdir -p "$SYNKINEMA_CHATTERBOX_DIR/voices"
"$CHATTERBOX_VENV/bin/hf" download ResembleAI/chatterbox-turbo \
  ve.safetensors t3_turbo_v1.safetensors s3gen_meanflow.safetensors \
  added_tokens.json merges.txt special_tokens_map.json tokenizer_config.json vocab.json \
  --revision 749d1c1a46eb10492095d68fbcf55691ccf137cd \
  --local-dir "$SYNKINEMA_CHATTERBOX_DIR/model"
```

The setuptools pin keeps the published PerTh watermarker compatible with this
runtime. [PerTh compatibility fix](https://github.com/resemble-ai/Perth/pull/11)

Put a clean, roughly ten-second Supertonic M1 take in `voices/whyzy.wav` to
keep the Whyzy voice recognizable. The provider accepts PCM WAV references over
5 and up to 30 seconds long, with a 10 MiB limit. The filename stem becomes the
voice ID and accepts letters, numbers, underscores and hyphens. Keep reference
files in this server-only directory. To convert an existing take:

```sh
ffmpeg -i m1-take.wav -t 10 -ac 1 -ar 24000 -c:a pcm_s16le \
  "$SYNKINEMA_CHATTERBOX_DIR/voices/whyzy.wav"
```

Restart the native engine with these variables and select **Script → Voice
settings → Chatterbox Turbo**. Pick the reference and generate a line. The engine
uses CPU inference, works offline after setup, and loads the model for each
uncached take. Studio and MCP continue to use their existing generation workflows.

The stock Docker image ships without this runtime. Use the same setup inside
a custom engine image with a Linux Python 3.12 environment and model/reference
paths visible to the container, or run the command below on macOS and import
the WAV into Studio or the reel script.

## Compare a take outside the engine

```sh
printf '%s\n' 'The Moon pulls on the ocean, but the Sun helps too [chuckle].' |
  "$SYNKINEMA_CHATTERBOX_PYTHON" -I apps/server/synkinema/chatterbox_tts.py \
    "$SYNKINEMA_CHATTERBOX_DIR/model" "$SYNKINEMA_CHATTERBOX_DIR/voices/whyzy.wav" \
    ./chatterbox-take.wav
```

Try the same English line with Supertonic M1 and Chatterbox Turbo. Keep Whyzy’s
“🤖 Narrated with an AI voice” disclosure in the published caption for either take.
