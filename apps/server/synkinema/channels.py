"""Local editorial identities. No platform authentication, scraping or publishing."""

import json
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, create_model, field_validator, model_validator
from sqlalchemy import text

from .models import Model, uid
from .production.usage import FootageUse, project_footage
from .storage import now

Platform = Literal["youtube", "tiktok", "instagram", "facebook", "twitch", "x", "linkedin", "other"]


class ChannelLink(Model):
    platform: Platform
    url: str = Field(max_length=2000)

    @field_validator("url")
    @classmethod
    def safe_url(cls, value):
        parts = urlsplit(value)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
            raise ValueError("Use a public HTTPS link without credentials")
        return value


class ChannelInput(Model):
    name: str = Field(min_length=1, max_length=200)
    logo_id: str | None = Field(
        None,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="Optional ID returned by upload_channel_logo. Served at /media/channel-logos/{logo_id}.png. Null removes the association, not the reusable file. Existing briefs default to null.",
    )
    language: str = Field(
        "en",
        min_length=2,
        max_length=50,
        description="Content language, e.g. en or pl; not Studio UI language.",
    )
    audience: str = Field("", max_length=4000)
    concept: str = Field("", max_length=10000)
    rules: str = Field(
        "",
        max_length=20000,
        description="Standing editorial instructions: hooks, CTA, pacing, captions, exclusions and source policy.",
    )
    voice_gender: Literal["unspecified", "male", "female", "neutral"] = "unspecified"
    voice_provider: str = Field(
        "",
        max_length=100,
        description="Preferred provider ID; advisory, does not install or invoke a provider.",
    )
    voice_id: str = Field("", max_length=200)
    tone: str = Field("", max_length=2000)
    hook_guidance: str = Field("", max_length=4000)
    cta_guidance: str = Field("", max_length=4000)
    visual_guidance: str = Field("", max_length=4000)
    avoid: str = Field("", max_length=4000)
    learnings: str = Field(
        "",
        max_length=10000,
        description="Owner-approved lessons to apply to future videos. Reviews do not change these automatically.",
    )
    lowercase_hashtags: bool = True
    links: list[ChannelLink] = Field(default_factory=list, max_length=20)
    archived: bool = False

    @field_validator("name", "language")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()


class Channel(ChannelInput):
    id: str
    version: int = Field(ge=1)
    created_at: str
    updated_at: str


class ChannelUpdate(ChannelInput):
    expected_version: int = Field(
        ge=1,
        description="Last confirmed channel version; conflicts reject without retry. Replaces editable fields, including links.",
    )


EDITABLE_FIELDS = tuple(ChannelInput.model_fields)
# Snapshots are only written when editable content changes, so this bounds
# storage without losing the history of an actively edited rulebook.
VERSION_RETENTION = 100


def _keep_current(field):
    """Same type and bounds as ChannelInput, but omission means "keep the current value"."""
    annotation = Annotated[(field.annotation, *field.metadata)] if field.metadata else field.annotation
    return annotation | None, Field(None, description=field.description)


ChannelPatch = create_model(
    "ChannelPatch",
    __base__=Model,
    __doc__="Partial channel update. Only supplied fields change; omitted fields keep their current values. Send an empty string or list to clear a field deliberately.",
    expected_version=(
        int,
        Field(ge=1, description="Last confirmed channel version; conflicts reject without retry."),
    ),
    **{name: _keep_current(field) for name, field in ChannelInput.model_fields.items()},
)


class ChannelVersionRestore(Model):
    expected_version: int = Field(
        ge=1, description="Current confirmed channel version; conflicts reject without retry."
    )


class ChannelVersionSummary(Model):
    version: int
    current: bool
    saved_at: str = Field(description="When this version's editable content was written.")
    replaced_at: str | None = Field(
        None, description="When a later edit replaced this content; null for the current version."
    )
    changes_from_previous: list[str] | None = Field(
        None,
        description="Editable fields that differ from the next-older listed version; null for the oldest.",
    )
    field_lengths: dict[str, int] = Field(
        description="Character counts of the long text fields, e.g. to spot a wiped rulebook at a glance."
    )


class ChannelVersions(Model):
    channel_id: str
    current_version: int
    versions: list[ChannelVersionSummary] = Field(description="Newest first, current version included.")
    retention: int = Field(
        description="Most recent replaced versions kept per channel; older snapshots are pruned."
    )
    note: str = "Only versions whose editable content was later replaced are snapshotted; publication/review records bump the version without new content. Restore copies a snapshot into a NEW version and snapshots the state it replaces."


