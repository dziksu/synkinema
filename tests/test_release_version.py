import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from synkinema import __version__
from synkinema.app import create_app


def test_stamp_validates_before_writing_and_changes_only_version(tmp_path):
    path = Path(__file__).parents[1] / "scripts/stamp_version.py"
    spec = importlib.util.spec_from_file_location("stamp_version", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    target = tmp_path / "apps/server/synkinema/__init__.py"
    target.parent.mkdir(parents=True)
    original = '"""Package docs."""\n\n__version__ = "0.1.0"\n'
    target.write_text(original)
    for invalid in ("v1.2.3", "1.2.3\nmalicious", "01.2.3", "1.2.3-rc.1", ""):
        with pytest.raises(ValueError):
            module.stamp(tmp_path, invalid)
        assert target.read_text() == original
    module.stamp(tmp_path, "1.2.3")
    assert target.read_text() == original.replace('"0.1.0"', '"1.2.3"')


def test_product_version_shared_by_health_openapi_and_mcp(tmp_path):
    with TestClient(create_app(tmp_path, start_worker=False)) as client:
        assert client.get("/api/health").json()["version"] == __version__
        assert client.get("/api/openapi.json").json()["info"]["version"] == __version__
        response = client.post(
            "/mcp/",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "version-test", "version": "1"},
                },
            },
        )
        assert response.json()["result"]["serverInfo"]["version"] == __version__
