import hashlib
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

TEXT_CACHE_VERSION = "v6"


def probe(path: Path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode:
        raise ValueError("Cannot decode this media file")
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    image = path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
    if video and (not video.get("width") or not video.get("height")):
        raise ValueError("Invalid media dimensions")
    if image:
        try:
            with Image.open(path) as decoded:
                decoded.verify()
        except Exception as exc:
            raise ValueError("Cannot decode image") from exc
    duration = float(data.get("format", {}).get("duration", 0))
    if audio and not video and duration <= 0:
        # MediaRecorder's live WebM files may omit duration in both headers.
        # Decode on the server and measure the actual output timestamps.
        decoded = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-nostdin",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(path),
                "-map",
                "0:a:0",
                "-progress",
                "pipe:1",
                "-nostats",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if decoded.returncode:
            raise ValueError("Cannot decode this audio recording")
        timestamps = [
            int(line.split("=", 1)[1])
            for line in decoded.stdout.splitlines()
            if line.startswith("out_time_us=") and line.split("=", 1)[1].lstrip("-").isdigit()
        ]
        duration = max(timestamps, default=0) / 1_000_000
        if duration <= 0:
            raise ValueError("Audio recording has no decodable duration")
    return {
        "kind": "image" if image and video else "video" if video else "audio" if audio else None,
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "duration_ms": round(duration * 1000) if not image else None,
        "has_audio": bool(audio),
        "audio_duration_ms": round(float(audio.get("duration", duration)) * 1000) if audio else None,
        "codec": (video or audio or {}).get("codec_name"),
        "size": path.stat().st_size,
    }


def make_thumbnail(source, output):
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-vf",
            "scale=480:-2",
            str(output),
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )


def font(size, bold=False):
    choices = [
        os.environ.get("SYNKINEMA_FONT", ""),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
        if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for choice in choices:
        if choice and Path(choice).is_file():
            return ImageFont.truetype(choice, size)
    return ImageFont.load_default(size=size)


def wrapped(draw, text, font, width):
    lines = []
    for paragraph in text.splitlines():
        line = ""
        for word in paragraph.split():
            proposed = f"{line} {word}".strip()
            if draw.textlength(proposed, font=font) > width and line:
                lines.append(line)
                line = word
            else:
                line = proposed
        lines.append(line)
    return lines


def text_cache_name(clip, width, height, version=TEXT_CACHE_VERSION):
    key = hashlib.sha256((clip.model_dump_json() + f"{width}x{height}-text-{version}").encode()).hexdigest()
    return f"text-{key}.png"


def cached_text_layer(clip, width, height, directory):
    """One caption rasterizer for Studio and FFmpeg, with atomic cache publication."""
    output = Path(directory) / text_cache_name(clip, width, height)
    if output.is_file():
        return output
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".png", delete=False) as tmp:
        temporary = Path(tmp.name)
    try:
        text_layer(clip, width, height, temporary)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return output


