"""Preflight responses keep exception diagnostics in server logs."""

import logging

import pytest
from fastapi.testclient import TestClient
from synkinema.api_contract import Issue
from synkinema.app import create_app
from synkinema.models import Clip, Project, Track


@pytest.mark.parametrize("exception_type", [ValueError, KeyError])
@pytest.mark.parametrize("asset_failure", ["lookup", "path"])
def test_preflight_does_not_expose_exception_details(
    tmp_path, monkeypatch, caplog, exception_type, asset_failure
):
    app = create_app(tmp_path, start_worker=False)
    service = app.state.service
    project = service.create(
        Project(
            name="Preflight security QA",
            tracks=[
                Track(
                    id="titles",
                    name="Titles",
                    kind="text",
                    clips=[
                        Clip(id="first", text="First", duration_ms=1000),
                        Clip(id="second", text="Second", start_ms=1000, duration_ms=1000),
                    ],
                )
            ],
        )
    )
    original_get = service.get
    # Simulate a stored project whose referenced media can no longer be validated.
    broken = project.model_copy(update={"asset_ids": ["missing-source"]})
    monkeypatch.setattr(service, "get", lambda *_: broken)
    private_detail = "Traceback: /private/server/secret-project.db: internal diagnostic"

    def invalid_timeline(*_):
        raise ValueError(private_detail)

    def invalid_media(*_):
        raise exception_type(private_detail)

    monkeypatch.setattr("synkinema.preflight.validate_timeline", invalid_timeline)
    monkeypatch.setattr(service, "validate_assets", invalid_media)
    if asset_failure == "lookup":
        monkeypatch.setattr(service, "asset", invalid_media)
    else:
        monkeypatch.setattr(service, "asset", lambda _: {"path": "library/source.mp4"})
        monkeypatch.setattr(service.store, "path", invalid_media)

    with caplog.at_level(logging.WARNING, logger="synkinema.preflight"), TestClient(app) as client:
        response = client.get(f"/api/projects/{project.id}/preflight?revision={project.revision}")
        assert response.status_code == 200
        report = response.json()
        assert report["valid"] is False
        expected_errors = [
            {
                "code": "timeline",
                "message": "Timeline validation failed. Check video tracks, clip timing and transitions.",
            },
            *[
                {
                    "code": "clip",
                    "message": "Clip validation failed. Check media references and clip settings.",
                    "track_id": "titles",
                    "clip_id": clip_id,
                }
                for clip_id in ("first", "second")
            ],
            {
                "code": "asset",
                "message": "Referenced asset is invalid or unavailable.",
                "asset_id": "missing-source",
            },
        ]
        assert report["errors"] == [Issue(**error).model_dump() for error in expected_errors]
        assert "Traceback" not in response.text
        assert "/private/server" not in response.text
        assert "secret-project.db" not in response.text
        assert "internal diagnostic" not in response.text
        assert (report["project_id"], report["revision"]) == (project.id, project.revision)
        assert (report["clip_count"], report["asset_count"]) == (2, 1)
        assert original_get(project.id) == project
        assert len(service.history(project.id)) == 1
        assert service.jobs() == []

    records = [record for record in caplog.records if record.name == "synkinema.preflight"]
    assert len(records) == 4
    assert all(record.exc_info and str(record.exc_info[1]).strip("'") == private_detail for record in records)
    assert all(project.id in record.getMessage() for record in records)
