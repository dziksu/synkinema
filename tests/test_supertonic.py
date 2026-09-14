import asyncio
import hashlib
import threading
import wave
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from synkinema import supertonic_tts as model
from synkinema.app import create_app
from synkinema.models import Project
from synkinema.service import Service
from synkinema.storage import Store
from synkinema.voices import VoiceRequest, Voices


def request(**changes):
    return VoiceRequest(
        **{
            "text": "Żółw błotny potrzebuje ochrony.",
            "voice_id": "F1",
            "provider": "supertonic",
            "language": "pl",
        }
        | changes
    )


class FakeLocal:
    def __init__(self):
        self.calls = []

    def generate(self, req, path):
        self.calls.append(req)
        t = np.arange(4410) / 44100
        samples = (np.sin(2 * np.pi * (220 + len(self.calls)) * t) * 3000).astype(np.int16)
        with wave.open(str(path), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(44100)
            out.writeframes(samples.tobytes())


@pytest.fixture
def service(tmp_path):
    instance = Service(Store(tmp_path / "data"))
    yield instance
    instance.store.engine.dispose()


def test_explicit_supported_languages_and_provider_defaults():
    assert len(model.LANGUAGE_NAMES) == 31
    for language in model.LANGUAGE_NAMES:
        assert request(language=language).language == language
    legacy = VoiceRequest(text="Legacy request", voice_id="existing_voice")
    assert legacy.provider == "elevenlabs" and legacy.model_id == "eleven_multilingual_v2"
    assert legacy.model_dump_json(exclude={"provider", "language", "steps", "project_id"}) == (
        '{"text":"Legacy request","voice_id":"existing_voice","model_id":"eleven_multilingual_v2","stability":0.5,"speed":1.0}'
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"language": None},
        {"language": "na"},
        {"language": "auto"},
        {"language": "zh"},
        {"language": "PL"},
        {"voice_id": "F6"},
        {"model_id": "supertonic-2"},
        {"text": "x" * 1001},
        {"text": "   "},
        {"text": "<na>fallback</na>"},
        {"steps": 17},
        {"steps": 3},
        {"speed": 2.1},
        {"stability": 0.8},
        {"provider": "elevenlabs"},
    ],
)
def test_invalid_requests_are_rejected_before_inference(changes):
    with pytest.raises(ValidationError):
        request(**changes)


async def test_concurrent_cache_private_media_and_cache_parameters(service):
    local = FakeLocal()
    voices = Voices(service, local=local)
    project = service.create(Project(name="Speech QA"))
    req = request(project_id=project.id)
    first, second = await asyncio.gather(voices.generate(req), voices.generate(req))
    assert not first["cached"] and second["cached"] and len(local.calls) == 1
    asset = first["asset"]
    assert asset["id"] == second["asset"]["id"]
    assert asset["kind"] == "audio" and asset["duration_ms"] == 100
    assert {"ai-generated", "pl", "F1", "supertonic-3"} <= set(asset["tags"])
    assert "OpenRAIL-M" in asset["license"] and model.REVISION in asset["source"]
    assert service.assets() == [] and len(service.assets(project_id=project.id)) == 1
    assert service.get(project.id).revision == project.revision
    for changes in ({"language": "en"}, {"voice_id": "M1"}, {"speed": 1.2}, {"steps": 12}):
        assert not (await voices.generate(request(project_id=project.id, **changes)))["cached"]
    assert len(local.calls) == 5
    assert not list(service.store.path("uploads").glob("tts-*"))


async def test_failure_leaves_no_playable_asset_or_temporary_file(service):
    def fail(_request, path):
        path.write_bytes(b"partial")
        raise ValueError("Synthesis failed")

    voices = Voices(service, local=SimpleNamespace(generate=fail))
    with pytest.raises(ValueError, match="Synthesis failed"):
        await voices.generate(request())
    assert service.assets() == []
    assert not list(service.store.path("uploads").glob("tts-*"))


