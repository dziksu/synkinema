from fastapi.testclient import TestClient
from synkinema.app import create_app


def test_configured_lan_host_supports_panel_reads_and_same_origin_writes(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNKINEMA_ALLOWED_HOSTS", " 192.168.0.54, ")
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app, base_url="http://192.168.0.54:8080") as client:
        assert client.get("/api/health").status_code == 200
        created = client.post(
            "/api/projects",
            headers={"Origin": "http://192.168.0.54:8080"},
            json={"name": "LAN preview"},
        )
        assert created.status_code == 201
        assert client.get("/api/projects").json()[0]["name"] == "LAN preview"
        for origin in ["https://evil.example", "http://192.168.0.54:9999", "null"]:
            assert (
                client.post(
                    "/api/projects", headers={"Origin": origin}, json={"name": "Rejected"}
                ).status_code
                == 403
            )
        assert client.get("/api/projects", headers={"Host": "unknown.example"}).status_code == 400


def test_lan_host_is_rejected_without_explicit_configuration(tmp_path, monkeypatch):
    monkeypatch.delenv("SYNKINEMA_ALLOWED_HOSTS", raising=False)
    app = create_app(tmp_path, start_worker=False)
    with TestClient(app, base_url="http://192.168.0.54:8080") as client:
        assert client.get("/api/projects").status_code == 400
