import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import { workspaceSearchSchema } from "./lib/workspace-search";
import { projectSearchSchema } from "./modules/projects/project-search";

it("recovers malformed bookmarked filters and retains valid project views", () => {
  expect(
    projectSearchSchema.parse({ q: ["wrong"], sort: "unknown", view: 12 }),
  ).toEqual({ q: "", sort: "newest", view: "grid" });
  expect(
    projectSearchSchema.parse({ q: "Launch", sort: "name", view: "list" }),
  ).toEqual({ q: "Launch", sort: "name", view: "list" });
  expect(
    workspaceSearchSchema.parse({
      editorTab: "audio",
      channelTab: "reviews",
      mediaScope: "library",
      mediaId: "asset-1",
      mediaTab: "sharing",
    }),
  ).toMatchObject({
    editorTab: "audio",
    channelTab: "reviews",
    mediaScope: "library",
    mediaId: "asset-1",
    mediaTab: "sharing",
  });
  expect(
    workspaceSearchSchema.parse({
      editorTab: "unknown",
      channelTab: 12,
      mediaTab: ["sharing"],
      libraryView: "invalid",
      mediaFolder: "",
      mediaId: {},
    }),
  ).toEqual({
    editorTab: undefined,
    channelTab: undefined,
    mediaTab: undefined,
    libraryView: undefined,
    mediaFolder: undefined,
    mediaId: undefined,
  });
});

it("keeps raw HTTP and generated client access inside the API/server boundaries", () => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const violations: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(path) || /\.test\.ts$/.test(path)) continue;
      const name = relative(root, path);
      if (name.startsWith("api/generated/")) continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
          /^(fetch|axios|XMLHttpRequest|EventSource|WebSocket|Api|HttpClient)$/.test(
            node.expression.getText(source),
          ) &&
          !["api/transport.ts", "server/backend.server.ts"].includes(name)
        )
          violations.push(`${name}: ${node.expression.getText(source)}`);
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          /api\/(transport|generated\/client)/.test(
            node.moduleSpecifier.text,
          ) &&
          !name.startsWith("api/")
        ) {
          const clause = node.importClause;
          const bindings = clause?.namedBindings;
          const typeOnly =
            clause?.isTypeOnly ||
            (!clause?.name &&
              bindings &&
              ts.isNamedImports(bindings) &&
              bindings.elements.every((element) => element.isTypeOnly));
          if (!typeOnly) violations.push(`${name}: runtime client import`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  walk(root);
  expect(violations).toEqual([]);
});
