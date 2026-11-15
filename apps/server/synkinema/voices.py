"""Local speech providers and optional BYOK ElevenLabs."""

import asyncio
import hashlib
import os
import re
import unicodedata
from typing import Literal

import httpx
from pydantic import ConfigDict, Field, model_validator

from . import chatterbox_tts
from .models import Model
from .supertonic_tts import INPUT_LIMIT, LICENSE_URL, MODEL, REVISION, VOICES, Language, Supertonic


class VoiceRequest(Model):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "provider": "supertonic",
                    "text": "Żółw błotny potrzebuje naszej ochrony.",
                    "language": "pl",
                    "voice_id": "F1",
                    "steps": 8,
                    "speed": 1.0,
                },
                {
                    "provider": "chatterbox",
                    "text": "The Moon had a little help [chuckle].",
                    "voice_id": "whyzy",
                    "language": "en",
                },
                {
                    "provider": "elevenlabs",
                    "text": "Narration text",
                    "voice_id": "ACCOUNT_VOICE_ID",
                    "speed": 1.0,
                },
            ]
        }
    )
    text: str = Field(
        min_length=1,
        max_length=5000,
        description="Text to speak. Limits in characters: Supertonic 1000, Chatterbox Turbo 500 (English, allows tags like [chuckle]), ElevenLabs 5000.",
    )
    voice_id: str = Field(
        pattern=r"^[a-zA-Z0-9_-]{1,80}$",
        description="Supertonic preset F1–F5 or M1–M5, configured Chatterbox reference ID, or ElevenLabs account voice ID. Discover IDs through voice status.",
    )
    model_id: str | None = Field(
        None,
        pattern=r"^[a-zA-Z0-9_-]{1,80}$",
        description="Omit for the selected provider's default: supertonic-3, chatterbox-turbo or eleven_multilingual_v2.",
    )
    stability: float = Field(
        0.5, ge=0, le=1, description="ElevenLabs only. Leave at the default for local providers."
    )
    speed: float = Field(
        1,
        ge=0.7,
        le=2,
        description="Speech speed multiplier. Supertonic: 0.7–2.0; Chatterbox: fixed at 1.0; ElevenLabs: 0.7–1.2.",
    )
    provider: Literal["elevenlabs", "supertonic", "chatterbox"] = Field(
        "elevenlabs",
        description="Legacy default remains ElevenLabs. Choose supertonic or chatterbox explicitly for offline CPU synthesis.",
    )
    language: Language | None = Field(
        None,
        description="For Supertonic, select a supported ISO code. Chatterbox accepts only en and defaults to en. Omit for ElevenLabs. No language detection or translation.",
    )
    steps: int = Field(
        8,
        ge=4,
        le=16,
        description="Supertonic inference steps; more steps cost CPU time. Leave at 8 for the other providers.",
    )
    project_id: str | None = Field(
        None,
        min_length=1,
        max_length=80,
        description="Import into this project's private media; omit for shared Voiceovers. Never inserts timeline clips or changes revision.",
    )

    @model_validator(mode="after")
    def provider_settings(self):
        if not self.text.strip():
            raise ValueError("Speech text must not be blank")
        if self.provider == "supertonic":
            if self.language is None:
                raise ValueError("Select a supported language for Supertonic; automatic fallback is disabled")
            if self.voice_id not in VOICES:
                raise ValueError("Supertonic voice_id must be F1–F5 or M1–M5")
            if self.model_id not in (None, MODEL):
                raise ValueError("Supertonic supports only the pinned supertonic-3 model")
            if len(self.text) > INPUT_LIMIT:
                raise ValueError(f"Supertonic supports at most {INPUT_LIMIT} characters per take")
            if self.stability != 0.5:
                raise ValueError("stability applies only to ElevenLabs")
            if re.search(r"</?[a-z]{2}>", self.text, re.IGNORECASE):
                raise ValueError("Select the language field instead of embedding language tags in the text")
            self.model_id = MODEL
        elif self.provider == chatterbox_tts.PROVIDER:
            if self.language not in (None, "en"):
                raise ValueError("Chatterbox Turbo supports only English (en)")
            if self.model_id not in (None, chatterbox_tts.MODEL):
                raise ValueError("Chatterbox supports only the pinned chatterbox-turbo model")
            if len(self.text) > chatterbox_tts.INPUT_LIMIT:
                raise ValueError(
                    f"Chatterbox supports at most {chatterbox_tts.INPUT_LIMIT} characters per take"
                )
            if self.speed != 1 or self.stability != 0.5 or self.steps != 8:
                raise ValueError("Leave speed, stability and steps at their defaults for Chatterbox Turbo")
            self.language = "en"
            self.model_id = chatterbox_tts.MODEL
        else:
            if self.language is not None or self.steps != 8:
                raise ValueError("language and steps apply only to Supertonic")
            if self.speed > 1.2:
                raise ValueError("ElevenLabs speed must be between 0.7 and 1.2")
            self.model_id = self.model_id or "eleven_multilingual_v2"
        return self