async def test_cancelled_client_keeps_import_input_alive_and_serializes_workers(service, monkeypatch):
    local = FakeLocal()
    voices = Voices(service, local=local)
    started, release = threading.Event(), threading.Event()
    original = service.import_file

    def delayed_import(*args):
        started.set()
        assert release.wait(5)
        assert args[0].exists()
        return original(*args)

    monkeypatch.setattr(service, "import_file", delayed_import)
    first = asyncio.create_task(voices.generate(request()))
    assert await asyncio.to_thread(started.wait, 5)
    first.cancel()
    second = asyncio.create_task(voices.generate(request()))
    await asyncio.sleep(0.02)
    assert not second.done() and len(local.calls) == 1
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    result = await second
    assert result["cached"] and len(local.calls) == 1
    assert not list(service.store.path("uploads").glob("tts-*"))


def test_missing_model_status_and_pinned_integrity(tmp_path, monkeypatch):
    monkeypatch.delenv("SYNKINEMA_SUPERTONIC_DIR", raising=False)
    local = model.Supertonic(tmp_path)
    assert not local.status()["configured"]
    with pytest.raises(ValueError, match="could not load"):
        local.generate(request(), tmp_path / "out.wav")
    assert not (tmp_path / "models").exists()  # No implicit download.
    path = tmp_path / "weights.onnx"
    path.write_bytes(b"weights")
    monkeypatch.setitem(
        model.MANIFEST,
        "files",
        {"weights.onnx": {"size": 7, "sha256": hashlib.sha256(b"weights").hexdigest()}},
    )
    model.verify_model(tmp_path)
    path.write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="checksum mismatch"):
        model.verify_model(tmp_path)


def test_adapter_forwards_language_and_quality_and_rejects_bad_audio(tmp_path):
    calls = []

    def synthesize(text, **kwargs):
        calls.append((text, kwargs))
        return np.full((1, 4410), np.nan), 0.1

    local = model.Supertonic(tmp_path)
    local.engine = SimpleNamespace(
        synthesize=synthesize, get_voice_style=lambda voice: voice, sample_rate=44100
    )
    with pytest.raises(ValueError, match="synthesis failed"):
        local.generate(request(voice_id="M2", speed=1.1, steps=12), tmp_path / "bad.wav")
    assert calls[0][1] == {
        "voice_style": "M2",
        "lang": "pl",
        "total_steps": 12,
        "speed": 1.1,
        "verbose": False,
    }
    assert not (tmp_path / "bad.wav").exists()


def test_http_contract_status_and_unsupported_language(tmp_path, monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("SYNKINEMA_SUPERTONIC_DIR", raising=False)
    with TestClient(create_app(tmp_path / "api", start_worker=False)) as client:
        status = client.get("/api/voices/status").json()
        assert not status["configured"]  # Legacy field still describes ElevenLabs.
        local = next(p for p in status["providers"] if p["id"] == "supertonic")
        assert local["local"] and not local["configured"] and local["upstream_archived"]
        assert len(local["languages"]) == 31 and len(local["voices"]) == 10
        for language in (None, "na", "zh", "auto"):
            response = client.post(
                "/api/voices/generate",
                json={"provider": "supertonic", "voice_id": "F1", "text": "Test", "language": language},
            )
            assert response.status_code == 422
        schema = client.get("/api/openapi.json").json()["components"]["schemas"]["VoiceRequest"]
        languages = schema["properties"]["language"]["anyOf"][0]["enum"]
        assert set(languages) == set(model.LANGUAGE_NAMES)
        assert client.get("/api/assets").json() == []

        def rpc(method, params):
            response = client.post(
                "/mcp/",
                headers={"Accept": "application/json, text/event-stream"},
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            )
            assert response.status_code == 200
            return response.json()["result"]

        rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "speech-test", "version": "1"},
            },
        )
        tools = rpc("tools/list", {})["tools"]
        tool = next(t for t in tools if t["name"] == "generate_voice_take")
        assert "31 supported" in tool["description"]
        for example in schema["examples"]:
            VoiceRequest.model_validate(example)
        for language in ("na", "zh", "auto"):
            result = rpc(
                "tools/call",
                {
                    "name": "generate_voice_take",
                    "arguments": {
                        "request": {
                            "provider": "supertonic",
                            "text": "Test",
                            "voice_id": "F1",
                            "language": language,
                        }
                    },
                },
            )
            assert result["isError"]
        assert client.get("/api/assets").json() == []
