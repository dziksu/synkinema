import asyncio
from typing import Annotated

from fastapi import File, HTTPException, UploadFile
from mcp.types import ToolAnnotations

from .channel_logos import MAX_LOGO_BYTES, ChannelLogo, import_logo
from .channels import (
    Channel,
    ChannelDetail,
    ChannelInput,
    ChannelReviewWrite,
    ChannelUpdate,
    PublicationWrite,
)
from .mcp_inputs import ChannelId

DESCRIPTIONS = {
    "upload_channel_logo": "Upload a still PNG/JPEG/WebP up to 5 MiB and 16 million pixels. Decode, strip metadata and resize to at most 512×512 pixels. Returns a reusable local logo ID/URL; does NOT change any channel until its ID is saved in a version-guarded brief. Identical output is deduplicated. Logos stay on disk after replacement/removal, including abandoned drafts; no external service, project asset or timeline mutation.",
    "list_channels": "List local editorial channels, including archived ones. No external platform calls.",
    "get_channel": "Read channel rules, linked projects, manually recorded publications/metrics and subjective editorial reviews. No analytics synchronization.",
    "create_channel": "Create a local editorial channel at version 1. Repeated calls create duplicates. Does not connect accounts or publish.",
    "update_channel": "Replace editable channel fields using expected_version. Omitted fields reset to defaults. Conflict 409 preserves existing data; reread and reconcile. Archive is reversible and preserves projects/media.",
    "record_channel_publication": "Append or update one manual publication record, guarded by expected_version. URL is metadata only; never fetched. Null metrics mean unknown. Does not publish, schedule or upload anything.",
    "record_channel_review": "Append an evidence-backed subjective review for an existing revision of a linked project; increments channel version. Criteria 0–10 produce a mean score 0–100, NOT predicted virality. Does not run analysis or change editorial rules automatically.",
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
    def list_channels() -> list[Channel]:
        return service.channels()

    @mcp.tool(description=DESCRIPTIONS["get_channel"], annotations=read)
    def get_channel(channel_id: ChannelId) -> ChannelDetail:
        return service.channel_detail(channel_id)

    @mcp.tool(description=DESCRIPTIONS["create_channel"], annotations=write)
    def create_channel(request: ChannelInput) -> Channel:
        return service.create_channel(request)

    @mcp.tool(description=DESCRIPTIONS["update_channel"], annotations=write)
    def update_channel(channel_id: ChannelId, request: ChannelUpdate) -> Channel:
        return service.update_channel(channel_id, request)

    @mcp.tool(description=DESCRIPTIONS["record_channel_publication"], annotations=write)
    def record_channel_publication(channel_id: ChannelId, request: PublicationWrite) -> ChannelDetail:
        return service.record_publication(channel_id, request)

    @mcp.tool(description=DESCRIPTIONS["record_channel_review"], annotations=write)
    def record_channel_review(channel_id: ChannelId, request: ChannelReviewWrite) -> ChannelDetail:
        return service.record_channel_review(channel_id, request)
