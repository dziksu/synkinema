"""One loopback origin: host chat plus streaming Docker UI/API/media proxy."""

import contextlib
import secrets
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from .chat_backend import RemoteChatBackend
from .chat_contract import REST_DESCRIPTIONS
from .chat_routes import local_request, register_chat_http
from .chat_service import ChatService
from .chat_store import ChatStore
from .errors import Conflict

HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def proxy_headers(headers):
    blocked = HOP_HEADERS | {name.strip().lower() for name in headers.get("connection", "").split(",")}
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in blocked
        and not key.lower().startswith("x-forwarded-")
        and key.lower() != "forwarded"
    }


def create_local_app(backend_url, token, chat_directory, *, read_only=False, on_stop=None):
    backend = RemoteChatBackend(backend_url, token)
    store = ChatStore(chat_directory)
    chat = ChatService(backend, store, read_only=read_only)
    chat.enabled = True
    proxy = httpx.AsyncClient(
        timeout=httpx.Timeout(None, connect=10, pool=10), trust_env=False, follow_redirects=False
    )

    @contextlib.asynccontextmanager
    async def lifespan(app):
        try:
            yield
        finally:
            try:
                await chat.close()
            finally:
                await backend.close()
                await proxy.aclose()
                store.engine.dispose()

    app = FastAPI(title="Synkinema local", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.chat, app.state.backend = chat, backend

    @app.middleware("http")
    async def local_only(request, call_next):
        origin = request.headers.get("origin")
        try:
            parsed = urlparse(origin) if origin else None
            same_origin = not parsed or (
                parsed.scheme == "http"
                and parsed.port == request.url.port
                and parsed.hostname in ("localhost", "127.0.0.1", "::1")
            )
        except ValueError:
            same_origin = False
        if (
            not local_request(request)
            or not same_origin
            or request.headers.get("sec-fetch-site") == "cross-site"
        ):
            return JSONResponse({"detail": "Synkinema local requires a local connection"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(Conflict)
    async def conflict(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(KeyError)
    async def missing(request, exc):
        return JSONResponse({"detail": str(exc).strip("'")}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.api_route("/__synkinema_local/{action}", methods=["GET", "POST"], include_in_schema=False)
    async def control(action: str, request: Request):
        if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            return JSONResponse({"detail": "Bearer token required"}, status_code=401)
        if action == "status" and request.method == "GET":
            return {"running": True, "mode": "docker-local", "port": request.url.port}
        if action == "stop" and request.method == "POST":
            return JSONResponse(
                {"stopping": True}, status_code=202, background=BackgroundTask(on_stop or (lambda: None))
            )
        return JSONResponse({"detail": "Unknown control action"}, status_code=404)

    register_chat_http(app, chat)
    for route in app.routes:
        if route.name in REST_DESCRIPTIONS:
            route.description = REST_DESCRIPTIONS[route.name]

    @app.api_route(
        "/{path:path}",
        methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        include_in_schema=False,
    )
    async def docker_proxy(path: str, request: Request):
        raw_path = request.scope["raw_path"].decode("ascii")
        if raw_path.startswith("//"):
            return JSONResponse({"detail": "Invalid proxy path"}, status_code=400)
        query = request.scope["query_string"].decode("ascii")
        url = backend.origin + raw_path + ("?" + query if query else "")
        headers = proxy_headers(request.headers)
        headers["authorization"] = f"Bearer {token}"
        headers["accept-encoding"] = "identity"
        body = request.stream() if request.method not in ("GET", "HEAD") else None
        try:
            upstream = await proxy.send(
                proxy.build_request(request.method, url, headers=headers, content=body), stream=True
            )
        except httpx.HTTPError:
            return JSONResponse({"detail": "The Synkinema Docker backend is unavailable"}, status_code=502)
        return StreamingResponse(
            upstream.aiter_raw(),
            status_code=upstream.status_code,
            headers=proxy_headers(upstream.headers),
            background=BackgroundTask(upstream.aclose),
        )

    return app
