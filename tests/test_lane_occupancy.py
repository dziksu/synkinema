import pytest
from fastapi.testclient import TestClient
from synkinema.app import create_app
from synkinema.models import BatchRequest, Clip, EditStep, Operation, Project, Track
from synkinema.service import Service
from synkinema.storage import Store
from synkinema.timeline import validate_lane_edits


@pytest.mark.parametrize("kind", ["overlay", "text", "sound", "music", "voiceover", "ambient"])
@pytest.mark.parametrize("muted", [False, True])
def test_ordinary_intervals_never_overlap_even_when_muted(kind, muted):
    track = Track(
        id="lane",
        name="Layer",
        kind=kind,
        muted=muted,
        clips=[Clip(id="a", start_ms=0, duration_ms=1000), Clip(id="b", start_ms=999, duration_ms=1000)],
    )
    with pytest.raises(ValueError, match="separate track"):
        validate_lane_edits(Project(name="Intervals", tracks=[track]))
    track.clips[1].start_ms = 1000
    validate_lane_edits(Project(name="Intervals", tracks=[track]))


def test_all_write_paths_are_guarded_and_batch_validates_final_layout(tmp_path):
    with TestClient(create_app(tmp_path / "data", start_worker=False)) as client:
        p = client.post(
            "/api/projects",
            json={
                "name": "Occupancy",
                "tracks": [
                    {
                        "id": "layer",
                        "name": "Elements",
                        "kind": "overlay",
                        "clips": [
                            {"id": "a", "shape": "rectangle", "start_ms": 0, "duration_ms": 1000},
                            {"id": "b", "shape": "ellipse", "start_ms": 2000, "duration_ms": 1000},
                        ],
                    }
                ],
            },
        ).json()
        url = f"/api/projects/{p['id']}/operations"
        for kind, payload in [
            ("add_clip", {"track_id": "layer", "clip": {"shape": "line"}}),
            ("update_clip", {"track_id": "layer", "clip_id": "b", "changes": {"start_ms": 500}}),
            ("move_clip", {"track_id": "layer", "clip_id": "b", "start_ms": 500}),
            ("trim_clip", {"track_id": "layer", "clip_id": "a", "changes": {"duration_ms": 3000}}),
        ]:
            response = client.post(url, json={"expected_revision": 1, "type": kind, "payload": payload})
            assert response.status_code == 422, response.text
            assert "overlap" in response.json()["detail"]
            assert client.get(f"/api/projects/{p['id']}").json()["revision"] == 1
        # Reposition both clips atomically. The intermediate collision is acceptable.
        result = client.post(
            url + "/batch",
            json={
                "expected_revision": 1,
                "operations": [
                    {
                        "type": "update_clip",
                        "payload": {"track_id": "layer", "clip_id": "a", "changes": {"start_ms": 2000}},
                    },
                    {
                        "type": "update_clip",
                        "payload": {"track_id": "layer", "clip_id": "b", "changes": {"start_ms": 0}},
                    },
                ],
            },
        )
        assert result.status_code == 200, result.text
        assert result.json()["project"]["revision"] == 2
        p["tracks"][0]["clips"][1]["start_ms"] = 500
        assert client.post("/api/projects", json=p).status_code == 422


def test_legacy_snapshots_remain_editable_and_restorable_without_new_overlaps(tmp_path):
    service = Service(Store(tmp_path / "data"))
    legacy = Project(
        name="Legacy",
        tracks=[
            Track(
                id="titles",
                name="Captions",
                kind="text",
                clips=[
                    Clip(id="a", text="A", start_ms=0, duration_ms=2000),
                    Clip(id="b", text="B", start_ms=1000, duration_ms=2000),
                ],
            )
        ],
    )
    # Simulate a stored project from before occupancy enforcement.
    p = service.create(legacy, legacy_source=legacy)
    p = service.apply(
        p.id, Operation(expected_revision=p.revision, type="update_project", payload={"name": "Renamed"})
    )
    assert any(i["code"] == "legacy_lane_overlap" for i in service.preflight(p.id)["warnings"])
    with pytest.raises(ValueError, match="overlap"):
        service.apply(
            p.id,
            Operation(
                expected_revision=p.revision,
                type="move_clip",
                payload={"track_id": "titles", "clip_id": "b", "start_ms": 500},
            ),
        )
    p = service.batch(
        p.id,
        BatchRequest(
            expected_revision=p.revision,
            operations=[
                EditStep(type="add_track", payload={"id": "titles2", "name": "Captions 2", "kind": "text"}),
                EditStep(
                    type="move_clip",
                    payload={
                        "track_id": "titles",
                        "clip_id": "b",
                        "target_track_id": "titles2",
                        "start_ms": 1000,
                    },
                ),
            ],
        ),
    )["project"]
    assert not any(i["code"] == "legacy_lane_overlap" for i in service.preflight(p["id"])["warnings"])
    restored = service.apply(
        p["id"], Operation(expected_revision=p["revision"], type="restore_revision", payload={"revision": 1})
    )
    assert restored.tracks[0].clips == legacy.tracks[0].clips
    assert service.clone(restored.id, "Legacy clone", restored.revision).tracks == restored.tracks
