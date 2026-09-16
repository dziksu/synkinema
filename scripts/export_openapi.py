"""Export deterministically without opening the user's database or starting a worker."""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from synkinema.api_contract import ProjectSnapshot
from synkinema.app import create_app
from synkinema.channels import Channel
from synkinema.models import Clip, OutputProfile, Project, ScriptLine, Track


def export(destination):
    with TemporaryDirectory(prefix="synkinema-openapi-") as root:
        app = create_app(root, start_worker=False)
        try:
            schema = app.openapi()
        finally:
            app.state.service.store.engine.dispose()
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "openapi.json").write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    # Defaults for optimistic drafts come from backend models, never a second manual contract.
    defaults = {
        "channel": Channel(id="", name="New channel", version=1, created_at="", updated_at="").model_dump(),
        "script_line": ScriptLine(id="new").model_dump(),
        "clip": Clip(id="").model_dump(),
        "track": Track(id="", name="", kind="overlay").model_dump(),
        "profile": OutputProfile().model_dump(),
    }
    project = Project(id="", name="New project")
    defaults["project"] = ProjectSnapshot(
        **project.model_dump(), duration_ms=project.duration_ms
    ).model_dump()
    (destination / "defaults.json").write_text(
        json.dumps(defaults, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


if __name__ == "__main__":
    export(sys.argv[1])
