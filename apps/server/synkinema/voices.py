"""Local Supertonic + optional BYOK ElevenLabs. Credentials stay on the server."""

import asyncio
import hashlib
import os
import re
from typing import Literal

import httpx
from pydantic import ConfigDict, Field, model_validator

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
        description="Text to speak, in the explicitly selected language. Supertonic limit: 1000 characters; ElevenLabs: 5000.",
    )
    voice_id: str = Field(
        pattern=r"^[a-zA-Z0-9_-]{1,80}$",
        description="Supertonic preset F1–F5 or M1–M5, or an ElevenLabs account voice ID.",
    )
    model_id: str | None = Field(
        None,
        pattern=r"^[a-zA-Z0-9_-]{1,80}$",
        description="Omit for the selected provider's default: supertonic-3 or eleven_multilingual_v2.",
    )
    stability: float = Field(
        0.5, ge=0, le=1, description="ElevenLabs only. Leave at the default for Supertonic."
    )
    speed: float = Field(
        1, ge=0.7, le=2, description="Speech speed multiplier. Supertonic: 0.7–2.0; ElevenLabs: 0.7–1.2."
    )
    provider: Literal["elevenlabs", "supertonic"] = Field(
        "elevenlabs",
        description="Legacy default remains ElevenLabs. Choose supertonic explicitly for offline CPU synthesis.",
    )
    language: Language | None = Field(
        None,
        description="Required for Supertonic: exactly one supported ISO code. No auto/na fallback and no translation or language detection. Omit for ElevenLabs.",
    )
    steps: int = Field(
        8,
        ge=4,
        le=16,
        description="Supertonic inference steps; more steps cost CPU time. Leave at 8 for ElevenLabs.",
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
        excluded = (
            {"project_id"}
            if request.provider == "supertonic"
            else {"provider", "language", "steps", "project_id"}
        )
        digest = hashlib.sha256(request.model_dump_json(exclude=excluded).encode()).hexdigest()
        source = (
            f"supertonic-3@{REVISION}:{request.voice_id}:{digest}"
            if request.provider == "supertonic"
            else f"elevenlabs:{request.voice_id}:{digest}"
        )
        async with self.lock:
            cached = next(
                (a for a in self.service.assets(project_id=request.project_id) if a["source"] == source), None
            )
            if cached:
                return {"asset": cached, "cached": True}
            if request.provider == "supertonic":
                path = self.service.store.path(f"uploads/tts-{digest}.wav")

                def synthesize_and_import():
                    self.local.generate(request, path)
                    return self.service.import_file(
                        path,
                        request.text[:55] + ".wav",
                        [
                            "voiceover",
                            "tts",
                            "supertonic-3",
                            "ai-generated",
                            request.language,
                            request.voice_id,
                        ],
                        source,
                        f"AI-generated audio; Supertonic 3 / OpenRAIL-M: {LICENSE_URL}",
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
                    request.text[:55] + ".mp3",
                    ["voiceover", "tts", request.voice_id],
                    source,
                    "ElevenLabs account terms",
                    request.project_id,
                )
            finally:
                path.unlink(missing_ok=True)
            return {"asset": asset, "cached": False}
