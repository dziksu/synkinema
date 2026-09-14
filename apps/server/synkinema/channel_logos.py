"""Small, sanitized local channel artwork, independent of timeline media."""

import hashlib
import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import Field

from .models import Model, uid

MAX_LOGO_BYTES = 5 * 1024 * 1024


class ChannelLogo(Model):
    id: str = Field(description="SHA-256 of the sanitized PNG; assign to ChannelInput.logo_id.")
    url: str = Field(description="Local /media/channel-logos/*.png preview URL.")
    width: int = Field(ge=1, le=512, description="Decoded output width in pixels.")
    height: int = Field(ge=1, le=512, description="Decoded output height in pixels.")


def import_logo(store, data: bytes):
    if not data or len(data) > MAX_LOGO_BYTES:
        raise ValueError("Logo must be a nonempty PNG, JPEG or WebP image up to 5 MiB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"}:
                    raise ValueError("Use a PNG, JPEG or WebP logo; SVG is not supported")
                if source.width * source.height > 16_000_000 or getattr(source, "n_frames", 1) != 1:
                    raise ValueError("Use a still logo with at most 16 million pixels")
                image = ImageOps.exif_transpose(source).convert("RGBA")
                image.thumbnail((512, 512), Image.Resampling.LANCZOS)
                image.info.clear()
                output = io.BytesIO()
                image.save(output, format="PNG")
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ValueError("Cannot decode this logo; use a valid PNG, JPEG or WebP image") from exc
    content = output.getvalue()
    logo_id = hashlib.sha256(content).hexdigest()
    path = store.path(f"channel-logos/{logo_id}.png")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temporary = path.with_name(f"{uid()}.tmp")
        try:
            temporary.write_bytes(content)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    return ChannelLogo(
        id=logo_id, url=f"/media/channel-logos/{logo_id}.png", width=image.width, height=image.height
    )
