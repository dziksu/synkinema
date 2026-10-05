import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "serve_container", Path(__file__).parents[1] / "scripts/serve_container.py"
)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

ROUTES = """Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT
eth0 00000000 010013AC 0003 0 0 0 00000000 0 0 0
eth0 000013AC 00000000 0001 0 0 0 0000FFFF 0 0 0
"""


@pytest.mark.parametrize("bind", ["127.0.0.1", "127.0.0.2", "::1"])
def test_loopback_published_container_trusts_its_gateway_only(tmp_path, bind):
    route = tmp_path / "route"
    route.write_text(ROUTES)
    env = launcher.studio_environment(
        {"SYNKINEMA_PUBLISHED_BIND_HOST": bind, "OTHER_SETTING": "preserved"}, route
    )
    assert env["SYNKINEMA_AGENT_CHAT_PROXY_PEER"] == "172.19.0.1"
    assert env["OTHER_SETTING"] == "preserved"


@pytest.mark.parametrize("bind", ["", "0.0.0.0", "::", "192.168.1.10", "localhost", "invalid"])
def test_lan_or_unknown_publication_cannot_enable_gateway_trust(tmp_path, bind):
    route = tmp_path / "route"
    route.write_text(ROUTES)
    env = launcher.studio_environment(
        {"SYNKINEMA_PUBLISHED_BIND_HOST": bind, "SYNKINEMA_AGENT_CHAT_PROXY_PEER": "192.168.1.10"},
        route,
    )
    assert "SYNKINEMA_AGENT_CHAT_PROXY_PEER" not in env


@pytest.mark.parametrize(
    "routes",
    [None, "", "header\neth0 00000000 INVALID 0003 0 0 0 0", "header\neth0 00000000 00000000 0001 0 0 0 0"],
)
def test_missing_or_invalid_gateway_keeps_default_guard(tmp_path, routes):
    route = tmp_path / "route"
    if routes is not None:
        route.write_text(routes)
    env = launcher.studio_environment({"SYNKINEMA_PUBLISHED_BIND_HOST": "127.0.0.1"}, route)
    assert "SYNKINEMA_AGENT_CHAT_PROXY_PEER" not in env


def test_route_selection_uses_active_default_gateway_with_lowest_metric(tmp_path):
    route = tmp_path / "route"
    route.write_text(
        ROUTES
        + "eth1 00000000 010014AC 0003 0 0 20 00000000 0 0 0\n"
        + "eth2 00000000 010015AC 0002 0 0 0 00000000 0 0 0\n"
    )
    env = launcher.studio_environment({"SYNKINEMA_PUBLISHED_BIND_HOST": "127.0.0.1"}, route)
    assert env["SYNKINEMA_AGENT_CHAT_PROXY_PEER"] == "172.19.0.1"