class ChannelVersionDetail(Model):
    channel: Channel
    current: bool
    replaced_at: str | None = None


class ChannelProject(Model):
    id: str
    name: str
    revision: int
    duration_ms: int


class PublicationInput(Model):
    project_id: str | None = Field(
        None,
        description="Optional currently linked project; historical publication remains if later unlinked or deleted.",
    )
    project_revision: int | None = Field(
        None,
        ge=1,
        description="Exact linked project revision published. On first published record, omitted means current revision; metric-only updates retain the frozen revision and source usage.",
    )
    title: str = Field(min_length=1, max_length=200)
    platform: Platform
    url: str = Field(max_length=2000)
    published_at: datetime | None = None
    status: Literal["draft", "scheduled", "published"] = "published"
    views: int | None = Field(None, ge=0)
    likes: int | None = Field(None, ge=0)
    comments: int | None = Field(None, ge=0)
    average_viewed_percent: float | None = Field(
        None,
        ge=0,
        le=1000,
        description="0–100 percent; loops can exceed 100. Null means unknown, never zero.",
    )
    metrics_as_of: datetime | None = None
    evidence: str = Field(
        "",
        max_length=4000,
        description="Manual source/provenance, observation period and caveats. No automatic analytics sync.",
    )

    _url = field_validator("url")(ChannelLink.safe_url.__func__)
    _title = field_validator("title")(ChannelInput.nonblank.__func__)

    @field_validator("published_at", "metrics_as_of")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Include timezone, e.g. +02:00 or Z")
        return value

    @model_validator(mode="after")
    def metric_provenance(self):
        if any(
            getattr(self, k) is not None for k in ("views", "likes", "comments", "average_viewed_percent")
        ) and (self.metrics_as_of is None or not self.evidence.strip()):
            raise ValueError(
                "Observed metrics require metrics_as_of and evidence; leave unknown metrics null"
            )
        return self


class Publication(PublicationInput):
    id: str
    recorded_at: str
    project_name: str | None = Field(
        None,
        description="Project name captured with this publication, retained after project deletion.",
    )
    source_usage: list[FootageUse] = Field(
        default_factory=list,
        description="Frozen source intervals captured from the published project revision, retained after project deletion.",
    )


class PublicationWrite(PublicationInput):
    expected_version: int = Field(ge=1)
    publication_id: str | None = Field(
        None,
        description="Omit to append; existing ID to replace this record, e.g. refresh manually observed metrics.",
    )


class ChannelReviewInput(Model):
    project_id: str
    project_revision: int = Field(ge=1)
    author: str = Field(
        min_length=1,
        max_length=200,
        description="Reviewer identity, e.g. owner or agent. Not verified by the server.",
    )
    hook: int = Field(ge=0, le=10)
    pacing: int = Field(ge=0, le=10)
    clarity: int = Field(ge=0, le=10)
    cta: int = Field(ge=0, le=10)
    channel_fit: int = Field(ge=0, le=10)
    evidence: str = Field(
        min_length=1,
        max_length=6000,
        description="What was actually inspected: script, revision, render ID/timestamps or published observations. Scores are subjective, not predicted reach.",
    )
    strengths: str = Field("", max_length=4000)
    improvements: str = Field(min_length=1, max_length=6000)
    _nonblank = field_validator("author", "evidence", "improvements")(ChannelInput.nonblank.__func__)


class ChannelReview(ChannelReviewInput):
    id: str
    created_at: str
    project_name: str | None = Field(
        None,
        description="Project name captured with this review, retained after project deletion.",
    )
    score: float = Field(
        ge=0,
        le=100,
        description="Unweighted mean of five 0–10 editorial criteria multiplied by ten. NOT a performance or virality prediction.",
    )


class ChannelReviewWrite(ChannelReviewInput):
    expected_version: int = Field(ge=1)


class ChannelContext(Model):
    channel: Channel
    recent_reviews: list[ChannelReview]
    guidance: str = "Current channel rules (not a historical snapshot). Apply before scripting/TTS/editing. Reviews are subjective; verify evidence. Never override safety, licensing or the owner's explicit current request. No publishing authority is granted."


class ChannelDetail(Model):
    channel: Channel
    projects: list[ChannelProject]
    publications: list[Publication]
    reviews: list[ChannelReview]
    archived_project_ids: list[str] = Field(
        default_factory=list,
        description="Referenced project IDs that no longer exist in the workspace. Historical channel records remain available.",
    )


