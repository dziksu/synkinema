"""Original geometric identity and deterministic, speech-free sound design."""

import json
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)
RATE = 48000
RNG = np.random.default_rng(20260914)


def save_sound(name, signal):
    stereo = np.column_stack((signal, signal * 0.97))
    data = np.int16(np.clip(stereo, -1, 1) * 32767)
    with wave.open(str(ASSETS / name), "wb") as file:
        file.setnchannels(2)
        file.setsampwidth(2)
        file.setframerate(RATE)
        file.writeframes(data.tobytes())


def noise(seconds, scale=0.045):
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    source = RNG.normal(0, 1, n)
    source = np.convolve(source, np.ones(18) / 18, mode="same")
    envelope = np.sin(np.pi * np.arange(n) / n) ** 2
    return t, source * scale * envelope


def impact(seconds, frequency, level):
    t = np.arange(int(seconds * RATE)) / RATE
    sig = sum(
        amp * np.sin(2 * np.pi * frequency * ratio * t) * np.exp(-decay * t)
        for ratio, amp, decay in [(1, 1, 15), (2.71, 0.32, 23), (4.13, 0.16, 32)]
    )
    sig *= level * np.minimum(t / 0.003, 1)
    sig += RNG.normal(0, 0.013, len(t)) * np.exp(-100 * t)
    return sig


save_sound("01-slide.wav", noise(1.6, 0.11)[1])
save_sound("02-rim-tap.wav", impact(0.55, 590, 0.20))
t, sig = noise(5.8, 0.07)
sig += 0.012 * np.sin(2 * np.pi * (170 * t + 11 * t**2)) * np.sin(np.pi * t / 5.8) ** 2
save_sound("03-turn.wav", sig)
t, sig = noise(3.7, 0.13)
sig += 0.020 * np.sin(2 * np.pi * (580 * t - 35 * t**2)) * np.sin(np.pi * t / 3.7) ** 2
save_sound("04-through.wav", sig)
save_sound("05-tray-tap.wav", impact(0.7, 310, 0.17))
save_sound("06-settle.wav", impact(0.8, 470, 0.13))
t = np.arange(int(1.35 * RATE)) / RATE
sig = sum(0.018 * np.sin(2 * np.pi * f * t) * np.exp(-3.8 * t) for f in [880, 1320, 1760])
sig *= np.minimum(t / 0.012, 1)
save_sound("07-resolve.wav", sig)

# Rasterize our own vector mark at 4x. No stock or generated bitmap artwork.
scale = 4
im = Image.new("RGB", (512 * scale, 512 * scale), "#1e353c")
d = ImageDraw.Draw(im)


def coords(values):
    return tuple(round(v * scale) for v in values)


d.ellipse(coords((130, 130, 382, 382)), outline="#ece8d9", width=31 * scale)
bar = Image.new("RGBA", im.size)
bd = ImageDraw.Draw(bar)
bd.rounded_rectangle(coords((126, 224, 386, 288)), radius=32 * scale, fill="#dba04f")
bar = bar.rotate(42, resample=Image.Resampling.BICUBIC)
im.paste(bar, mask=bar.getchannel("A"))
d = ImageDraw.Draw(im)
d.arc(coords((130, 130, 382, 382)), start=5, end=125, fill="#ece8d9", width=31 * scale)
im.resize((512, 512), Image.Resampling.LANCZOS).save(ASSETS / "turnwise-logo.png")

events = [
    ("01-slide.wav", 350, 1600, -3, "Slide toward the opening"),
    ("02-rim-tap.wav", 2150, 550, -4, "Contact with the rim"),
    ("03-turn.wav", 5000, 5800, -2, "Continuous rotation"),
    ("04-through.wav", 13150, 3700, -2, "Pass through the opening"),
    ("05-tray-tap.wav", 16800, 700, -3, "Arrive on the lower tray"),
    ("06-settle.wav", 19650, 800, -4, "Settle sideways"),
    ("07-resolve.wav", 20000, 1350, -3, "Soft resolution accent"),
]
(ROOT / "out" / "sound-events.json").write_text(json.dumps(events, indent=2))
print("Created original logo and seven 48 kHz stereo sound sources.")
