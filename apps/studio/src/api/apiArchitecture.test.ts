/// <reference types="vite/client" />
import { expect, it } from "vitest";
import ts from "typescript";
const sources = import.meta.glob(
  ["../**/*.ts", "../**/*.tsx", "!../**/*.test.*", "!../api/generated/**"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
it("enforces TanStack Query and generated transport boundaries for every web API call", () => {
  expect(Object.keys(sources).some((file) => file.endsWith("/App.tsx"))).toBe(
    true,
  );
  expect(
    Object.keys(sources).some((file) => file.endsWith("/queries.ts")),
  ).toBe(true);
  const violations: string[] = [];
  const transportConsumers = new Set([
    "./queries.ts",
    "./mutations.ts",
    "./projectMutations.ts",
    "./queryClient.ts",
  ]);
  for (const [rawFile, code] of Object.entries(sources)) {
    const file = rawFile.replace(/^\.\.\/api\//, "./");
    const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (
        (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
        /^(fetch|window\.fetch|globalThis\.fetch|XMLHttpRequest|EventSource|WebSocket|axios(?:\..+)?)$/.test(
          node.expression.getText(tree),
        ) &&
        file !== "./transport.ts"
      )
        violations.push(`${file}: direct network access`);
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const module = node.moduleSpecifier.text;
        if (module.endsWith("transport") && !transportConsumers.has(file))
          violations.push(`${file}: transport bypass`);
        const valueImport =
          node.importClause &&
          !node.importClause.isTypeOnly &&
          (!node.importClause.namedBindings ||
            !ts.isNamedImports(node.importClause.namedBindings) ||
            node.importClause.namedBindings.elements.some(
              (e) => !e.isTypeOnly,
            ));
        if (
          /generated\/client$/.test(module) &&
          valueImport &&
          file !== "./transport.ts"
        )
          violations.push(`${file}: generated HTTP client bypass`);
      }
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node)) &&
        node.text.startsWith("/api/") &&
        node.text !== "/api/docs"
      )
        violations.push(`${file}: hand-written API URL`);
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  expect(violations).toEqual([]);
});
