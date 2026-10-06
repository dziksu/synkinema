"""Exercise the speech decoder without downloading a transcription model."""

import wave

import numpy as np
import pytest


@pytest.mark.parametrize("split_stereo", [False, True])
def test_faster_whisper_decodes_with_pinned_pyav(tmp_path, split_stereo):
    decoder = pytest.importorskip("faster_whisper.audio")
    sample_rate = 48000
    positions = np.arange(sample_rate // 2)
    samples = (12000 * np.sin(2 * np.pi * 440 * positions / sample_rate)).astype("<i2")
    path = tmp_path / "tone.wav"
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(samples.tobytes())

    decoded = decoder.decode_audio(str(path), sampling_rate=16000, split_stereo=split_stereo)
    channels = decoded if split_stereo else (decoded,)
    assert len(channels) == (2 if split_stereo else 1)
    for channel in channels:
        assert channel.dtype == np.float32
        assert channel.shape == (8000,)
        assert np.isfinite(channel).all()
        assert np.abs(channel).max() > 0.1
