import asyncio
from typing import Annotated

from fastapi import File, HTTPException, UploadFile
from mcp.types import ToolAnnotations
from pydantic import Field

from .channel_logos import MAX_LOGO_BYTES, ChannelLogo, import_logo
from .channels import (
    Channel,
    ChannelDetail,
    ChannelInput,
    ChannelPatch,
    ChannelReviewWrite,
    ChannelUpdate,
    ChannelVersionDetail,
    ChannelVersionRestore,
    ChannelVersions,
    PublicationWrite,
)
from .mcp_inputs import ChannelId

DESCRIPTIONS = {
    "upload_channel_logo": "Upload a still PNG/JPEG/WebP up to 5 MiB and 16 million pixels. Decode, strip metadata and resize to at most 512×512 pixels. Returns a reusable local logo ID/URL; does NOT change any channel until its ID is saved in a version-guarded brief. Identical output is deduplicated. Logos stay on disk after replacement/removal, including abandoned drafts; no external service, project asset or timeline mutation.",
    "list_channels": "List local editorial channels, including archived ones. MCP defaults to compact paginated IDs/names/versions; get_channel reads full rules on demand. No external platform calls.",
    "get_channel": "Read current channel rules. MCP include_records=true also returns projects, manual publications/metrics and reviews; known_version skips unchanged rules. No analytics synchronization.",
    "create_channel": "Create a local editorial channel at version 1. Repeated calls create duplicates. Does not connect accounts or publish.",
    "update_channel": "Replace ALL editable channel fields using expected_version: omitted fields reset to defaults, so send the complete brief (Studio's editor does). Use PATCH for partial edits. The replaced content is snapshotted first and can be restored from the channel's versions. Conflict 409 preserves existing data; reread and reconcile. Archive is reversible and preserves projects/media.",
    "patch_channel": "Change only the supplied editable fields, guarded by expected_version; omitted fields keep their current values and an empty string or list clears a field deliberately. At least one field is required. The replaced content is snapshotted first. Conflict 409 preserves existing data; reread and reconcile.",
    "list_channel_versions": "List the current channel version and every snapshotted earlier version, newest first, with when each was saved and replaced, which editable fields changed, and the character count of each long text field (a wiped rulebook shows as a drop to 0). Snapshots are written whenever editable content changes; publication/review records bump the version without new content. Read-only.",
    "get_channel_version": "Read the complete editable content of one snapshotted or current channel version, e.g. to compare or recover text. 404 when that version has no snapshot. Read-only.",
    "restore_channel_version": "Copy a snapshotted version's editable fields into a NEW current version, guarded by the current expected_version. The content being replaced is snapshotted too, so a restore can itself be undone. Publications, reviews and linked projects are unchanged. Conflict 409 preserves existing data.",
    "record_channel_publication": "Append or update one manual publication record, guarded by expected_version. URL is metadata only; never fetched. Null metrics mean unknown. Published records capture source usage at project_revision (current if omitted) for future reuse checks; metric updates retain that snapshot. Does not publish, schedule or upload anything.",
    "record_channel_review": "Append an evidence-backed subjective review for an existing revision of a linked project; increments channel version. Criteria 0–10 produce a mean score 0–100, NOT predicted virality. Does not run analysis or change editorial rules automatically.",
}

# MCP tools whose semantics differ from the same-named REST route.
MCP_DESCRIPTIONS = {
    "update_channel": "Change only the supplied editable fields of a channel, guarded by expected_version. Omitted fields keep their current values; send an empty string or list to clear one deliberately. Returns the new version. The replaced content is snapshotted first: list_channel_versions and restore_channel_version undo mistakes. Conflict preserves existing data; reread and reconcile, never blindly retry.",
}


def register_channel_http(app, service):
    from .api_contract import ApiError

    @app.post(
        "/api/channel-logos",
        status_code=201,
        response_model=ChannelLogo,
        responses={413: {"model": ApiError, "description": "Logo exceeds 5 MiB"}},
    )
    async def upload_channel_logo(file: Annotated[UploadFile, File()]):
        try:
            data = await file.read(MAX_LOGO_BYTES + 1)
            if len(data) > MAX_LOGO_BYTES:
                raise HTTPException(413, "Maximum logo size is 5 MiB")
            return await asyncio.to_thread(import_logo, service.store, data)
        finally:
            await file.close()

    @app.get("/api/channels", response_model=list[Channel])
    def list_channels():
        return service.channels()

    @app.get("/api/channels/{channel_id}", response_model=ChannelDetail)
    def get_channel(channel_id: str):
        return service.channel_detail(channel_id)

    @app.post("/api/channels", status_code=201, response_model=Channel)
    def create_channel(request: ChannelInput):
        return service.create_channel(request)

    @app.put("/api/channels/{channel_id}", response_model=Channel)
    def update_channel(channel_id: str, request: ChannelUpdate):
        return service.update_channel(channel_id, request)

    @app.patch("/api/channels/{channel_id}", response_model=Channel)
    def patch_channel(channel_id: str, request: ChannelPatch):
        return service.patch_channel(channel_id, request)

    @app.get("/api/channels/{channel_id}/versions", response_model=ChannelVersions)
    def list_channel_versions(channel_id: str):
        return service.channel_versions(channel_id)

    @app.get("/api/channels/{channel_id}/versions/{version}", response_model=ChannelVersionDetail)
    def get_channel_version(channel_id: str, version: int):
        return service.channel_version(channel_id, version)

    @app.post("/api/channels/{channel_id}/versions/{version}/restore", response_model=Channel)
    def restore_channel_version(channel_id: str, version: int, request: ChannelVersionRestore):
        return service.restore_channel_version(channel_id, version, request)

    @app.post("/api/channels/{channel_id}/publications", response_model=ChannelDetail)
    def record_channel_publication(channel_id: str, request: PublicationWrite):
        return service.record_publication(channel_id, request)

    @app.post("/api/channels/{channel_id}/reviews", response_model=ChannelDetail)
    def record_channel_review(channel_id: str, request: ChannelReviewWrite):
        return service.record_channel_review(channel_id, request)


