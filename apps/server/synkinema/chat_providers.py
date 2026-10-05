"""Installed CLI adapters. No shell, TUI parsing, or provider authentication storage."""

import asyncio
import json
import os
import signal
from collections.abc import AsyncIterator

from . import __version__
from .chat_contract import AgentModel
from .process_environment import external_environment

CODEX_ARGS = [
    "app-server",
    "-c",
    "features.hooks=false",
    "-c",
    "features.plugins=false",
    "-c",
    "features.apps=false",
    "-c",
    "apps._default.enabled=false",
    "-c",
    "notify=[]",
]


def child_environment():
    # Preserve CLI login paths/proxy/keychain support; the application token is never inherited.
    return {
        **{k: v for k, v in external_environment().items() if k != "SYNKINEMA_API_TOKEN"},
        "NO_COLOR": "1",
    }


def invocation(provider, config, prompt, mcp_url):
    model = ["--model", config.model] if config.model else []
    mcp = {"mcpServers": {"synkinema": {"type": "http", "url": mcp_url}}}
    if provider == "codex":
        return CODEX_ARGS, ""
    if provider == "claude":
        return [
            "--print",
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--no-session-persistence",
            "--strict-mcp-config",
            "--mcp-config",
            json.dumps(mcp),
            "--permission-mode",
            "dontAsk",
            "--tools",
            "Read,Glob,Grep",
            "--allowedTools",
            "Read,Glob,Grep,mcp__synkinema__*",
            *model,
        ], prompt
    mcp["mcpServers"]["synkinema"]["tools"] = ["*"]
    return [
        "--prompt",
        prompt,
        "--output-format",
        "json",
        "--stream",
        "on",
        "--no-color",
        "--disable-builtin-mcps",
        "--no-ask-user",
        "--no-auto-update",
        "--additional-mcp-config",
        json.dumps(mcp),
        "--allow-tool=synkinema",
        "--allow-tool=read",
        "--deny-tool=shell",
        "--deny-tool=write",
        *model,
    ], ""


def error_message(value, depth=0):
    if depth > 5:
        return str(value)[:16000]
    if isinstance(value, TimeoutError):
        return "The agent exceeded the 10 minute time limit."
    if isinstance(value, BaseExceptionGroup):
        return error_message(value.exceptions[0], depth + 1)
    if isinstance(value, BaseException):
        return error_message(str(value), depth + 1)
    if isinstance(value, list):
        return "\n".join(error_message(item, depth + 1) for item in value)[:16000]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict) and ("error" in parsed or "message" in parsed):
                return error_message(parsed, depth + 1)
        except ValueError:
            pass
        return value.strip()[:16000]
    if isinstance(value, dict):
        return error_message(value.get("message", value.get("error", "The agent failed.")), depth + 1)
    return "The agent failed."


