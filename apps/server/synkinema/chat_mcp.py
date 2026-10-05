"""Revocable per-turn MCP capabilities, separate from Synkinema's public MCP."""

from typing import Annotated

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field
from starlette.responses import JSONResponse

from .chat_backend import chat_backend
from .chat_contract import AgentContext
from .mcp_inputs import OptionalRevision, ProjectId
from .mcp_strict import forbid_unknown_arguments
from .models import BatchRequest


async def resolve_context(service, project_id, context):
    if not project_id:
        raise ValueError("Object context requires a project conversation")
    project = await service.project(project_id)
    if context.type == "project" and context.target_id == project_id:
        return project
    if context.type == "track":
        for track in project["tracks"]:
            if track["id"] == context.target_id:
                return track
    if context.type == "clip":
        for track in project["tracks"]:
            for clip in track["clips"]:
                if clip["id"] == context.target_id:
                    return {"track_id": track["id"], **clip}
    if context.type == "script_line":
        for line in project["script_lines"]:
            if line["id"] == context.target_id:
                return line
    if context.type == "asset":
        for asset in await service.assets(project_id):
            if asset["id"] == context.target_id:
                return asset
    raise KeyError("Context object does not belong to this project")


def make_chat_mcp(service, project_id, edit, active, applied):
    service = chat_backend(service)
    mcp = FastMCP(
        "Synkinema local chat",
        instructions="Use get_agent_guide and get_project. Read exact operation schemas before editing. Never guess IDs or revisions.",
        stateless_http=True,
        json_response=True,
        streamable_http_path="/",
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["localhost:*", "127.0.0.1:*", "[::1]:*", "testserver"],
            allowed_origins=["http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*"],
        ),
    )
    read = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)

    def check(target=None):
        if not active():
            raise ValueError("This agent turn has ended; its capability was revoked")
        if project_id is not None and target is not None and target != project_id:
            raise ValueError("This conversation can access only its assigned project")

    @mcp.tool(annotations=read)
    async def get_agent_guide() -> str:
        """Read Synkinema editing, script, media and inspection rules. This conversation has a scoped tool catalog; tools not listed here are unavailable. No project mutation."""
        check()
        return await service.guide()

    @mcp.tool(annotations=read)
    async def list_projects() -> list[dict]:
        """Read saved projects and their confirmed revisions. Project conversations return only their assigned project; General may inspect existing projects, but cannot write."""
        check()
        return [await service.project(project_id)] if project_id else await service.projects()

    @mcp.tool(annotations=read)
    async def get_project(project_id: ProjectId, revision: OptionalRevision = None) -> dict:
        """Read the scoped project, tracks, clips, script lines, computed duration in integer milliseconds and current channel guidance. Omit revision for the confirmed current state before any write."""
        check(project_id)
        return await service.project(project_id, revision)

    @mcp.tool(annotations=read)
    async def get_project_schema() -> dict:
        """Read the canonical Project JSON Schema with profile, track, clip, script and effect properties and units. Does not create or edit any project."""
        check()
        return await service.schema()

    @mcp.tool(annotations=read)
    async def get_operation_reference(
        operation: Annotated[
            str | None, Field(description="Exact operation name or null for the full catalog.")
        ] = None,
    ) -> dict:
        """Read exact editing payload schemas, examples, units and side effects from the shared operation catalog. Consult before constructing operations; do not guess payload fields."""
        check()
        return await service.operations(operation)

    @mcp.tool(annotations=read)
    async def resolve_reference(project_id: ProjectId, context: AgentContext) -> dict:
        """Resolve a stable project/track/clip/script_line/asset ID against the scoped project. Labels are presentation only. Rejects references belonging to another project; returns domain data."""
        check(project_id)
        return await resolve_context(service, project_id, context)

    @mcp.tool(annotations=read)
    async def list_project_assets(project_id: ProjectId) -> list[dict]:
        """Read validated media in the scoped project collection, including timeline and script audio references. Returns actual metadata/IDs; does not import, share or generate media."""
        check(project_id)
        return await service.assets(project_id)

    @mcp.tool(annotations=read)
    async def validate_project(project_id: ProjectId) -> dict:
        """Read the scoped project's preflight report using the real engine validation rules. Reports missing sources and timeline issues; never invent render completion or inferred caption timings."""
        check(project_id)
        return await service.validate(project_id)

    @mcp.tool(annotations=read)
    async def preview_batch(project_id: ProjectId, request: BatchRequest) -> dict:
        """Validate an atomic edit batch against a required confirmed expected_revision without saving. Forces dry_run=true, reports committed=false and provisional candidate IDs; does not increment stored revision."""
        check(project_id)
        return await service.batch(project_id, request, True)

    if edit and project_id:

        @mcp.tool(
            annotations=ToolAnnotations(
                readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
            )
        )
        async def apply_batch(project_id: ProjectId, request: BatchRequest) -> dict:
            """Commit one atomic batch to this conversation's project using required expected_revision. On conflict reread and reconcile; never retry blindly. Uses the same domain engine, validation and revision history as Studio. Stop does not roll back committed batches."""
            check(project_id)
            result = await service.batch(project_id, request, False)
            applied(result["project"]["revision"])
            return result

    forbid_unknown_arguments(mcp)
    return mcp


class CapabilityApp:
    def __init__(self, chat_service):
        self.service = chat_service

    async def __call__(self, scope, receive, send):
        path = scope["path"][len(scope.get("root_path", "")) :]
        key = path.strip("/")
        run = self.service.capabilities.get(key)
        if not run or not run.active or not run.http_app:
            await JSONResponse({"detail": "Agent capability expired"}, status_code=404)(scope, receive, send)
            return
        # Keep the full path and extend root_path so the nested MCP app sees '/'.
        scope = {**scope, "root_path": scope.get("root_path", "") + "/" + key}
        await run.http_app(scope, receive, send)