def register_channel_mcp(mcp, service):
    read = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
    write = ToolAnnotations(
        readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
    )

    @mcp.tool(description=DESCRIPTIONS["list_channels"], annotations=read)
    def list_channels(
        compact: Annotated[
            bool,
            Field(
                description="Default true: IDs, names, versions and language only. Read get_channel for editorial rules."
            ),
        ] = True,
        start: Annotated[int, Field(ge=0, description="Zero-based channel offset.")] = 0,
        count: Annotated[int, Field(ge=1, le=100, description="Maximum channels, at most 100.")] = 20,
    ) -> dict:
        channels = service.channels()
        fields = {"id", "name", "version", "language", "archived", "updated_at"}
        return {
            "channels": [
                c.model_dump(include=fields if compact else None) for c in channels[start : start + count]
            ],
            "total_count": len(channels),
            "next_start": start + count if start + count < len(channels) else None,
        }

    @mcp.tool(description=DESCRIPTIONS["get_channel"], annotations=read)
    def get_channel(
        channel_id: ChannelId,
        known_version: Annotated[
            int | None,
            Field(
                ge=1,
                description="Version whose complete rules you already read. Matching version returns unchanged without repeating the brief.",
            ),
        ] = None,
        include_records: Annotated[
            bool,
            Field(
                description="Include linked projects, publications and reviews; omit for just current editorial rules."
            ),
        ] = False,
    ) -> dict:
        channel = service.channel(channel_id)
        if known_version == channel.version and not include_records:
            return {"id": channel.id, "version": channel.version, "unchanged": True}
        return (
            service.channel_detail(channel_id).model_dump(mode="json")
            if include_records
            else {"channel": channel.model_dump(mode="json")}
        )

    @mcp.tool(description=DESCRIPTIONS["create_channel"], annotations=write)
    def create_channel(request: ChannelInput) -> Channel:
        return service.create_channel(request)

    @mcp.tool(description=MCP_DESCRIPTIONS["update_channel"], annotations=write)
    def update_channel(channel_id: ChannelId, request: ChannelPatch) -> Channel:
        # Partial on MCP: a full replace silently blanked every omitted field of
        # an owner's rulebook when an agent sent only the field it meant to edit.
        return service.patch_channel(channel_id, request)

    version_number = Annotated[
        int, Field(ge=1, description="Channel version number returned by list_channel_versions.")
    ]

    @mcp.tool(description=DESCRIPTIONS["list_channel_versions"], annotations=read)
    def list_channel_versions(channel_id: ChannelId) -> ChannelVersions:
        return service.channel_versions(channel_id)

    @mcp.tool(description=DESCRIPTIONS["get_channel_version"], annotations=read)
    def get_channel_version(channel_id: ChannelId, version: version_number) -> ChannelVersionDetail:
        return service.channel_version(channel_id, version)

    @mcp.tool(description=DESCRIPTIONS["restore_channel_version"], annotations=write)
    def restore_channel_version(
        channel_id: ChannelId,
        version: version_number,
        expected_version: Annotated[
            int, Field(ge=1, description="Current confirmed channel version; conflicts reject.")
        ],
    ) -> Channel:
        return service.restore_channel_version(
            channel_id, version, ChannelVersionRestore(expected_version=expected_version)
        )

    @mcp.tool(description=DESCRIPTIONS["record_channel_publication"], annotations=write)
    def record_channel_publication(channel_id: ChannelId, request: PublicationWrite) -> ChannelDetail:
        return service.record_publication(channel_id, request)

    @mcp.tool(description=DESCRIPTIONS["record_channel_review"], annotations=write)
    def record_channel_review(channel_id: ChannelId, request: ChannelReviewWrite) -> ChannelDetail:
        return service.record_channel_review(channel_id, request)