def text_layer(clip, width, height, output):
    im = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    foreground = []

    def draw_text(position, value, **kwargs):
        if value.strip():
            foreground.append(
                d.textbbox(position, value, font=kwargs["font"], stroke_width=kwargs.get("stroke_width", 0))
            )
        d.text(position, value, **kwargs)

    def save_caption():
        # Keep hit-test geometry beside the exact raster, excluding the full-frame contrast wash.
        bounds = None
        if foreground:
            left = max(0, math.floor(min(b[0] for b in foreground)))
            top = max(0, math.floor(min(b[1] for b in foreground)))
            right = min(width, math.ceil(max(b[2] for b in foreground)))
            bottom = min(height, math.ceil(max(b[3] for b in foreground)))
            if right > left and bottom > top:
                bounds = {"left": left, "top": top, "width": right - left, "height": bottom - top}
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("caption_bounds", json.dumps(bounds))
        raw = None
        if foreground:
            x0 = math.floor(min(b[0] for b in foreground))
            y0 = math.floor(min(b[1] for b in foreground))
            raw = {
                "left": x0,
                "top": y0,
                "width": math.ceil(max(b[2] for b in foreground)) - x0,
                "height": math.ceil(max(b[3] for b in foreground)) - y0,
            }
        metadata.add_text("caption_unclipped_bounds", json.dumps(raw))
        im.save(output, pnginfo=metadata)

    if clip.shape:
        p = clip.placement
        box = Image.new("RGBA", (max(1, round(width * p.width)), max(1, round(height * p.height))))
        bd = ImageDraw.Draw(box)
        bounds = (0, 0, box.width - 1, box.height - 1)
        if clip.shape == "ellipse":
            bd.ellipse(bounds, fill=clip.color)
        else:
            bd.rectangle(bounds, fill=clip.color)
        if clip.transform.rotation:
            box = box.rotate(-clip.transform.rotation, expand=True, resample=Image.Resampling.BICUBIC)
        im.alpha_composite(box, (round(width * p.x - box.width / 2), round(height * p.y - box.height / 2)))
        im.save(output)
        return output
    scale = width / 1080
    size = max(1, round(clip.font_size * scale))
    f = font(size, True)
    small = font(max(1, round(38 * scale)))
    text_x = 0.09 if clip.text_auto_center else clip.text_x
    block_width = width * min(0.82, 0.98 - text_x)
    lines = wrapped(d, clip.text, f, block_width)
    line_height = size * 1.14
    y = height * clip.text_y
    subtitle_lines = wrapped(d, clip.subtitle, small, block_width)
    block_height = len(lines) * line_height + (
        len(subtitle_lines) * 40 * scale + 32 * scale if clip.subtitle else 0
    )
    y = min(y, height * 0.88 - block_height)
    x = round(width * text_x)
    alignment = "center" if clip.text_auto_center else clip.text_align
    if alignment == "auto":
        alignment = "center" if clip.caption_style in ("bold", "boxed") else "left"

    def aligned_offset(content_width):
        if clip.text_auto_center:
            return (width - content_width) / 2
        remainder = block_width - content_width
        return x + (remainder / 2 if alignment == "center" else remainder if alignment == "right" else 0)

    def aligned_x(line, line_font):
        if clip.text_auto_center:
            left, _, right, _ = d.textbbox((0, 0), line, font=line_font)
            return (width - (right - left)) / 2 - left
        return aligned_offset(d.textlength(line, font=line_font))

    if clip.caption_style != "editorial":
        pad = max(2, round(20 * scale))

        for line in lines:
            xx = aligned_x(line, f)
            if clip.caption_style == "boxed":
                bounds = d.textbbox((xx, y), line, font=f)
                foreground.append(
                    (bounds[0] - pad, bounds[1] - pad / 2, bounds[2] + pad + 1, bounds[3] + pad / 2 + 1)
                )
                d.rounded_rectangle(
                    (bounds[0] - pad, bounds[1] - pad / 2, bounds[2] + pad, bounds[3] + pad / 2),
                    radius=pad / 2,
                    fill=(8, 12, 15, 220),
                )
            draw_text(
                (xx, y),
                line,
                font=f,
                fill=clip.color if clip.caption_style == "bold" else "white",
                stroke_width=max(1, round((5 if clip.caption_style == "bold" else 1) * scale)),
                stroke_fill=(0, 0, 0, 255),
            )
            y += line_height
        if clip.subtitle:
            y += 22 * scale
            for line in subtitle_lines:
                draw_text(
                    (aligned_x(line, small), y),
                    line,
                    font=small,
                    fill=clip.color,
                    stroke_width=max(1, round(scale)),
                    stroke_fill="black",
                )
                y += 40 * scale
        save_caption()
        return output
    # A top caption darkens only its own band, leaving the animal visible below.
    if clip.text_y < 0.4:
        top, bottom = y - height * 0.10, y + block_height + height * 0.09
        for yy in range(max(0, round(top)), min(height, round(bottom))):
            edge = min((yy - top) / (height * 0.1), (bottom - yy) / (height * 0.09), 1)
            d.line((0, yy, width, yy), fill=(5, 12, 12, round(max(0, edge) * 145)))
    else:
        for yy in range(max(0, round(y - height * 0.12)), height):
            alpha = int(min(190, max(0, (yy - y + height * 0.12) / (height * 0.3) * 190)))
            d.line((0, yy, width, yy), fill=(5, 12, 12, alpha))
    dash_x = aligned_offset(56 * scale)
    d.rounded_rectangle(
        (dash_x, y - 28 * scale, dash_x + 56 * scale, y - 20 * scale), radius=4 * scale, fill=clip.color
    )
    foreground.append((dash_x, y - 28 * scale, dash_x + 56 * scale + 1, y - 20 * scale + 1))
    for line in lines:
        draw_text(
            (aligned_x(line, f), y),
            line,
            font=f,
            fill="white",
            stroke_width=max(1, round(scale)),
            stroke_fill=(0, 0, 0, 70),
        )
        y += line_height
    if clip.subtitle:
        y += 22 * scale
        for line in subtitle_lines:
            draw_text((aligned_x(line, small), y), line, font=small, fill=clip.color)
            y += 40 * scale
    save_caption()
    return output


def caption_bounds(path):
    """Read layout without decoding image pixels or repeating font measurement."""
    with Image.open(path) as image:
        return json.loads(image.info.get("caption_bounds", "null"))
