"""Scriptable REST client. JSON on stdout, actionable failures on stderr, no shell execution."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx


def build_parser():
    parser = argparse.ArgumentParser(prog="synkinema")
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    commands = parser.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8080)
    for name in ("projects", "guide", "capabilities"):
        commands.add_parser(name)
    schema = commands.add_parser("schema")
    schema.add_argument("kind", choices=["project", "operations"])
    schema.add_argument("--operation", help="Select one operation payload schema")
    create = commands.add_parser("create")
    create.add_argument("name")
    imp = commands.add_parser("import")
    imp.add_argument("file", type=Path)
    imp.add_argument("--source", default="")
    imp.add_argument("--license", default="")
    imp.add_argument("--tag", action="append", default=[])
    assets = commands.add_parser("assets")
    assets.add_argument("--query", default="")
    assets.add_argument("--kind", choices=["image", "video", "audio"])
    commands.add_parser("asset").add_argument("asset_id")
    for name in ("project", "validate", "points", "captions"):
        command = commands.add_parser(name)
        command.add_argument("project_id")
        command.add_argument("--revision", type=int)
        if name == "captions":
            command.add_argument("--include-muted", action="store_true")
    for name in ("history", "comments"):
        commands.add_parser(name).add_argument("project_id")
    resolve = commands.add_parser("resolve-comment")
    resolve.add_argument("project_id")
    resolve.add_argument("comment_id")
    clone = commands.add_parser("clone")
    clone.add_argument("project_id")
    clone.add_argument("name")
    clone.add_argument("--revision", type=int, required=True)
    for name in ("edit", "batch"):
        command = commands.add_parser(name, help="Submit a JSON envelope from a UTF-8 file, or - for stdin")
        command.add_argument("project_id")
        command.add_argument("file")
        if name == "batch":
            command.add_argument("--dry-run", action="store_true")
    render = commands.add_parser("render")
    render.add_argument("project_id")
    render.add_argument("--preview", action="store_true")
    render.add_argument("--expected-revision", type=int, help="Default: read current revision then pin it")
    render.add_argument("--from-ms", type=int, default=0)
    render.add_argument("--to-ms", type=int)
    render.add_argument("--wait", action="store_true")
    render.add_argument("--timeout", type=float, default=180)
    commands.add_parser("jobs").add_argument("--project-id")
    for name in ("job", "cancel", "wait"):
        command = commands.add_parser(name)
        command.add_argument("job_id")
        if name == "wait":
            command.add_argument("--timeout", type=float, default=180)
    request = commands.add_parser(
        "request", help="Access every REST endpoint; use /api/openapi.json for schemas"
    )
    request.add_argument("method", choices=["GET", "POST", "PUT", "PATCH", "DELETE"])
    request.add_argument("path", help="Relative /api/... path, optionally with query parameters")
    request.add_argument("--json-file", help="JSON body file, or - for stdin")
    return parser


def read_json(filename):
    return json.loads(sys.stdin.read() if filename == "-" else Path(filename).read_text(encoding="utf-8"))


def checked(response):
    response.raise_for_status()
    return response


def wait_job(client, job_id, timeout):
    if timeout <= 0:
        raise ValueError("timeout must be positive")
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(
                f"Job {job_id} still pending; resume with 'synkinema wait {job_id}' (not cancelled)"
            )
        response = checked(client.get(f"/api/jobs/{job_id}", timeout=min(remaining, 30)))
        job = response.json()
        if job["status"] in ("failed", "cancelled"):
            raise ValueError(f"Job {job_id}: {job['status']}: {job.get('error') or job.get('phase')}")
        if job["status"] == "completed":
            return response
        time.sleep(min(1.5, max(0, deadline - time.monotonic())))


def dispatch(client, args):
    command = args.command
    simple = {"projects": "/api/projects", "guide": "/api/agent/guide", "capabilities": "/api/capabilities"}
    if command in simple:
        return client.get(simple[command])
    if command == "schema":
        return client.get(
            f"/api/schema/{args.kind}", params={"operation": args.operation} if args.operation else {}
        )
    if command == "assets":
        return client.get(
            "/api/assets", params={"q": args.query, **({"kind": args.kind} if args.kind else {})}
        )
    if command == "asset":
        return client.get(f"/api/assets/{args.asset_id}")
    if command == "jobs":
        return client.get("/api/jobs", params={"project_id": args.project_id} if args.project_id else {})
    if command in ("job", "cancel"):
        return client.request(
            "POST" if command == "cancel" else "GET",
            f"/api/jobs/{args.job_id}" + ("/cancel" if command == "cancel" else ""),
        )
    if command == "wait":
        return wait_job(client, args.job_id, args.timeout)
    if command == "create":
        return client.post("/api/projects", json={"name": args.name})
    if command == "import":
        with args.file.open("rb") as file:
            return client.post(
                "/api/assets",
                files={"file": (args.file.name, file)},
                data={"tags": json.dumps(args.tag), "source": args.source, "license": args.license},
            )
    if command == "request":
        if not args.path.startswith("/api/"):
            raise ValueError("request path must start with /api/ on the configured server")
        return client.request(
            args.method, args.path, **({"json": read_json(args.json_file)} if args.json_file else {})
        )
    base = f"/api/projects/{args.project_id}"
    if command in ("project", "validate", "points", "captions", "history", "comments"):
        suffix = {
            "project": "",
            "validate": "/preflight",
            "points": "/inspection/points",
            "captions": "/captions.srt",
            "history": "/history",
            "comments": "/comments",
        }[command]
        params = {"revision": args.revision} if getattr(args, "revision", None) is not None else {}
        if command == "captions" and args.include_muted:
            params["include_muted"] = "true"
        return client.get(base + suffix, params=params)
    if command == "resolve-comment":
        return client.patch(base + f"/comments/{args.comment_id}")
    if command == "clone":
        return client.post(base + "/clone", json={"name": args.name, "revision": args.revision})
    if command in ("edit", "batch"):
        body = read_json(args.file)
        if command == "batch" and args.dry_run:
            body["dry_run"] = True
        return client.post(base + ("/operations/batch" if command == "batch" else "/operations"), json=body)
    if command == "render":
        revision = args.expected_revision
        if revision is None:
            revision = checked(client.get(base)).json()["revision"]
        response = checked(
            client.post(
                base + "/renders",
                json={
                    "expected_revision": revision,
                    "quality": "preview" if args.preview else "final",
                    "from_ms": args.from_ms,
                    "to_ms": args.to_ms,
                },
            )
        )
        return wait_job(client, response.json()["id"], args.timeout) if args.wait else response
    raise ValueError(f"Unsupported command {command}")


def main():
    args = build_parser().parse_args()
    if args.command == "serve":
        import uvicorn

        uvicorn.run(
            "synkinema.app:create_app",
            factory=True,
            host=args.host,
            port=args.port,
            timeout_graceful_shutdown=5,
        )
        return
    token = os.environ.get("SYNKINEMA_API_TOKEN")
    try:
        with httpx.Client(
            base_url=args.url, headers={"Authorization": f"Bearer {token}"} if token else {}, timeout=120
        ) as client:
            response = checked(dispatch(client, args))
            if "application/json" in response.headers.get("content-type", ""):
                print(json.dumps(response.json(), ensure_ascii=False, indent=2))
            else:
                print(response.text)
    except (httpx.HTTPError, OSError, ValueError, TypeError) as exc:
        detail = exc.response.text if isinstance(exc, httpx.HTTPStatusError) else str(exc)
        print(json.dumps({"error": detail}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
