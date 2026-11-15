import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from synkinema import chatterbox_tts
from synkinema.app import create_app
from synkinema.voices import VoiceRequest

REQUEST = {"provider": "chatterbox", "voice_id": "whyzy", "text": "A little help [chuckle]."}


@pytest.mark.parametrize(
    "changes",
    [
        {"language": "pl"},
        {"voice_id": "../whyzy"},
        {"text": "a" * (chatterbox_tts.INPUT_LIMIT + 1)},
        {"model_id": "other"},
        {"speed": 1.1},
        {"stability": 0.8},
        {"steps": 12},
    ],
)
def test_rejects_unsupported_chatterbox_settings(changes):
    with pytest.raises(ValidationError):
        VoiceRequest.model_validate(REQUEST | changes)


def write_reference(path: Path, sample: int):
    with wave.open(str(path), "wb") as output:
        output.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        output.writeframes(sample.to_bytes(2, "little", signed=True) * 48000)


def test_status_describes_missing_runtime(tmp_path, monkeypatch):
    monkeypatch.delenv("SYNKINEMA_CHATTERBOX_DIR", raising=False)
    monkeypatch.delenv("SYNKINEMA_CHATTERBOX_PYTHON", raising=False)
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        status = client.get("/api/voices/status").json()
        assert status["default_provider"] in ("supertonic", "elevenlabs")
        provider = next(p for p in status["providers"] if p["id"] == "chatterbox")
        assert provider["local"] and not provider["configured"]
        assert provider["languages"] == [{"id": "en", "name": "English"}]
        assert provider["voices"] == []
        assert "SYNKINEMA_CHATTERBOX_PYTHON" in provider["reason"]
        assert not (tmp_path / "models").exists()


def test_http_reference_discovery_private_media_cache_and_failure(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNKINEMA_CHATTERBOX_DIR", str(tmp_path / "chatterbox"))
    monkeypatch.setattr(chatterbox_tts.Chatterbox, "unavailable_reason", lambda _: None)
    directory = tmp_path / "chatterbox" / "voices"
    directory.mkdir(parents=True)
    reference = directory / "whyzy.wav"
    write_reference(reference, 250)
    (directory / "invalid.wav").write_bytes(b"not audio")
    (directory / "alias.wav").symlink_to(reference)
    calls = []

    def generate(_self, text, reference, output):
        calls.append((text, reference))
        if text == "Fail":
            output.write_bytes(b"partial")
            raise ValueError("Chatterbox synthesis failed")
        output.write_bytes(reference)

    monkeypatch.setattr(chatterbox_tts.Chatterbox, "generate", generate)
    app = create_app(tmp_path / "data", start_worker=False)
    with TestClient(app) as client:
        status = client.get("/api/voices/status").json()
        provider = next(p for p in status["providers"] if p["id"] == "chatterbox")
        assert provider["configured"] and provider["voices"] == [{"id": "whyzy", "name": "whyzy"}]
        project = client.post("/api/projects", json={"name": "Chatterbox QA"}).json()
        payload = REQUEST | {"project_id": project["id"]}
        first = client.post("/api/voices/generate", json=payload)
        assert first.status_code == 200
        asset = first.json()["asset"]
        assert not first.json()["cached"] and asset["duration_ms"] == 6000
        assert {"voiceover", "ai-generated", "chatterbox-turbo", "en", "whyzy"} <= set(asset["tags"])
        assert "MIT" in asset["license"] and chatterbox_tts.REVISION in asset["source"]
        cached = client.post("/api/voices/generate", json=payload | {"language": "en"}).json()
        assert cached["cached"] and cached["asset"]["id"] == asset["id"]
        assert calls == [(REQUEST["text"], reference.read_bytes())]

        write_reference(reference, 500)
        replacement = client.post("/api/voices/generate", json=payload).json()
        assert not replacement["cached"] and replacement["asset"]["source"] != asset["source"]
        assert client.get("/api/assets").json() == []
        assert client.get(f"/api/projects/{project['id']}").json()["revision"] == project["revision"]

        for changes in ({"voice_id": "invalid"}, {"voice_id": "alias"}, {"text": "Fail"}):
            response = client.post("/api/voices/generate", json=payload | changes)
            assert response.status_code == 422
        assert len(app.state.service.assets(project_id=project["id"])) == 2
        assert list((tmp_path / "data" / "uploads").glob("tts-*")) == []
