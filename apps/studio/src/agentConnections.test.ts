import { expect, it } from "vitest";
import {
  agentClientConfig,
  agentConnectionProbe,
  validMcpUrl,
} from "./agentConnections";

const url = "http://127.0.0.1:8081/mcp/";

it("produces the correct transport and configuration root for each client", () => {
  expect(agentClientConfig("codex", url)).toBe(
    `codex mcp add synkinema --url '${url}'`,
  );
  expect(agentClientConfig("claude-code", url)).toBe(
    `claude mcp add --transport http --scope user synkinema '${url}'`,
  );
  expect(agentClientConfig("copilot-cli", url)).toBe(
    `copilot mcp add --transport http synkinema '${url}'`,
  );

  const desktop = JSON.parse(agentClientConfig("claude-desktop", url));
  expect(desktop.mcpServers.synkinema.args).toEqual([
    "-y",
    "mcp-remote@0.13.5",
    url,
    "--transport",
    "http-only",
    "--allow-http",
  ]);
  expect(desktop.mcpServers.synkinema.command).toBe("npx");

  const vsCode = JSON.parse(agentClientConfig("copilot-vscode", url));
  expect(vsCode).toEqual({ servers: { synkinema: { type: "http", url } } });
  expect(JSON.parse(agentClientConfig("cursor", url))).toEqual({
    mcpServers: { synkinema: { url } },
  });
  expect(JSON.parse(agentClientConfig("gemini", url))).toEqual({
    mcpServers: { synkinema: { httpUrl: url, timeout: 180000 } },
  });
  expect(agentClientConfig("other", url)).toBe(url);
});

it("accepts MCP HTTP endpoints and quotes terminal arguments safely", () => {
  expect(validMcpUrl(url)).toBe(true);
  expect(validMcpUrl("https://example.com/private/mcp/")).toBe(true);
  expect(validMcpUrl("http://localhost:8080/api")).toBe(false);
  expect(validMcpUrl("http://localhost:8080/mcp/?token=abc")).toBe(false);
  expect(validMcpUrl("javascript:alert(1)")).toBe(false);

  const special = "http://localhost:8080/$(touch%20x)'/mcp/";
  expect(validMcpUrl(special)).toBe(true);
  expect(agentClientConfig("codex", special)).toContain("'\\''");
  expect(agentConnectionProbe).toContain(
    "Do not create, edit, render or delete",
  );
});
