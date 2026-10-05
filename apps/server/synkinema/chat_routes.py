"""Local-only chat REST endpoints. Studio polls typed snapshots through Query."""

import ipaddress
import logging
import re
from urllib.parse import urlparse

from fastapi import Query, Request

from .chat_contract import (
    AgentChat,
    AgentChatCreate,
    AgentChatDeleted,
    AgentChatOrder,
    AgentChatSummary,
    AgentChatUpdate,
    AgentModel,
    AgentSend,
    AgentSettingsSnapshot,
    AgentSettingsUpdate,
)
from .chat_mcp import CapabilityApp


class CapabilityRedaction(logging.Filter):
    def filter(self, record):
        def redact(value):
            return (
                re.sub(r"(/api/agent-chat/mcp/)[a-f0-9]{32}", r"\1[capability]", value)
                if isinstance(value, str)
                else value
            )

        record.msg = redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(redact(value) for value in record.args)
        elif isinstance(record.args, dict):
            record.args = {key: redact(value) for key, value in record.args.items()}
        return True


def loopback(host):
    try:
        address = ipaddress.ip_address(host)
        return address.is_loopback or bool(
            getattr(address, "ipv4_mapped", None) and address.ipv4_mapped.is_loopback
        )
    except ValueError:
        return False


def local_request(request):
    # Never trust Forwarded/X-Forwarded-* to authorize local process execution.
    peer = request.client.host if request.client else ""
    host = request.url.hostname
    origin = request.headers.get("origin")
    try:
        return (
            loopback(peer)
            and (host == "localhost" or loopback(host or ""))
            and (
                not origin
                or urlparse(origin).hostname == "localhost"
                or loopback(urlparse(origin).hostname or "")
            )
        )
    except ValueError:
        return False


def register_chat_http(app, service):
    prefix = "/api/agent-chat"
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, CapabilityRedaction) for item in access_logger.filters):
        access_logger.addFilter(CapabilityRedaction())

    @app.get(prefix + "/settings", response_model=AgentSettingsSnapshot)
    async def agent_chat_settings():
        return service.settings()

    @app.put(prefix + "/settings", response_model=AgentSettingsSnapshot)
    async def update_agent_chat_settings(request: AgentSettingsUpdate):
        return service.update_settings(request)

    @app.get(prefix + "/codex/models", response_model=list[AgentModel])
    async def agent_chat_models():
        return await service.models()

    @app.get(prefix + "/chats", response_model=list[AgentChatSummary])
    async def agent_chats():
        return service.summaries()

    @app.post(prefix + "/chats", status_code=201, response_model=AgentChat)
    async def create_agent_chat(request: AgentChatCreate):
        return await service.create(request)

    @app.put(prefix + "/chats/order", response_model=list[AgentChatSummary])
    async def order_agent_chats(request: AgentChatOrder):
        return service.order(request)

    @app.get(prefix + "/chats/{chat_id}", response_model=AgentChat)
    async def agent_chat(chat_id: str):
        return service.get(chat_id)

    @app.patch(prefix + "/chats/{chat_id}", response_model=AgentChat)
    async def update_agent_chat(chat_id: str, request: AgentChatUpdate):
        return service.update(chat_id, request)

    @app.delete(prefix + "/chats/{chat_id}", response_model=AgentChatDeleted)
    async def delete_agent_chat(chat_id: str, expected_version: int = Query(ge=1)):
        service.delete(chat_id, expected_version)
        return AgentChatDeleted(chat_id=chat_id)

    @app.post(prefix + "/chats/{chat_id}/messages", status_code=202, response_model=AgentChat)
    async def send_agent_message(chat_id: str, message: AgentSend, request: Request):
        # Use the bound server port, never Host or a forwarded URL, for the capability.
        server = request.scope.get("server")
        port = server[1] if server else None
        if not isinstance(port, int) or port < 1:
            raise ValueError("The backend must listen on a local TCP port to run agent chat")
        return await service.send(chat_id, message, f"http://127.0.0.1:{port}")

    @app.post(prefix + "/chats/{chat_id}/stop", response_model=AgentChat)
    async def stop_agent_chat(chat_id: str):
        return await service.stop(chat_id)

    app.mount(prefix + "/mcp", CapabilityApp(service))
