"""Reject unknown MCP tool arguments instead of silently ignoring them.

FastMCP validates top-level tool arguments with a model that ignores extra
keys. A misspelled or guessed parameter (``term`` for ``query``, ``times_ms``
for ``timestamps_ms``) was therefore dropped without a trace and the tool ran
with its default, which looks exactly like a server bug to the caller. Nested
request models already forbid unknown fields; this applies the same rule to
the top level and says what to send instead.
"""

import difflib
from types import UnionType
from typing import Union, get_args, get_origin

from pydantic import BaseModel, ConfigDict, model_validator

# Names agents commonly guess for an accepted parameter. Suggested only when
# the tool actually accepts the target and not the guessed name.
ALIASES = {
    "term": "query",
    "q": "query",
    "search": "query",
    "keyword": "query",
    "times_ms": "timestamps_ms",
    "timestamps": "timestamps_ms",
    "times": "timestamps_ms",
    "time_ms": "timestamps_ms",
    "project": "project_id",
    "job": "job_id",
    "task": "task_id",
    "channel": "channel_id",
    "asset": "asset_id",
    "rev": "revision",
    "version": "expected_version",
}


def model_fields(annotation):
    """Field names of a pydantic-model parameter, unwrapping Optional/Union."""
    if get_origin(annotation) in (Union, UnionType):
        return set().union(*(model_fields(arg) for arg in get_args(annotation)))
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return {field.alias or name for name, field in annotation.model_fields.items()}
    return set()


def unknown_arguments_message(tool, unknown, accepted, nested):
    hints = []
    for key in unknown:
        owners = sorted(parameter for parameter, fields in nested.items() if key in fields)
        close = difflib.get_close_matches(key, sorted(accepted), n=1, cutoff=0.6)
        if owners:
            hint = f" It belongs inside '{owners[0]}'."
        elif ALIASES.get(key) in accepted:
            hint = f" Did you mean '{ALIASES[key]}'?"
        elif close:
            hint = f" Did you mean '{close[0]}'?"
        else:
            hint = ""
        hints.append(f"'{key}'.{hint}")
    return (
        f"Unknown parameter{'s' if len(unknown) > 1 else ''} for {tool}: {' '.join(hints)} "
        f"Accepted parameters: {', '.join(sorted(accepted)) or 'none'}. "
        "Unknown arguments are rejected, never ignored; nothing was executed."
    )


def strict_arguments(tool, base):
    accepted = {field.alias or name for name, field in base.model_fields.items()}
    nested = {
        field.alias or name: fields
        for name, field in base.model_fields.items()
        if (fields := model_fields(field.annotation))
    }

    def reject_unknown(cls, data):
        if isinstance(data, dict) and (unknown := sorted(set(data) - accepted)):
            raise ValueError(unknown_arguments_message(tool, unknown, accepted, nested))
        return data

    # Keep the original model name: it is what validation errors report.
    return type(
        base.__name__,
        (base,),
        {
            "__module__": base.__module__,
            "__qualname__": base.__qualname__,
            "model_config": ConfigDict(extra="forbid"),
            "reject_unknown": model_validator(mode="before")(classmethod(reject_unknown)),
        },
    )


def forbid_unknown_arguments(mcp):
    """Apply to every registered tool; call once after all tools are registered."""
    for tool in mcp._tool_manager.list_tools():
        tool.fn_metadata.arg_model = strict_arguments(tool.name, tool.fn_metadata.arg_model)
        tool.parameters["additionalProperties"] = False
