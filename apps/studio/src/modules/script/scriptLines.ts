import type { ProjectSnapshot, ScriptLineOutput } from "@/api/generated/client";
import defaults from "@/api/generated/defaults.json";
import { createId } from "@/lib/createId";
export type ScriptLine = ScriptLineOutput;
export const newScriptLine = (text = ""): ScriptLine => ({
  ...defaults.script_line,
  id: createId(),
  text,
});
export function linesForProject(project: ProjectSnapshot): ScriptLine[] {
  if (project.script_lines.length) return structuredClone(project.script_lines);
  const lines = project.script.split(/\r?\n/).filter((text) => text.trim());
  return lines.length
    ? lines.map((text, i) => ({ ...newScriptLine(text), id: `legacy-${i}` }))
    : [newScriptLine()];
}
export const scriptContent = (project: ProjectSnapshot) =>
  JSON.stringify({
    brief: project.brief,
    script: project.script,
    lines: project.script_lines.map((line) => ({
      id: line.id,
      text: line.text,
      audio_asset_id: line.audio_asset_id,
      audio_text: line.audio_text,
      audio_source: line.audio_source,
    })),
  });
export const needsGeneratedAudio = (line: ScriptLine) =>
  !!line.text.trim() &&
  (!line.audio_asset_id ||
    (line.audio_source === "generated" && line.audio_text !== line.text));