class Voices:
    def __init__(self, service, transport=None, local=None):
        self.service = service
        self.transport = transport
        self.local = local or Supertonic(service.store.root)
        self.chatterbox = chatterbox_tts.Chatterbox(service.store.root)
        self.lock = asyncio.Lock()

    def status(self):
        configured = bool(os.environ.get("ELEVENLABS_API_KEY"))
        local = self.local.status()
        return {
            # Keep legacy fields meaningful for existing ElevenLabs clients.
            "provider": "elevenlabs",
            "configured": configured,
            "input_limit": 5000,
            "import_supported": True,
            "default_provider": "supertonic" if local["configured"] else "elevenlabs",
            "providers": [
                local,
                self.chatterbox.status(),
                {
                    "id": "elevenlabs",
                    "name": "ElevenLabs",
                    "local": False,
                    "configured": configured,
                    "input_limit": 5000,
                    "model_id": "eleven_multilingual_v2",
                    "languages": [],
                    "voices": [],
                    "reason": None
                    if configured
                    else "Set ELEVENLABS_API_KEY on the server, or import a recording.",
                    "license_url": "https://elevenlabs.io/terms-of-use",
                    "upstream_archived": False,
                },
            ],
        }

    async def generate(self, request: VoiceRequest):
        # Preserve existing ElevenLabs cache identities; scope only changes where the asset is listed.
        excluded = {"project_id"}
        provenance = f"supertonic-3@{REVISION}"
        if request.provider == "elevenlabs":
            excluded.update({"provider", "language", "steps"})
            provenance = "elevenlabs"
        identity = hashlib.sha256(request.model_dump_json(exclude=excluded).encode())
        reference = None
        if request.provider == chatterbox_tts.PROVIDER:
            reference = await asyncio.to_thread(self.chatterbox.read_reference, request.voice_id)
            provenance = f"{chatterbox_tts.MODEL}@{chatterbox_tts.REVISION}"
            identity.update(f":{provenance}:{chatterbox_tts.VERSION}:".encode())
            identity.update(reference)
        digest = identity.hexdigest()
        source = f"{provenance}:{request.voice_id}:{digest}"
        # Readable, portable filenames with a stable suffix for different takes/settings.
        excerpt = (
            re.sub(r"[^\w]+", "-", unicodedata.normalize("NFKC", request.text), flags=re.UNICODE)
            .strip("-_")[:60]
            .rstrip("-_")
            .lower()
            or "narration"
        )
        label = f"voice-{request.language or 'auto'}-{request.voice_id.lower()}-{excerpt}-{digest[:8]}"
        async with self.lock:
            cached = next(
                (a for a in self.service.assets(project_id=request.project_id) if a["source"] == source), None
            )
            if cached:
                return {"asset": cached, "cached": True}
            if request.provider != "elevenlabs":
                path = self.service.store.path(f"uploads/tts-{digest}.wav")

                def synthesize_and_import():
                    if reference is None:
                        self.local.generate(request, path)
                        model = MODEL
                        license_note = f"Supertonic 3 / OpenRAIL-M: {LICENSE_URL}"
                    else:
                        self.chatterbox.generate(request.text, reference, path)
                        model = chatterbox_tts.MODEL
                        license_note = f"Chatterbox Turbo / MIT: {chatterbox_tts.LICENSE_URL}"
                    return self.service.import_file(
                        path,
                        label + ".wav",
                        [
                            "voiceover",
                            "tts",
                            model,
                            "ai-generated",
                            request.language,
                            request.voice_id,
                        ],
                        source,
                        f"AI-generated audio; {license_note}",
                        request.project_id,
                    )

                try:
                    # Keep synthesis/import serialized and the input alive even if the HTTP caller disconnects.
                    work = asyncio.create_task(asyncio.to_thread(synthesize_and_import))
                    try:
                        asset = await asyncio.shield(work)
                    except asyncio.CancelledError:
                        try:
                            await work
                        finally:
                            raise
                finally:
                    path.unlink(missing_ok=True)
                return {"asset": asset, "cached": False}
            key = os.environ.get("ELEVENLABS_API_KEY")
            if not key:
                raise ValueError("Set ELEVENLABS_API_KEY on the server, or import a voice recording")
            async with httpx.AsyncClient(timeout=120, transport=self.transport) as client:
                response = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{request.voice_id}",
                    params={"output_format": "mp3_44100_128"},
                    headers={"xi-api-key": key},
                    json={
                        "text": request.text,
                        "model_id": request.model_id,
                        "voice_settings": {
                            "stability": request.stability,
                            "similarity_boost": 0.75,
                            "speed": request.speed,
                        },
                    },
                )
            if response.is_error:
                raise ValueError(
                    f"TTS provider returned HTTP {response.status_code}; check credentials and quota"
                )
            if len(response.content) > 40 * 1024**2:
                raise ValueError("TTS response too large")
            path = self.service.store.path(f"uploads/tts-{digest}.mp3")
            try:
                path.write_bytes(response.content)
                asset = await asyncio.to_thread(
                    self.service.import_file,
                    path,
                    label + ".mp3",
                    ["voiceover", "tts", request.voice_id],
                    source,
                    "ElevenLabs account terms",
                    request.project_id,
                )
            finally:
                path.unlink(missing_ok=True)
            return {"asset": asset, "cached": False}
