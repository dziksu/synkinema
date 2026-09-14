"""Reproducible JSON byte comparison in disposable storage; not a tokenizer benchmark."""

import json
import tempfile

from synkinema.agent_tools import EditContext, ProjectBrowse, browse_projects, edit_context, work_item
from synkinema.models import Clip, Project, Track
from synkinema.service import Service
from synkinema.storage import Store


def size(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


def comparison(name, full, compact):
    a, b = size(full), size(compact)
    return {
        "case": name,
        "full_bytes": a,
        "compact_bytes": b,
        "reduction_percent": round(100 * (1 - b / a), 2),
    }


def main():
    with tempfile.TemporaryDirectory(prefix="synkinema-agent-benchmark-") as directory:
        service = Service(Store(directory))
        for i in range(10):
            p = service.create(
                Project(
                    name=f"Benchmark short {i}",
                    tracks=[
                        Track(
                            id="titles",
                            name="Captions",
                            kind="text",
                            clips=[
                                Clip(
                                    id=f"c{n}",
                                    text=f"Three word caption {n}",
                                    start_ms=n * 500,
                                    duration_ms=500,
                                )
                                for n in range(80)
                            ],
                        )
                    ],
                )
            )
        verification = {
            "id": "qa",
            "status": "completed",
            "progress": 1,
            "phase": "Complete",
            "request": {"type": "verify_render", "job_id": "job"},
            "result": {
                "verification": {
                    "passed": True,
                    "job_id": "job",
                    "revision": 1,
                    "audio": {
                        "integrated_lufs": -16,
                        "true_peak_dbtp": -1.5,
                        "windows": [
                            {"time_ms": n * 500, "rms_dbfs": -20, "silence": False, "clipping": False}
                            for n in range(120)
                        ],
                        "warnings": [],
                    },
                    "layout": {"passed": True, "issues": []},
                    "transcript": {
                        "text": "Example " * 1000,
                        "words": [
                            {"word": "Example", "start_ms": n * 300, "end_ms": n * 300 + 200}
                            for n in range(200)
                        ],
                    },
                }
            },
        }
        print(
            json.dumps(
                [
                    comparison(
                        "index: 10 projects x 80 clips",
                        service.projects(),
                        browse_projects(service, ProjectBrowse()),
                    ),
                    comparison(
                        "context: same 80 clips, no defaults",
                        service.summary(p),
                        edit_context(service, EditContext(project_id=p.id, limit=100)),
                    ),
                    comparison(
                        "verification: status vs raw evidence",
                        verification,
                        work_item(verification, "production"),
                    ),
                ],
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
