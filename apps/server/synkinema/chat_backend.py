"""The same scoped chat tools address either the native engine or Docker REST."""

from urllib.parse import quote, urlparse

import httpx

from .errors import Conflict


def local_origin(value):
    url = urlparse(value)
    if (
        url.scheme != "http"
        or url.hostname not in ("localhost", "127.0.0.1", "::1")
        or url.username
        or url.password
        or url.path not in ("", "/")
        or url.query
        or url.fragment
        or not url.port
    ):
        raise ValueError("The Docker backend must be an HTTP localhost origin with a port")
    return value.rstrip("/")


class NativeChatBackend:
    def __init__(self, service):
        self.service = service

    async def projects(self):
        return self.service.projects()

    async def project(self, project_id, revision=None):
        return self.service.summary(self.service.get(project_id, revision))

    async def assets(self, project_id):
        return self.service.assets(project_id=project_id)

    async def validate(self, project_id):
        return self.service.preflight(project_id)

    async def batch(self, project_id, request, dry_run):
        return self.service.batch(project_id, request.model_copy(update={"dry_run": dry_run}))

    async def guide(self):
        from .agent_reference import agent_guide

        return agent_guide()

    async def schema(self):
        from .models import Project

        return Project.model_json_schema()

    async def operations(self, operation=None):
        from .agent_reference import operation_reference

        return operation_reference(operation)


class RemoteChatBackend:
    def __init__(self, origin, token):
        self.origin = local_origin(origin)
        self.client = httpx.AsyncClient(
            base_url=self.origin,
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
            follow_redirects=False,
            trust_env=False,
        )

    async def request(self, method, path, **kwargs):
        response = await self.client.request(method, path, **kwargs)
        if not response.is_success:
            try:
                detail = response.json().get("detail", "Docker backend request failed")
            except ValueError:
                detail = "Docker backend request failed"
            message = detail if isinstance(detail, str) else str(detail)
            if response.status_code == 409:
                raise Conflict(message)
            if response.status_code == 404:
                raise KeyError(message)
            raise ValueError(f"{message} (HTTP {response.status_code})")
        return response

    async def projects(self):
        return (await self.request("GET", "/api/projects")).json()

    async def project(self, project_id, revision=None):
        params = {"revision": revision} if revision is not None else {}
        return (
            await self.request("GET", f"/api/projects/{quote(project_id, safe='')}", params=params)
        ).json()

    async def assets(self, project_id):
        return (await self.request("GET", "/api/assets", params={"project_id": project_id})).json()

    async def validate(self, project_id):
        return (await self.request("GET", f"/api/projects/{quote(project_id, safe='')}/preflight")).json()

    async def batch(self, project_id, request, dry_run):
        return (
            await self.request(
                "POST",
                f"/api/projects/{quote(project_id, safe='')}/operations/batch",
                json=request.model_copy(update={"dry_run": dry_run}).model_dump(mode="json"),
            )
        ).json()

    async def guide(self):
        return (await self.request("GET", "/api/agent/guide")).text

    async def schema(self):
        return (await self.request("GET", "/api/schema/project")).json()

    async def operations(self, operation=None):
        params = {"operation": operation} if operation else {}
        return (await self.request("GET", "/api/schema/operations", params=params)).json()

    async def close(self):
        await self.client.aclose()


def chat_backend(service):
    return NativeChatBackend(service) if hasattr(service, "store") else service
