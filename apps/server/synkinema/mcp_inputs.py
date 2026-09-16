"""Reusable, agent-facing MCP parameter descriptions for scalar tool inputs."""

from typing import Annotated, Literal

from pydantic import Field

ProjectId = Annotated[
    str,
    Field(
        description="Exact project ID returned by browse_projects, list_projects or create_project; never guess."
    ),
]
OptionalProjectId = Annotated[
    str | None,
    Field(description="Exact project ID returned by Synkinema. Omit for the documented global/shared scope."),
]
ChannelId = Annotated[
    str,
    Field(description="Exact local channel ID returned by list_channels, get_channel or create_channel."),
]
OptionalChannelId = Annotated[
    str | None,
    Field(description="Exact local channel ID returned by Synkinema; omit/null for an independent project."),
]
AssetId = Annotated[
    str,
    Field(description="Exact asset ID returned by an import, search_assets, get_asset or production task."),
]
FolderId = Annotated[
    str,
    Field(
        description="Exact folder ID returned by list_asset_folders or create_asset_folder; never use its name."
    ),
]
OptionalFolderId = Annotated[
    str | None,
    Field(description="Folder ID in the selected media collection; omit/null for that collection's root."),
]
RenderJobId = Annotated[
    str,
    Field(
        description="Exact render job ID returned by start_render or list_render_jobs; do not enqueue to poll."
    ),
]
OptionalRenderJobId = Annotated[
    str | None,
    Field(
        description="Exact completed render job ID for pinned inspection; omit/null to inspect the selected project revision."
    ),
]
ProductionTaskId = Annotated[
    str,
    Field(
        description="Exact durable production task ID returned by start_production_task or list_production_tasks; do not enqueue to poll."
    ),
]
Revision = Annotated[
    int,
    Field(
        ge=1,
        description="Confirmed project revision returned by Synkinema. Stale revisions must be reread and reconciled, never blindly retried.",
    ),
]
OptionalRevision = Annotated[
    int | None,
    Field(
        ge=1,
        description="Immutable project revision to read. Omit/null for the current revision; pin it for reproducible review.",
    ),
]
TimelineMs = Annotated[
    int,
    Field(
        description="Absolute project-timeline time in integer milliseconds; keep it within project duration."
    ),
]
OptionalTimelineMs = Annotated[
    int | None,
    Field(
        description="Optional absolute project-timeline time in integer milliseconds; null uses the documented end."
    ),
]
AssetKind = Annotated[
    Literal["image", "video", "audio"] | None,
    Field(description="Optional exact media kind filter: image, video or audio; omit/null for all kinds."),
]
RenderQuality = Annotated[
    Literal["preview", "final"],
    Field(
        description="preview caps the longest edge at 640 px; final uses the selected output/profile geometry."
    ),
]
