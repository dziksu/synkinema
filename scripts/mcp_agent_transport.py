"""Audited MCP-only transport for an editor agent without a mounted MCP connection.

No REST endpoints, media fetching, filesystem editing or rendering outside MCP.
Usage: python scripts/mcp_agent_transport.py JSON_REQUEST
Request: {"tool":"get_agent_guide","arguments":{}} or {"method":"tools/list"}.
Returned MCP image blocks are compacted for transport only; edits happen in Synkinema.
"""

import asyncio
import base64
import io
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from PIL import Image

AUDIT = Path(__file__).resolve().parents[1] / "examples/steam-short/out/mcp-agent-audit.jsonl"


async def main():
    request = json.loads(sys.argv[1])
    headers = (
        {"Authorization": f"Bearer {os.environ['SYNKINEMA_API_TOKEN']}"}
        if os.environ.get("SYNKINEMA_API_TOKEN")
        else {}
    )
    async with (
        streamablehttp_client("http://127.0.0.1:8080/mcp/", headers=headers) as (read, write, _),
        ClientSession(read, write, read_timeout_seconds=timedelta(minutes=10)) as session,
    ):
        await session.initialize()
        if request.get("method") == "tools/list":
            result = await session.list_tools()
        else:
            result = await session.call_tool(request["tool"], request.get("arguments", {}))
        output = result.model_dump(mode="json", exclude_none=True)
        audit = {
            "time": datetime.now(UTC).isoformat(),
            "transport": "MCP Streamable HTTP",
            "request": request,
            "isError": output.get("isError", False),
        }
        with AUDIT.open("a") as file:
            file.write(json.dumps(audit, ensure_ascii=False) + "\n")
        # Forward actual MCP ImageContent at useful inspection resolution, never source-file pixels.
        for block in output.get("content", []):
            if block.get("type") == "image":
                image = Image.open(io.BytesIO(base64.b64decode(block["data"]))).convert("RGB")
                image.thumbnail((960, 960))
                buffer = io.BytesIO()
                image.save(buffer, format="JPEG", quality=72)
                block.update(data=base64.b64encode(buffer.getvalue()).decode(), mimeType="image/jpeg")
        print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
