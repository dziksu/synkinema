"""Line audio is durable project metadata with the same revision and media protections."""

import io
import wave

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from synkinema.app import create_app
from synkinema.models import Project, ScriptLine


def audio_file():
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\x00\x00" * 16000)
    return output.getvalue()


def test_lines_round_trip_conflicts_usage_and_legacy_replacement(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        project = client.post("/api/projects", json={"name": "Line QA", "script": "Legacy\n\nScript"}).json()
        assert project["script_lines"] == []
        endpoint = f"/api/projects/{project['id']}/operations"
        imported = client.post("/api/assets", files={"file": ("take.wav", audio_file(), "audio/wav")})
        assert imported.status_code == 201, imported.text
        asset = imported.json()
        line = {
            "id": "one",
            "text": "First sentence",
            "audio_asset_id": asset["id"],
            "audio_text": "First sentence",
            "audio_source": "recorded",
        }

        def edit(revision, payload):
            return client.post(
                endpoint, json={"expected_revision": revision, "type": "update_project", "payload": payload}
            )

        response = edit(1, {"script_lines": [line, {"id": "two", "text": "Second sentence"}]})
        assert response.status_code == 200, response.text
        saved = response.json()
        assert saved["revision"] == 2
        assert saved["script"] == "First sentence\nSecond sentence"
        assert saved["tracks"] == project["tracks"] and saved["scenes"] == project["scenes"]
        assert saved["script_lines"][0] == line
        assert client.get(f"/api/projects/{project['id']}").json()["script_lines"] == saved["script_lines"]
        assert asset["id"] in {a["id"] for a in client.get(f"/api/assets?project_id={project['id']}").json()}
        usage = client.get(f"/api/assets/{asset['id']}/usage").json()
        assert not usage["can_delete"] and usage["projects"][0]["current"]
        assert edit(1, {"script_lines": []}).status_code == 409
        # Text edits preserve the old take and its exact text snapshot.
        updated = edit(2, {"script_lines": [{**line, "text": "Edited sentence"}]}).json()
        assert updated["script_lines"][0]["audio_text"] == "First sentence"
        assert edit(3, {"script_lines": [line, line]}).status_code == 422
        assert edit(3, {"script_lines": [{**line, "audio_asset_id": "missing"}]}).status_code == 404
        # A legacy API caller cannot leave silently mismatched line associations.
        legacy = edit(3, {"script": "A new plain script"}).json()
        assert legacy["script_lines"] == [] and legacy["script"] == "A new plain script"
        usage = client.get(f"/api/assets/{asset['id']}/usage").json()
        assert not usage["can_delete"] and not usage["projects"][0]["current"]
        restored = client.post(
            endpoint, json={"expected_revision": 4, "type": "restore_revision", "payload": {"revision": 2}}
        ).json()
        assert restored["script_lines"] == saved["script_lines"]
        assert edit(5, {"script_lines": []}).json()["script"] == ""
        schema = client.get("/api/openapi.json").json()
        fields = schema["components"]["schemas"]["UpdateProjectStep"]["properties"]["payload"]["properties"]
        assert "script_lines" in fields


@pytest.mark.parametrize(
    "values",
    [
        {"audio_asset_id": "missing"},
        {"audio_source": "recorded"},
        {"audio_text": "hello"},
        {"audio_asset_id": "", "audio_text": "hello", "audio_source": "recorded"},
    ],
)
def test_incomplete_audio_metadata_rejects(values):
    with pytest.raises(ValidationError):
        ScriptLine(id="line", text="hello", **values)


def test_creation_synchronizes_script_and_limits_total_length():
    p = Project(name="Lines", script_lines=[ScriptLine(id="one", text="hello")])
    assert p.script == "hello"
    with pytest.raises(ValidationError):
        Project(
            name="Too long",
            script_lines=[ScriptLine(id="one", text="a" * 60000), ScriptLine(id="two", text="b" * 60000)],
        )


def test_browser_webm_without_duration_is_measured_before_attaching(tmp_path):
    import json
    import subprocess

    live = tmp_path / "microphone.webm"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:a",
            "libopus",
            "-live",
            "1",
            str(live),
        ],
        check=True,
    )
    header = json.loads(
        subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-of", "json", str(live)])
    )
    assert "duration" not in header["format"]
    with TestClient(create_app(tmp_path / "data", start_worker=False)) as client:
        p = client.post("/api/projects", json={"name": "Microphone QA"}).json()
        uploaded = client.post(
            "/api/assets",
            files={"file": (live.name, live.read_bytes(), "audio/webm")},
            data={"project_id": p["id"]},
        )
        assert uploaded.status_code == 201, uploaded.text
        asset = uploaded.json()
        assert 950 <= asset["duration_ms"] <= 1100
        assert asset["audio_duration_ms"] == asset["duration_ms"]
        response = client.post(
            f"/api/projects/{p['id']}/operations",
            json={
                "expected_revision": 1,
                "type": "update_project",
                "payload": {
                    "script_lines": [
                        {
                            "id": "mic",
                            "text": "Microphone take",
                            "audio_asset_id": asset["id"],
                            "audio_text": "Microphone take",
                            "audio_source": "recorded",
                        }
                    ]
                },
            },
        )
        assert response.status_code == 200, response.text
