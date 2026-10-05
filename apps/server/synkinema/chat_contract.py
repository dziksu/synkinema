"""Local agent chat contracts. OpenAPI is the source of Studio's generated types."""

from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from .models import Model

Provider = Literal["codex", "claude", "copilot"]
Effort = Literal["default", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]
Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Directory = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class AgentProviderSettings(Model):
    executable: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    model: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    reasoning_effort: Effort = "default"


class AgentProviders(Model):
    codex: AgentProviderSettings = Field(default_factory=lambda: AgentProviderSettings(executable="codex"))
    claude: AgentProviderSettings = Field(default_factory=lambda: AgentProviderSettings(executable="claude"))
    copilot: AgentProviderSettings = Field(
        default_factory=lambda: AgentProviderSettings(executable="copilot")
    )


class AgentSettings(Model):
    default_provider: Provider = "codex"
    providers: AgentProviders = Field(default_factory=AgentProviders)


class AgentSettingsSnapshot(Model):
    settings: AgentSettings
    version: int = Field(ge=1)
    enabled: bool
    read_only: bool
    availability: dict[str, bool]


class AgentSettingsUpdate(Model):
    expected_version: int = Field(ge=1, description="Confirmed settings version; conflicts reject.")
    settings: AgentSettings


class AgentContext(Model):
    type: Literal["project", "track", "clip", "script_line", "asset"]
    target_id: Identifier
    label: Annotated[str, StringConstraints(max_length=500)] = ""


class AgentMessage(Model):
    id: str
    role: Literal["user", "assistant"]
    text: str
    provider: Provider
    status: Literal["running", "complete", "failed", "cancelled"]
    created_at: str
    context: AgentContext | None = None
    reasoning: str = ""
    progress: str = ""
    error: str = ""
    request_id: str = ""
    applied_revisions: list[int] = Field(default_factory=list)


class AgentChatSummary(Model):
    id: str
    title: str
    project_id: str | None
    project_name: str | None
    provider: Provider
    mode: Literal["ask", "edit"]
    directory: str
    archived: bool
    running: bool
    version: int = Field(
        ge=1, description="Monotonic chat snapshot version, independent of project revision."
    )
    created_at: str
    updated_at: str


class AgentChat(AgentChatSummary):
    messages: list[AgentMessage]


class AgentChatCreate(Model):
    project_id: Identifier | None = None
    provider: Provider | None = None
    directory: Directory = ""
    context: AgentContext | None = None


class AgentChatUpdate(Model):
    expected_version: int = Field(ge=1, description="Confirmed chat version; busy chats reject all updates.")
    title: Title | None = None
    provider: Provider | None = None
    mode: Literal["ask", "edit"] | None = None
    directory: Directory | None = None
    archived: bool | None = None


class AgentSend(Model):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]
    request_id: Identifier = Field(
        description="Unique request ID. Reusing it with identical input returns the existing turn without executing again."
    )
    context: AgentContext | None = None


class AgentChatOrder(Model):
    chat_ids: list[Identifier] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def unique_ids(self):
        if len(self.chat_ids) != len(set(self.chat_ids)):
            raise ValueError("Chat IDs must be unique")
        return self


class AgentChatDeleted(Model):
    chat_id: str
    deleted: Literal[True] = True


class AgentModel(Model):
    id: str
    display_name: str
    is_default: bool
    reasoning_efforts: list[str]


REST_DESCRIPTIONS = {
    "agent_chat_settings": "Read local agent configuration, executable availability, enabled/read-only policy and confirmed settings version. Availability checks the executable, not login or model entitlement.",
    "update_agent_chat_settings": "Save provider executables, model IDs and Codex reasoning effort with a confirmed settings version. Changes apply to future turns; existing CLI processes keep their captured settings.",
    "agent_chat_models": "Read the configured Codex CLI's paginated model/list catalog with an 8 second timeout and bounded output. Does not start a thread, inference or consume a model turn.",
    "agent_chats": "Read ordered local conversation summaries including immutable project scope, archive state, running state and monotonic chat version. Message history is read separately.",
    "create_agent_chat": "Create a persistent conversation for one existing project or General. Project scope cannot subsequently change. New conversations start in Ask; optional context is resolved against that project.",
    "order_agent_chats": "Reorder the supplied unique conversation IDs within their existing slots, preserving the positions of all omitted conversations. Does not edit projects or delete history.",
    "agent_chat": "Read the complete persistent conversation snapshot, including partial assistant text, public reasoning summaries, errors and applied project revisions. Poll with Query while running; reconnect does not stop CLI execution.",
    "update_agent_chat": "Rename/archive/restore a conversation or change provider, Ask/Edit mode or source directory with its confirmed version. Running conversations reject updates; General and read-only policy reject Edit.",
    "delete_agent_chat": "Delete an idle conversation and its message history with the confirmed chat version. Does not delete media or roll back project edits; running conversations reject deletion.",
    "send_agent_message": "Accept one local CLI turn with a deduplicated request ID and optional project object reference. Returns 202 with a running snapshot; provider errors arrive in the persisted assistant message. Maximum 3 active turns and 1 per conversation.",
    "stop_agent_chat": "Revoke the active turn's project MCP capability and terminate its CLI process group. Preserve partial text and already committed revisions; stopping is not project rollback. Final status may arrive after this acknowledgement.",
}
