from synkinema.models import Clip, Project, Track


def test_new_projects_have_english_defaults_and_stable_track_ids():
    project = Project(name="New project")
    assert [(track.id, track.name) for track in project.tracks] == [
        ("video", "Video"),
        ("titles", "Captions"),
        ("voice", "Voiceover"),
        ("music", "Music"),
    ]


def test_loading_existing_projects_preserves_user_language():
    project = Project(
        name="Zagrożone gatunki",
        script="Chroń naturę",
        tracks=[Track(id="titles", name="Napisy", kind="text", clips=[Clip(text="Żubr")])],
    )
    restored = Project.model_validate_json(project.model_dump_json())
    assert restored.name == "Zagrożone gatunki"
    assert restored.script == "Chroń naturę"
    assert restored.tracks[0].name == "Napisy"
    assert restored.tracks[0].clips[0].text == "Żubr"
