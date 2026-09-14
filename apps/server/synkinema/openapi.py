"""Publish precise operation unions from the same catalog consumed by MCP agents."""

import json
from copy import deepcopy

from fastapi.openapi.utils import get_openapi

from .agent_reference import operation_reference


def install_openapi(app):
    def openapi():
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title, version=app.version, description=app.description, routes=app.routes
        )
        components = schema["components"]["schemas"]
        steps, operations = [], []
        for kind, record in operation_reference()["operations"].items():
            payload = deepcopy(record["payload_schema"])
            definitions = payload.pop("$defs", {})
            for name, value in definitions.items():
                components[f"Edit{name}"] = json.loads(
                    json.dumps(value).replace("#/$defs/", "#/components/schemas/Edit")
                )
            payload = json.loads(json.dumps(payload).replace("#/$defs/", "#/components/schemas/Edit"))
            name = "".join(word.title() for word in kind.split("_"))
            properties = {"type": {"type": "string", "enum": [kind]}, "payload": payload}
            for suffix, target, required in [
                ("Step", steps, []),
                ("Operation", operations, ["expected_revision"]),
            ]:
                properties_for_type = deepcopy(properties)
                if required:
                    properties_for_type["expected_revision"] = {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Last confirmed server revision. Serialize writes; conflicts reject atomically.",
                    }
                key = name + suffix
                components[key] = {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["type", "payload", *required],
                    "properties": properties_for_type,
                    "description": record["description"],
                    "examples": [
                        {
                            "type": kind,
                            "payload": record["example_payload"],
                            **({"expected_revision": 1} if required else {}),
                        }
                    ],
                }
                target.append({"$ref": f"#/components/schemas/{key}"})
        for name, variants in [("EditStep", steps), ("Operation", operations)]:
            components[name] = {"oneOf": variants, "discriminator": {"propertyName": "type"}}
        for name in ("project_schema", "operation_schema"):
            for path in schema["paths"].values():
                for route in path.values():
                    if isinstance(route, dict) and route.get("operationId") == name:
                        route["responses"]["200"]["content"]["application/json"]["schema"] = {
                            "type": "object",
                            "additionalProperties": True,
                            "description": "JSON Schema discovery document; operation payloads are also typed in OpenAPI components.",
                        }
        schema["components"]["securitySchemes"] = {
            "OptionalBearer": {
                "type": "http",
                "scheme": "bearer",
                "description": "Required only when SYNKINEMA_API_TOKEN is configured. Studio and API use the same origin.",
            }
        }
        for path in schema["paths"].values():
            for route in path.values():
                if isinstance(route, dict) and "operationId" in route:
                    route["security"] = [{}, {"OptionalBearer": []}]
        app.openapi_schema = schema
        return schema

    app.openapi = openapi