class Channels:
    def validate_channel_logo(self, logo_id):
        if logo_id is not None and not self.store.path(f"channel-logos/{logo_id}.png").is_file():
            raise KeyError("Channel logo not found; upload an image first")

    def channels(self):
        return [
            Channel.model_validate_json(r["document"])
            for r in self.store.rows("SELECT document FROM channels ORDER BY updated_at DESC,id")
        ]

    def channel(self, channel_id):
        rows = self.store.rows("SELECT document FROM channels WHERE id=:id", id=channel_id)
        if not rows:
            raise KeyError("Channel not found")
        return Channel.model_validate_json(rows[0]["document"])

    def validate_channel(self, channel_id, conn):
        if (
            channel_id is not None
            and not conn.execute(text("SELECT id FROM channels WHERE id=:id"), {"id": channel_id}).first()
        ):
            raise KeyError("Channel not found")

    def create_channel(self, request: ChannelInput):
        self.validate_channel_logo(request.logo_id)
        stamp = now()
        channel = Channel(**request.model_dump(), id=uid(), version=1, created_at=stamp, updated_at=stamp)
        self.store.execute(
            "INSERT INTO channels VALUES(:id,:doc,:time)",
            id=channel.id,
            doc=channel.model_dump_json(),
            time=stamp,
        )
        return channel

    def _channel_write(self, channel_id, expected_version, action):
        from .service import Conflict

        with self.store.transaction() as conn:
            row = conn.execute(text("SELECT document FROM channels WHERE id=:id"), {"id": channel_id}).first()
            if not row:
                raise KeyError("Channel not found")
            channel = Channel.model_validate_json(row[0])
            if channel.version != expected_version:
                raise Conflict(
                    f"Expected channel version {expected_version}; current version is {channel.version}. Reload and reconcile your draft."
                )
            previous = channel
            channel = action(conn, channel)
            if any(getattr(previous, name) != getattr(channel, name) for name in EDITABLE_FIELDS):
                self._snapshot_channel(conn, previous)
            channel = channel.model_copy(update={"version": expected_version + 1, "updated_at": now()})
            conn.execute(
                text("UPDATE channels SET document=:doc,updated_at=:time WHERE id=:id"),
                {"id": channel_id, "doc": channel.model_dump_json(), "time": channel.updated_at},
            )
        return channel

    @staticmethod
    def _snapshot_channel(conn, channel):
        """Keep the content being replaced; the channel table holds only the current document."""
        conn.execute(
            text("INSERT INTO channel_records VALUES(:id,:channel,'version',:doc,:time)"),
            {"id": uid(), "channel": channel.id, "doc": channel.model_dump_json(), "time": now()},
        )
        conn.execute(
            text(
                "DELETE FROM channel_records WHERE channel_id=:channel AND kind='version' AND id NOT IN "
                "(SELECT id FROM channel_records WHERE channel_id=:channel AND kind='version' "
                "ORDER BY created_at DESC,id DESC LIMIT :keep)"
            ),
            {"channel": channel.id, "keep": VERSION_RETENTION},
        )

    def update_channel(self, channel_id, request: ChannelUpdate):
        self.validate_channel_logo(request.logo_id)
        return self._channel_write(
            channel_id,
            request.expected_version,
            lambda _conn, channel: Channel(
                **{**channel.model_dump(), **request.model_dump(exclude={"expected_version"})}
            ),
        )

    def patch_channel(self, channel_id, request):
        supplied = request.model_fields_set - {"expected_version"}
        if not supplied:
            raise ValueError(
                "Supply at least one channel field to change; omitted fields keep their current values"
            )
        if "logo_id" in supplied:
            self.validate_channel_logo(request.logo_id)
        changes = request.model_dump(include=supplied)
        return self._channel_write(
            channel_id,
            request.expected_version,
            lambda _conn, channel: Channel.model_validate({**channel.model_dump(), **changes}),
        )

    def _channel_snapshots(self, channel_id):
        return [
            (Channel.model_validate_json(r["document"]), r["created_at"])
            for r in self.store.rows(
                "SELECT document,created_at FROM channel_records WHERE channel_id=:id AND kind='version' ORDER BY created_at DESC,id DESC",
                id=channel_id,
            )
        ]

    def channel_versions(self, channel_id):
        current = self.channel(channel_id)
        entries = [(current, None)] + self._channel_snapshots(channel_id)
        versions = []
        for index, (channel, replaced_at) in enumerate(entries):
            older = entries[index + 1][0] if index + 1 < len(entries) else None
            versions.append(
                ChannelVersionSummary(
                    version=channel.version,
                    current=replaced_at is None,
                    saved_at=channel.updated_at,
                    replaced_at=replaced_at,
                    changes_from_previous=None
                    if older is None
                    else [name for name in EDITABLE_FIELDS if getattr(older, name) != getattr(channel, name)],
                    field_lengths={
                        name: len(getattr(channel, name))
                        for name in EDITABLE_FIELDS
                        if isinstance(getattr(channel, name), str) and name not in ("name", "language")
                    },
                )
            )
        return ChannelVersions(
            channel_id=channel_id,
            current_version=current.version,
            versions=versions,
            retention=VERSION_RETENTION,
        )

    def channel_version(self, channel_id, version):
        current = self.channel(channel_id)
        if version == current.version:
            return ChannelVersionDetail(channel=current, current=True)
        for channel, replaced_at in self._channel_snapshots(channel_id):
            if channel.version == version:
                return ChannelVersionDetail(channel=channel, current=False, replaced_at=replaced_at)
        raise KeyError(
            f"Channel version {version} has no snapshot. list_channel_versions shows every restorable version."
        )

    def restore_channel_version(self, channel_id, version, request: ChannelVersionRestore):
        target = self.channel_version(channel_id, version)
        if target.current:
            raise ValueError(f"Version {version} is already current; nothing to restore")
        self.validate_channel_logo(target.channel.logo_id)
        restored = target.channel.model_dump(include=set(EDITABLE_FIELDS))
        return self._channel_write(
            channel_id,
            request.expected_version,
            lambda _conn, channel: Channel.model_validate({**channel.model_dump(), **restored}),
        )

    def channel_records(self, channel_id, kind, limit=-1):
        return [
            json.loads(r["document"])
            for r in self.store.rows(
                "SELECT document FROM channel_records WHERE channel_id=:id AND kind=:kind ORDER BY created_at DESC,id DESC LIMIT :limit",
                id=channel_id,
                kind=kind,
                limit=limit,
            )
        ]

    def channel_context(self, channel_id):
        if channel_id is None:
            return None
        return ChannelContext(
            channel=self.channel(channel_id),
            recent_reviews=[
                ChannelReview.model_validate(r) for r in self.channel_records(channel_id, "review", 5)
            ],
        ).model_dump(mode="json")

    def channel_detail(self, channel_id):
        from .models import Project

        channel = self.channel(channel_id)
        projects = [
            Project.model_validate_json(r["document"])
            for r in self.store.rows(
                "SELECT document FROM projects WHERE json_extract(document,'$.channel_id')=:id ORDER BY updated_at DESC",
                id=channel_id,
            )
        ]
        publications = [
            Publication.model_validate(r) for r in self.channel_records(channel_id, "publication")
        ]
        reviews = [ChannelReview.model_validate(r) for r in self.channel_records(channel_id, "review")]
        referenced_ids = {
            project_id for record in (*publications, *reviews) if (project_id := record.project_id)
        }
        available_names = {project.id: project.name for project in projects}
        for project_id in referenced_ids - available_names.keys():
            rows = self.store.rows("SELECT document FROM projects WHERE id=:id", id=project_id)
            if rows:
                available_names[project_id] = Project.model_validate_json(rows[0]["document"]).name

        # Older records predate project-name snapshots. Frozen source usage is
        # the strongest surviving evidence; a publication title is a readable
        # fallback when the deleted project's original name is unrecoverable.
        historical_names = {}
        publication_titles = {}
        for publication in publications:
            if not publication.project_id:
                continue
            if publication.project_name:
                historical_names.setdefault(publication.project_id, publication.project_name)
            for use in publication.source_usage:
                if use.project_name:
                    historical_names.setdefault(publication.project_id, use.project_name)
            publication_titles.setdefault(publication.project_id, publication.title)

        reviews = [
            review.model_copy(
                update={
                    "project_name": review.project_name
                    or available_names.get(review.project_id)
                    or historical_names.get(review.project_id)
                    or publication_titles.get(review.project_id)
                }
            )
            for review in reviews
        ]
        publications.sort(
            key=lambda record: (
                record.published_at.timestamp() if record.published_at else float("-inf"),
                record.recorded_at,
                record.id,
            ),
            reverse=True,
        )
        reviews.sort(
            key=lambda record: (datetime.fromisoformat(record.created_at).timestamp(), record.id),
            reverse=True,
        )
        return ChannelDetail(
            channel=channel,
            projects=[
                ChannelProject(id=p.id, name=p.name, revision=p.revision, duration_ms=p.duration_ms)
                for p in projects
            ],
            publications=publications,
            reviews=reviews,
            archived_project_ids=sorted(referenced_ids - available_names.keys()),
        )

    def _linked_project(self, conn, channel_id, project_id):
        row = conn.execute(text("SELECT document FROM projects WHERE id=:id"), {"id": project_id}).first()
        if not row:
            raise KeyError("Project not found")
        if json.loads(row[0]).get("channel_id") != channel_id:
            raise ValueError("Project must be linked to this channel")

    def record_publication(self, channel_id, request: PublicationWrite):
        def action(conn, channel):
            record_id = request.publication_id or uid()
            existing = None
            if request.publication_id:
                row = conn.execute(
                    text(
                        "SELECT document FROM channel_records WHERE id=:id AND channel_id=:channel AND kind='publication'"
                    ),
                    {"id": record_id, "channel": channel_id},
                ).first()
                if not row:
                    raise KeyError("Publication not found in channel")
                existing = json.loads(row[0])
            # Keep historical references editable after unlink/deletion. New links
            # must still belong to this channel at the time of this transaction.
            if request.project_id and (not existing or existing.get("project_id") != request.project_id):
                self._linked_project(conn, channel_id, request.project_id)
            captured = []
            revision = request.project_revision
            if (
                existing
                and existing.get("project_id") == request.project_id
                and existing.get("status") == "published"
                and revision in (None, existing.get("project_revision"))
            ):
                captured = existing.get("source_usage", [])
                revision = existing.get("project_revision")
            elif request.project_id and request.status == "published":
                self._linked_project(conn, channel_id, request.project_id)
                project = self.get(request.project_id, revision)
                revision = project.revision
                captured = project_footage(self, project)
            project_name = (
                existing.get("project_name")
                if existing and existing.get("project_id") == request.project_id
                else None
            )
            if request.project_id and not project_name:
                row = conn.execute(
                    text("SELECT document FROM projects WHERE id=:id"), {"id": request.project_id}
                ).first()
                if row:
                    project_name = json.loads(row[0])["name"]
                elif captured:
                    project_name = (
                        captured[0].get("project_name")
                        if isinstance(captured[0], dict)
                        else captured[0].project_name
                    )
            record = Publication(
                **request.model_dump(exclude={"expected_version", "publication_id", "project_revision"}),
                project_revision=revision,
                source_usage=captured,
                project_name=project_name,
                id=record_id,
                recorded_at=now(),
            )
            conn.execute(
                text(
                    "INSERT INTO channel_records VALUES(:id,:channel,'publication',:doc,:time) ON CONFLICT(id) DO UPDATE SET document=excluded.document"
                ),
                {
                    "id": record.id,
                    "channel": channel_id,
                    "doc": record.model_dump_json(),
                    "time": record.recorded_at,
                },
            )
            return channel

        self._channel_write(channel_id, request.expected_version, action)
        return self.channel_detail(channel_id)

    def record_channel_review(self, channel_id, request: ChannelReviewWrite):
        def action(conn, channel):
            self._linked_project(conn, channel_id, request.project_id)
            project_name = json.loads(
                conn.execute(
                    text("SELECT document FROM projects WHERE id=:id"), {"id": request.project_id}
                ).one()[0]
            )["name"]
            if not conn.execute(
                text("SELECT revision FROM revisions WHERE project_id=:id AND revision=:rev"),
                {"id": request.project_id, "rev": request.project_revision},
            ).first():
                raise KeyError("Project revision not found")
            score = sum(getattr(request, k) for k in ("hook", "pacing", "clarity", "cta", "channel_fit")) * 2
            record = ChannelReview(
                **request.model_dump(exclude={"expected_version"}),
                id=uid(),
                created_at=now(),
                project_name=project_name,
                score=score,
            )
            conn.execute(
                text("INSERT INTO channel_records VALUES(:id,:channel,'review',:doc,:time)"),
                {
                    "id": record.id,
                    "channel": channel_id,
                    "doc": record.model_dump_json(),
                    "time": record.created_at,
                },
            )
            return channel

        self._channel_write(channel_id, request.expected_version, action)
        return self.channel_detail(channel_id)