class OutputParser:
    def __init__(self, provider):
        self.provider = provider
        self.blocks = {"text": {}, "reasoning": {}}
        self.claude_message = ""
        self.claude_index = 0
        self.claude_streaming = False
        self.claude_sequence = 0

    def parse(self, event):
        output = {}

        def put(kind, key, value, append=False):
            if not isinstance(value, str):
                return
            blocks = self.blocks[kind]
            blocks[key] = blocks.get(key, "") + value if append else value
            output[kind] = "\n\n".join(v for v in blocks.values() if v)
            output["progress"] = ""

        if self.provider == "codex":
            params = event.get("params") or {}
            item = params.get("item") or {}
            key = str(params.get("itemId", item.get("id", "message")))
            method = event.get("method")
            if method == "item/agentMessage/delta":
                put("text", key, params.get("delta"), True)
            if method == "item/reasoning/summaryTextDelta":
                put("reasoning", f"{key}:{params.get('summaryIndex', 0)}", params.get("delta"), True)
            if method == "item/completed" and item.get("type") == "agentMessage":
                put("text", key, item.get("text"))
            if method == "item/completed" and item.get("type") == "reasoning":
                for index, summary in enumerate(item.get("summary") or []):
                    put("reasoning", f"{key}:{index}", summary)
            if method == "item/started" and item.get("type") == "mcpToolCall":
                output["progress"] = f"Synkinema: {item.get('tool', 'tool')}"
            if method == "error" and not params.get("willRetry"):
                output["error"] = error_message(params.get("error", "Codex failed."))
        elif self.provider == "claude":
            if event.get("parent_tool_use_id"):
                return output
            stream = event.get("event") or {}
            if event.get("type") == "stream_event":
                if stream.get("type") == "message_start":
                    self.claude_sequence += 1
                    self.claude_message = str((stream.get("message") or {}).get("id", self.claude_sequence))
                    self.claude_streaming, self.claude_index = True, 0
                if stream.get("type") == "message_stop":
                    self.claude_streaming = False
                if stream.get("type") == "content_block_start":
                    self.claude_index = stream.get("index", 0)
                key = f"{self.claude_message}:{stream.get('index', 0)}"
                block, delta = stream.get("content_block") or {}, stream.get("delta") or {}
                if stream.get("type") == "content_block_start":
                    if block.get("type") == "text":
                        put("text", key, block.get("text"))
                    if block.get("type") == "thinking":
                        put("reasoning", key, block.get("thinking"))
                    if block.get("type") == "tool_use":
                        output["progress"] = str(block.get("name", "MCP"))
                if stream.get("type") == "content_block_delta":
                    if delta.get("type") == "text_delta":
                        put("text", key, delta.get("text"), True)
                    if delta.get("type") == "thinking_delta":
                        put("reasoning", key, delta.get("thinking"), True)
            if event.get("type") == "assistant":
                message = event.get("message") or {}
                key = str(message.get("id", self.claude_message or "message"))
                content = message.get("content") or []
                for index, block in enumerate(content):
                    if self.claude_streaming and key == self.claude_message and len(content) == 1:
                        index = self.claude_index
                    if block.get("type") == "text":
                        put("text", f"{key}:{index}", block.get("text"))
                    if block.get("type") == "thinking":
                        put("reasoning", f"{key}:{index}", block.get("thinking"))
                    if block.get("type") == "tool_use":
                        output["progress"] = str(block.get("name", "MCP"))
            if event.get("type") == "result":
                if event.get("is_error"):
                    output["error"] = error_message(
                        event.get("errors", event.get("result", "Claude failed."))
                    )
                elif isinstance(event.get("result"), str):
                    output["text"] = event["result"]
        else:
            data = event.get("data") or {}
            if event.get("agentId") or data.get("parentToolCallId"):
                return output
            key = str(data.get("messageId", data.get("reasoningId", "message")))
            kind = event.get("type")
            if kind in ("assistant.message_delta", "assistant.reasoning_delta"):
                put(
                    "text" if kind == "assistant.message_delta" else "reasoning",
                    key,
                    data.get("deltaContent"),
                    True,
                )
            if kind in ("assistant.message", "assistant.reasoning"):
                put("text" if kind == "assistant.message" else "reasoning", key, data.get("content"))
            if kind == "tool.execution_start":
                output["progress"] = str(data.get("toolName", "MCP"))
            if kind == "assistant.intent":
                output["progress"] = str(data.get("intent", ""))
            if kind == "session.error":
                output["error"] = error_message(data.get("message", "Copilot failed."))
        return output


