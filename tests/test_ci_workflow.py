"""Exercise hosted release gating without starting billable Actions jobs."""

import ast
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def workflow(name):
    # BaseLoader preserves GitHub's `on` key instead of treating it as YAML 1.1 true.
    return yaml.load((ROOT / ".github/workflows" / name).read_text(), Loader=yaml.BaseLoader)


def condition(expression, context):
    if not expression:
        return True
    expression = re.sub(
        r"\b(?:github|needs)\.[\w.-]+",
        lambda match: repr(context[match.group()]),
        expression,
    )
    expression = expression.replace("&&", " and ").replace("||", " or ")
    expression = re.sub(r"\btrue\b", "True", expression)
    expression = re.sub(r"\bfalse\b", "False", expression)

    def evaluate(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BoolOp):
            values = [evaluate(value) for value in node.values]
            return all(values) if isinstance(node.op, ast.And) else any(values)
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            left, right = evaluate(node.left), evaluate(node.comparators[0])
            if isinstance(node.ops[0], ast.Eq):
                return left == right
            if isinstance(node.ops[0], ast.NotEq):
                return left != right
        raise AssertionError(f"Unsupported workflow condition: {expression}")

    return evaluate(ast.parse(expression.strip(), mode="eval").body)


def active_jobs(event, ref, *, version="", ready="", head_ref="", failure=None):
    context = {
        "github.event_name": event,
        "github.ref": ref,
        "github.head_ref": head_ref,
        "github.event.repository.fork": False,
        "needs.release-plan.outputs.version": version,
        "needs.release-plan.outputs.ready": ready,
        "needs.release.outputs.version": version,
    }
    states = {}
    for name, job in workflow("ci.yml")["jobs"].items():
        needs = job.get("needs", [])
        if isinstance(needs, str):
            needs = [needs]
        if any(states[dependency] != "success" for dependency in needs):
            states[name] = "skipped"
        elif condition(job.get("if"), context):
            states[name] = "failure" if name == failure else "success"
        else:
            states[name] = "skipped"
    return {name for name, state in states.items() if state != "skipped"}


@pytest.mark.parametrize(
    ("event", "ref", "options", "expected"),
    [
        ("pull_request", "refs/pull/1/merge", {}, set()),
        ("push", "refs/heads/main", {}, {"release-plan"}),
        (
            "push",
            "refs/heads/main",
            {"version": "1.2.3", "ready": "false"},
            {"release-plan", "release-pr"},
        ),
        (
            "workflow_dispatch",
            "refs/heads/chore/release",
            {},
            {"release-metadata"},
        ),
        (
            "pull_request",
            "refs/pull/2/merge",
            {"head_ref": "chore/release"},
            {"release-metadata"},
        ),
        (
            "push",
            "refs/heads/main",
            {"version": "1.2.3", "ready": "true"},
            {"release-plan", "verify", "docker", "release", "publish"},
        ),
    ],
)
def test_only_ready_releases_start_expensive_jobs(event, ref, options, expected):
    assert active_jobs(event, ref, **options) == expected


@pytest.mark.parametrize("failure", ["verify", "docker"])
def test_verification_failures_prevent_tag_and_image_publication(failure):
    jobs = active_jobs("push", "refs/heads/main", version="1.2.3", ready="true", failure=failure)
    assert "release" not in jobs
    assert "publish" not in jobs


def test_launcher_matrix_is_built_only_for_publication_and_codeql_is_manual():
    ci = workflow("ci.yml")
    assert "local-helper" not in ci["jobs"]
    assert ci["on"]["pull_request"]["branches"] == ["main"]
    assert ci["concurrency"]["cancel-in-progress"] == "false"
    assert ci["jobs"]["verify"]["steps"][-1]["run"] == ("make check PYTHON=python RUFF=ruff")
    assert len(ci["jobs"]["docker"]["strategy"]["matrix"]["include"]) == 2
    release = workflow("release.yml")
    assert release["jobs"]["local-helper"]["needs"] == "image"
    assert release["jobs"]["local-helper"]["with"]["publish"] == "true"
    assert set(workflow("codeql.yml")["on"]) == {"workflow_dispatch"}
