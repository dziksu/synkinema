import io
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from synkinema.agent_tools import EditContext, edit_context
from synkinema.app import create_app
from synkinema.channels import ChannelUpdate
from synkinema.service import Conflict


@pytest.fixture
def api(tmp_path):
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app) as client:
        yield client, app.state.service


def create_channel(client, **fields):
    response = client.post(
        "/api/channels",
        json={
            "name": "SpawnBrief QA",
            "voice_gender": "male",
            "rules": "Gameplay immediately; one concrete CTA",
            **fields,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def logo_bytes(size=(1024, 640), format="PNG"):
    data = io.BytesIO()
    Image.new("RGB", size, "#75a436").save(data, format=format)
    return data.getvalue()


def test_logo_upload_resize_deduplication_assignment_and_removal(api):
    client, service = api
    original = create_channel(client)
    response = client.post("/api/channel-logos", files={"file": ("logo.png", logo_bytes(), "image/png")})
    assert response.status_code == 201, response.text
    logo = response.json()
    assert (logo["width"], logo["height"]) == (512, 320)
    decoded = Image.open(io.BytesIO(client.get(logo["url"]).content))
    assert decoded.format == "PNG" and decoded.size == (512, 320)
    assert not decoded.getexif()
    again = client.post("/api/channel-logos", files={"file": ("another.png", logo_bytes())})
    assert again.json() == logo
    assert client.get(f"/api/channels/{original['id']}").json()["channel"]["logo_id"] is None
    saved = client.put(f"/api/channels/{original['id']}", json=update_payload(original, logo_id=logo["id"]))
    assert saved.status_code == 200, saved.text
    assert saved.json()["logo_id"] == logo["id"]
    conflict = client.put(f"/api/channels/{original['id']}", json=update_payload(original, logo_id=None))
    assert conflict.status_code == 409
    assert service.channel(original["id"]).logo_id == logo["id"]
    removed = client.put(f"/api/channels/{original['id']}", json=update_payload(saved.json(), logo_id=None))
    assert removed.status_code == 200 and removed.json()["logo_id"] is None
    assert client.get(logo["url"]).status_code == 200  # Reusable artwork is not destructively removed.


def test_logo_rejects_bad_data_oversize_and_untrusted_ids(api):
    client, _ = api
    for data in (
        b"not an image",
        b'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        logo_bytes(format="GIF"),
    ):
        response = client.post("/api/channel-logos", files={"file": ("fake.png", data, "image/png")})
        assert response.status_code == 422, response.text
    response = client.post("/api/channel-logos", files={"file": ("big.png", b"x" * (5 * 1024 * 1024 + 1))})
    assert response.status_code == 413
    for logo_id, code in [("../assets/secret", 422), ("a" * 64, 404)]:
        assert (
            client.post("/api/channels", json={"name": "Invalid logo", "logo_id": logo_id}).status_code
            == code
        )
    assert client.get("/api/channels").json() == []


def update_payload(channel, **fields):
    return {
        **{k: v for k, v in channel.items() if k not in {"id", "version", "created_at", "updated_at"}},
        "expected_version": channel["version"],
        **fields,
    }


def edit(client, project, **payload):
    return client.post(
        f"/api/projects/{project['id']}/operations",
        json={"type": "update_project", "expected_revision": project["revision"], "payload": payload},
    )


def test_optional_relation_context_restore_archive_and_conflict(api):
    client, service = api
    independent = client.post("/api/projects", json={"name": "Independent"}).json()
    assert independent["channel_id"] is independent["channel_context"] is None
    channel = create_channel(client)
    cid = channel["id"]
    p = client.post("/api/projects", json={"name": "Linked", "channel_id": cid}).json()
    assert p["channel_context"]["channel"]["voice_gender"] == "male"
    assert edit_context(service, EditContext(project_id=p["id"]))["channel_context"] == p["channel_context"]
    assert client.get(f"/api/channels/{cid}").json()["projects"][0]["id"] == p["id"]
    assert client.post("/api/projects", json={"name": "Missing", "channel_id": "missing"}).status_code == 404
    assert edit(client, p, channel_id="missing").status_code == 404
    assert service.get(p["id"]).revision == 1
    changed = client.put(f"/api/channels/{cid}", json=update_payload(channel, language="pl", archived=True))
    assert changed.status_code == 200, changed.text
    assert changed.json()["version"] == 2
    assert client.put(f"/api/channels/{cid}", json=update_payload(channel, language="de")).status_code == 409
    # The historical timeline is unchanged, while guidance is explicitly live.
    historic = client.get(f"/api/projects/{p['id']}?revision=1").json()
    assert historic["channel_context"]["channel"]["language"] == "pl"
    assert historic["revision"] == 1 and historic["tracks"] == p["tracks"]
    detached = edit(client, p, channel_id=None).json()
    assert detached["channel_context"] is None
    assert not client.get(f"/api/channels/{cid}").json()["projects"]
    assert edit(client, p, name="stale").status_code == 409
    restored = client.post(
        f"/api/projects/{p['id']}/operations",
        json={"type": "restore_revision", "expected_revision": 2, "payload": {"revision": 1}},
    ).json()
    assert restored["channel_id"] == cid
    assert restored["tracks"] == p["tracks"]
    clone = client.post(f"/api/projects/{p['id']}/clone", json={"name": "Clone", "revision": 3}).json()
    assert clone["channel_id"] == cid


def test_manual_publication_metrics_and_evidence_reviews(api):
    client, service = api
    channel = create_channel(client)
    cid = channel["id"]
    p = client.post("/api/projects", json={"name": "Game QA", "channel_id": cid}).json()
    body = {
        "expected_version": 1,
        "project_id": p["id"],
        "title": "Game short",
        "platform": "youtube",
        "url": "https://youtube.com/shorts/example",
    }
    endpoint = f"/api/channels/{cid}/publications"
    assert client.post(endpoint, json={**body, "views": 10}).status_code == 422
    assert client.post(endpoint, json={**body, "published_at": "2026-09-14T12:00:00"}).status_code == 422
    response = client.post(endpoint, json=body)
    assert response.status_code == 200, response.text
    publication = response.json()["publications"][0]
    assert publication["views"] is None
    assert response.json()["channel"]["version"] == 2
    review = {
        "expected_version": 2,
        "project_id": p["id"],
        "project_revision": 1,
        "author": "agent QA",
        "hook": 8,
        "pacing": 7,
        "clarity": 9,
        "cta": 6,
        "channel_fit": 10,
        "evidence": "Script only, no rendered playback",
        "improvements": "Make CTA more specific",
    }
    reviews_url = f"/api/channels/{cid}/reviews"
    assert client.post(reviews_url, json={**review, "project_revision": 999}).status_code == 404
    assert service.channel(cid).version == 2
    result = client.post(reviews_url, json=review)
    assert result.status_code == 200, result.text
    assert result.json()["reviews"][0]["score"] == 80
    assert result.json()["channel"]["learnings"] == ""
    assert (
        client.get(f"/api/projects/{p['id']}").json()["channel_context"]["recent_reviews"][0]["score"] == 80
    )
    assert client.post(reviews_url, json=review).status_code == 409
    assert edit(client, p, channel_id=None).status_code == 200
    metrics = {
        **body,
        "expected_version": 3,
        "publication_id": publication["id"],
        "views": 120,
        "average_viewed_percent": 113.5,
        "metrics_as_of": "2026-09-15T10:00:00+02:00",
        "evidence": "Owner copied Studio, first 24h",
    }
    updated = client.post(endpoint, json=metrics)
    assert updated.status_code == 200, updated.text
    assert len(updated.json()["publications"]) == 1
    assert updated.json()["publications"][0]["views"] == 120
    assert (
        client.post(endpoint, json={**metrics, "expected_version": 4, "publication_id": "wrong"}).status_code
        == 404
    )
    assert service.channel(cid).version == 4


def test_channel_validation_persistence_and_concurrent_writers(api):
    client, service = api
    assert client.post("/api/channels", json={"name": " "}).status_code == 422
    for url in ("javascript:alert(1)", "http://youtube.com/@test", "https://user:secret@example.com"):
        assert (
            client.post(
                "/api/channels", json={"name": "Invalid", "links": [{"platform": "youtube", "url": url}]}
            ).status_code
            == 422
        )
    channel = create_channel(client, links=[{"platform": "youtube", "url": "https://youtube.com/@test"}])

    def write(language):
        try:
            return service.update_channel(
                channel["id"], ChannelUpdate(**update_payload(channel, language=language))
            ).version
        except Conflict:
            return "conflict"

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(write, ["pl", "de"]), key=str) == [2, "conflict"]
    restarted = create_app(service.store.root, start_worker=False).state.service
    assert restarted.channel(channel["id"]).version == 2
    restarted.store.engine.dispose()


def test_mcp_channels_and_creation_include_guidance(api):
    client, _service = api

    def call(name, arguments):
        r = client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            },
        ).json()["result"]
        assert not r.get("isError"), r
        return json.loads(r["content"][0]["text"])

    c = call("create_channel", {"request": {"name": "MCP QA", "language": "en", "voice_gender": "male"}})
    p = call("create_project", {"name": "Linked through MCP", "channel_id": c["id"]})
    assert p["channel_context"]["channel"]["id"] == c["id"]
    assert (
        call("get_project", {"project_id": p["id"]})["channel_context"]["channel"]["voice_gender"] == "male"
    )
    assert (
        call("get_edit_context", {"request": {"project_id": p["id"]}})["channel_context"]["channel"][
            "language"
        ]
        == "en"
    )
    assert call("get_channel", {"channel_id": c["id"]})["projects"][0]["id"] == p["id"]
