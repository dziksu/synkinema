/// <reference types="vite/client" />
import { expect, it } from "vitest";
import ts from "typescript";
import en from "./locales/en.json";

const sources = import.meta.glob(
  ["./**/*.ts", "./**/*.tsx", "!./**/*.test.*"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

it("keeps all translation keys in the English catalog and UI prose out of raw JSX", () => {
  const issues: string[] = [];
  // Product names, versions, units and symbols are language-neutral.
  const neutral = new Set([
    "synkinema",
    "β",
    "0.1",
    "/",
    "r",
    "JSON",
    "×",
    "FPS",
    ":",
    "%",
    "· r",
    "http://localhost:8080/mcp/",
    "·",
    "LUFS",
    "MB",
    "dBTP",
    "LU",
    "s",
    "◇",
    "◆",
  ]);
  for (const [file, code] of Object.entries(sources)) {
    const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    function walk(node: ts.Node) {
      const where = `${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}`;
      if (ts.isCallExpression(node) && node.expression.getText(tree) === "tr") {
        const key = node.arguments[0];
        if (!key || !ts.isStringLiteral(key))
          issues.push(`${where}: use a literal translation key`);
        else if (
          !(key.text in en) &&
          !(`${key.text}_one` in en && `${key.text}_other` in en)
        )
          issues.push(`${where}: missing English key ${key.text}`);
      }
      if (
        ts.isJsxAttribute(node) &&
        ["aria-label", "title", "label", "placeholder", "alt"].includes(
          node.name.getText(tree),
        ) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        node.initializer.text &&
        !neutral.has(node.initializer.text)
      )
        issues.push(
          `${where}: untranslated accessible label ${node.initializer.text}`,
        );
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, " ").trim();
        if (text && !neutral.has(text))
          issues.push(`${where}: untranslated JSX ${text}`);
      }
      if (
        (ts.isStringLiteral(node) ||
          ts.isJsxText(node) ||
          ts.isTemplateLiteralToken(node)) &&
        /[ąćęłńóśźż]/i.test(node.text)
      )
        issues.push(`${where}: Polish UI literal outside a locale catalog`);
      ts.forEachChild(node, walk);
    }
    walk(tree);
  }
  expect(issues).toEqual([]);
});
