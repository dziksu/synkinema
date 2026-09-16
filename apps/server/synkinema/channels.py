"""Local editorial identities. No platform authentication, scraping or publishing."""

import json
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
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
            channel = action(conn, channel)
            channel = channel.model_copy(update={"version": expected_version + 1, "updated_at": now()})
            conn.execute(
                text("UPDATE channels SET document=:doc,updated_at=:time WHERE id=:id"),
                {"id": channel_id, "doc": channel.model_dump_json(), "time": channel.updated_at},
            )
        return channel

    def update_channel(self, channel_id, request: ChannelUpdate):
        self.validate_channel_logo(request.logo_id)
        return self._channel_write(
            channel_id,
            request.expected_version,
            lambda _conn, channel: Channel(
                **{**channel.model_dump(), **request.model_dump(exclude={"expected_version"})}
            ),
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
        return ChannelDetail(
            channel=channel,
            projects=[
                ChannelProject(id=p.id, name=p.name, revision=p.revision, duration_ms=p.duration_ms)
                for p in projects
            ],
            publications=self.channel_records(channel_id, "publication"),
            reviews=self.channel_records(channel_id, "review"),
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
            record = Publication(
                **request.model_dump(exclude={"expected_version", "publication_id", "project_revision"}),
                project_revision=revision,
                source_usage=captured,
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
            if not conn.execute(
                text("SELECT revision FROM revisions WHERE project_id=:id AND revision=:rev"),
                {"id": request.project_id, "rev": request.project_revision},
            ).first():
                raise KeyError("Project revision not found")
            score = sum(getattr(request, k) for k in ("hook", "pacing", "clarity", "cta", "channel_fit")) * 2
            record = ChannelReview(
                **request.model_dump(exclude={"expected_version"}), id=uid(), created_at=now(), score=score
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