def without_nulls(value):
    if isinstance(value, dict):
        return {k: without_nulls(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [without_nulls(v) for v in value]
    return value


async def send_rpc(process, value):
    process.stdin.write((json.dumps(value, ensure_ascii=False) + "\n").encode())
    await process.stdin.drain()


class CodexSession:
    def __init__(self, process, config, cwd, prompt, url, server_name):
        self.process, self.config, self.cwd, self.prompt = process, config, cwd, prompt
        self.url, self.server_name, self.thread_id = url, server_name, None
        self.complete = False

    async def start(self):
        await send_rpc(self.process, initialize())

    async def receive(self, event):
        if "id" in event:
            if event.get("method"):
                await send_rpc(
                    self.process,
                    {
                        "id": event["id"],
                        "error": {
                            "code": -32601,
                            "message": "Interactive input is unavailable in Synkinema chat.",
                        },
                    },
                )
                raise ValueError(
                    "The CLI requested interactive input. Check login and configuration in your terminal."
                )
            if event.get("error"):
                raise ValueError(error_message(event["error"]))
            result = event.get("result") or {}
            if event["id"] == 1:
                await send_rpc(self.process, {"method": "initialized"})
                await send_rpc(
                    self.process,
                    {"id": 2, "method": "config/read", "params": {"cwd": self.cwd, "includeLayers": False}},
                )
            if event["id"] == 2:
                config = result.get("config") or {}
                overrides = {
                    "features.hooks": False,
                    "features.plugins": False,
                    "features.apps": False,
                    "apps._default.enabled": False,
                    "notify": [],
                    "web_search": "disabled",
                    "plugins": {
                        name: {**without_nulls(value or {}), "enabled": False}
                        for name, value in (config.get("plugins") or {}).items()
                    },
                    "mcp_servers": {
                        name: {**without_nulls(value or {}), "enabled": False}
                        for name, value in (config.get("mcp_servers") or {}).items()
                    },
                }
                overrides["mcp_servers"][self.server_name] = {
                    "url": self.url,
                    "enabled": True,
                    "required": True,
                    "default_tools_approval_mode": "approve",
                }
                if self.config.reasoning_effort != "default":
                    overrides["model_reasoning_effort"] = self.config.reasoning_effort
                await send_rpc(
                    self.process,
                    {
                        "id": 3,
                        "method": "thread/start",
                        "params": {
                            "cwd": self.cwd,
                            "approvalPolicy": "never",
                            "sandbox": "read-only",
                            "ephemeral": True,
                            "config": overrides,
                            **({"model": self.config.model} if self.config.model else {}),
                        },
                    },
                )
            if event["id"] == 3:
                self.thread_id = (result.get("thread") or {}).get("id")
                if not isinstance(self.thread_id, str):
                    raise ValueError("Codex returned no thread ID. Update the CLI and try again.")
                await send_rpc(
                    self.process,
                    {
                        "id": 4,
                        "method": "turn/start",
                        "params": {
                            "threadId": self.thread_id,
                            "input": [{"type": "text", "text": self.prompt, "text_elements": []}],
                            "approvalPolicy": "never",
                            "sandboxPolicy": {"type": "readOnly"},
                            "summary": "concise",
                            **({"model": self.config.model} if self.config.model else {}),
                            **(
                                {"effort": self.config.reasoning_effort}
                                if self.config.reasoning_effort != "default"
                                else {}
                            ),
                        },
                    },
                )
        params = event.get("params") or {}
        if event.get("method") == "turn/completed" and params.get("threadId") == self.thread_id:
            turn = params.get("turn") or {}
            if turn.get("status") != "completed":
                raise ValueError(
                    error_message(turn.get("error") or f"Codex turn {turn.get('status', 'failed')}.")
                )
            self.complete = True


def initialize():
    return {
        "id": 1,
        "method": "initialize",
        "params": {"clientInfo": {"name": "synkinema", "title": "Synkinema", "version": __version__}},
    }


async def json_lines(stream, max_bytes=2_000_000) -> AsyncIterator[dict]:
    buffer, total = b"", 0
    while chunk := await stream.read(8192):
        total += len(chunk)
        if total > max_bytes:
            raise ValueError("Agent output exceeded the size limit.")
        buffer += chunk
        lines = buffer.split(b"\n")
        buffer = lines.pop()
        for line in lines:
            try:
                event = json.loads(line)
                if isinstance(event, dict):
                    yield event
            except (ValueError, UnicodeDecodeError):
                continue
    if buffer.strip():
        try:
            event = json.loads(buffer)
            if isinstance(event, dict):
                yield event
        except (ValueError, UnicodeDecodeError):
            pass


def signal_process(process, sig):
    try:
        if os.name == "posix":
            os.killpg(process.pid, sig)
        elif process.returncode is None:
            process.terminate() if sig == signal.SIGTERM else process.kill()
    except ProcessLookupError:
        pass


async def terminate(process):
    if process is None:
        return
    signal_process(process, signal.SIGTERM)

    async def drain():
        while await process.stdout.read(65536):
            pass

    drain_task = asyncio.create_task(drain())
    # Even an exited parent can leave descendants holding stdout open.
    try:
        await asyncio.wait_for(process.wait(), 2)
    except TimeoutError:
        pass
    signal_process(process, signal.SIGKILL)
    await process.wait()
    await asyncio.gather(drain_task, return_exceptions=True)


async def list_models(executable, cwd):
    process = await asyncio.create_subprocess_exec(
        executable,
        *CODEX_ARGS,
        cwd=cwd,
        env=child_environment(),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=os.name == "posix",
    )
    models, cursors, request_id = {}, set(), 2
    try:
        async with asyncio.timeout(8):
            await send_rpc(process, initialize())
            async for event in json_lines(process.stdout, 1_000_000):
                if event.get("method") and "id" in event:
                    raise ValueError("Codex requested interactive input while listing models.")
                if event.get("id") not in (1, request_id):
                    continue
                if event.get("error"):
                    raise ValueError(error_message(event["error"]))
                if event["id"] == 1:
                    await send_rpc(process, {"method": "initialized"})
                    await send_rpc(
                        process,
                        {
                            "id": request_id,
                            "method": "model/list",
                            "params": {"limit": 100, "includeHidden": False},
                        },
                    )
                    continue
                page = event.get("result") or {}
                if not isinstance(page.get("data"), list):
                    raise ValueError("Codex returned an invalid model catalog. Update the CLI.")  # noqa: TRY004 -- API validation error
                for model in page["data"]:
                    if not model.get("hidden") and isinstance(model.get("model"), str):
                        models[model["model"]] = AgentModel(
                            id=model["model"],
                            display_name=model.get("displayName", model["model"]),
                            is_default=model.get("isDefault", False),
                            reasoning_efforts=[
                                e["reasoningEffort"]
                                for e in model.get("supportedReasoningEfforts", [])
                                if isinstance(e.get("reasoningEffort"), str)
                            ],
                        )
                cursor = page.get("nextCursor")
                if not cursor:
                    return list(models.values())
                if cursor in cursors or len(cursors) >= 10:
                    raise ValueError("Codex returned an invalid model catalog cursor.")
                cursors.add(cursor)
                request_id += 1
                await send_rpc(
                    process,
                    {
                        "id": request_id,
                        "method": "model/list",
                        "params": {"limit": 100, "includeHidden": False, "cursor": cursor},
                    },
                )
            raise ValueError("Codex closed before returning its model catalog. Check login and CLI version.")
    except TimeoutError as exc:
        raise ValueError("Codex model catalog timed out. Check the CLI in your terminal.") from exc
    finally:
        await terminate(process)
