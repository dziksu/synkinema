"""Exercise the public MCP interface to edit and render the example."""

import asyncio
import json
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

ROOT = Path(__file__).resolve().parents[1] / "examples" / "polish-wildlife"


async def main():
    run = json.loads((ROOT / "run.json").read_text())
    async with (
        streamablehttp_client("http://127.0.0.1:8080/mcp/") as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        result = await session.call_tool("get_project", {"project_id": run["project_id"]})
        project = json.loads(result.content[0].text)
        result = await session.call_tool(
            "apply_operation",
            {
                "project_id": project["id"],
                "operation": {
                    "expected_revision": project["revision"],
                    "type": "update_project",
                    "payload": {
                        "brief": project["brief"]
                        + " Finalna kontrola obrazu i pełnej długości miksu audio przez MCP."
                    },
                },
            },
        )
        if result.isError:
            raise RuntimeError(result.content)
        project = json.loads(result.content[0].text)
        result = await session.call_tool(
            "start_render",
            {"project_id": project["id"], "expected_revision": project["revision"], "quality": "final"},
        )
        if result.isError:
            raise RuntimeError(result.content)
        job = json.loads(result.content[0].text)
        run.update(job_id=job["id"], revision=project["revision"], quality="final")
        (ROOT / "run.json").write_text(json.dumps(run, indent=2))
        print(run)


asyncio.run(main())
