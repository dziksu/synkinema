import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowDownToLine,
  Check,
  LoaderCircle,
  Mic,
  Plus,
  Square,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { reads } from "./api/queries";
import { writes } from "./api/mutations";
import { projectWrites, type ProjectEdit } from "./api/projectMutations";
import { downloadText } from "./api/download";
import type { Asset, Project } from "./types";
import type { VoiceRequest } from "./api/generated/client";
import { tr, useLocale } from "./i18n";
import VoiceGenerator from "./VoiceGenerator";
import { useLineRecorder } from "./useLineRecorder";
import {
  linesForProject,
  needsGeneratedAudio,
  newScriptLine,
  scriptContent,
  type ScriptLine,
} from "./scriptLines";

export default function ScriptEditor({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (project: Project) => void;
}) {
  useLocale();
  const query = useQueryClient();
  const media = useQuery(reads.assets(query, project.id));
  const edit = useMutation({ ...projectWrites(query), onSuccess: onSaved });
  const voice = useMutation(writes.voice(query));
  const upload = useMutation(writes.upload(query));
  const recorder = useLineRecorder();
  const [lines, setLines] = useState(() => linesForProject(project));
  const [brief, setBrief] = useState(project.brief);
  const baseline = useRef(project);
  const initialDraft = useRef(JSON.stringify({ lines, brief }));
  const [job, setJob] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerate, setRegenerate] = useState(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopped.current = true;
    };
  }, []);
  const dirty = JSON.stringify({ lines, brief }) !== initialDraft.current;
  const busy = !!job || recorder.phase !== "idle";
  const changedElsewhere =
    project.revision >= baseline.current.revision &&
    scriptContent(project) !== scriptContent(baseline.current) &&
    !edit.isPending;
  const load = (value: Project) => {
    const next = linesForProject(value);
    baseline.current = value;
    initialDraft.current = JSON.stringify({ lines: next, brief: value.brief });
    setLines(next);
    setBrief(value.brief);
    setSaved(false);
  };
  useEffect(() => {
    if (!dirty && !busy && !edit.isPending && changedElsewhere) load(project);
  }, [project, dirty, busy, edit.isPending, changedElsewhere]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const commit = async (next: ScriptLine[], nextBrief = brief) => {
    const expectedContent = scriptContent(baseline.current);
    const result = await edit.mutateAsync({
      projectId: project.id,
      resolve: (current) => {
        if (scriptContent(current) !== expectedContent)
          throw new Error(
            tr(
              "The script changed elsewhere. Reload the saved script before trying again.",
            ),
          );
        return {
          steps: [
            {
              type: "update_project",
              payload: { brief: nextBrief, script_lines: next },
            },
          ],
        };
      },
    });
    baseline.current = result;
    initialDraft.current = JSON.stringify({ lines: next, brief: nextBrief });
    if (mounted.current) {
      setLines(next);
      setBrief(nextBrief);
      setSaved(true);
    }
    return next;
  };
  const run = async (id: string, action: () => Promise<void>) => {
    setJob(id);
    setError("");
    setNotice("");
    setSaved(false);
    stopped.current = false;
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) {
        setJob(null);
        setProgress("");
      }
    }
  };
  const attach = async (
    current: ScriptLine[],
    line: ScriptLine,
    asset: Asset,
    source: ScriptLine["audio_source"],
  ) => {
    if (asset.kind !== "audio" || !asset.has_audio || !asset.duration_ms)
      throw new Error(tr("Choose an audio file with a readable duration."));
    return commit(
      current.map((item) =>
        item.id === line.id
          ? {
              ...item,
              audio_asset_id: asset.id,
              audio_text: line.text,
              audio_source: source,
            }
          : item,
      ),
    );
  };
  const importAudio = (
    line: ScriptLine,
    file: File,
    source: "recorded" | "uploaded",
  ) =>
    run(line.id, async () => {
      const current = await commit(lines);
      if (!mounted.current) return;
      const [asset] = await upload.mutateAsync({
        files: [file],
        destination: { project_id: project.id },
      });
      if (!mounted.current) return;
      await attach(current, line, asset, source);
      if (source === "recorded") recorder.cancel();
    });
  const removeAudio = (line: ScriptLine, asset: Asset) =>
    run(line.id, async () => {
      if (dirty) await commit(lines);
      const expectedContent = scriptContent(baseline.current);
      const removal: ProjectEdit = {
        projectId: project.id,
        removeAudio: {
          lineId: line.id,
          request: {
            audio_asset_id: asset.id,
            expected_version: asset.version,
          },
        },
        resolve: (current) => {
          if (scriptContent(current) !== expectedContent)
            throw new Error(
              tr(
                "The script changed elsewhere. Reload the saved script before trying again.",
              ),
            );
          return {
            steps: [
              {
                type: "update_project",
                payload: {
                  script_lines: current.script_lines.map((item) =>
                    item.id === line.id
                      ? {
                          ...item,
                          audio_asset_id: null,
                          audio_text: null,
                          audio_source: null,
                        }
                      : item,
                  ),
                  asset_ids: current.asset_ids.filter((id) => id !== asset.id),
                },
              },
            ],
          };
        },
      };
      const result = await edit.mutateAsync(removal);
      if (!mounted.current) return;
      load(result);
      setSaved(true);
      setNotice(
        removal.removalResult?.retained_asset_id
          ? tr(
              "Audio removed from this project. The shared file is kept for other projects or the library.",
            )
          : removal.removalResult?.pending_files
            ? tr(
                "Audio removed. Disk cleanup is pending and will retry automatically.",
              )
            : tr("Audio and its local file were removed."),
      );
    });
  const generate = (
    targets: ScriptLine[],
    request: (text: string) => VoiceRequest,
  ) =>
    run(targets.length === 1 ? targets[0].id : "all", async () => {
      // Freeze the text and settings; every successful line is committed before continuing.
      const requests = targets.map((line) => ({
        line,
        request: request(line.text),
      }));
      let current = await commit(lines);
      for (let i = 0; i < requests.length; i++) {
        if (stopped.current || !mounted.current) break;
        const item = requests[i];
        setProgress(
          tr("Generating line {{current}} of {{total}}…", {
            current: i + 1,
            total: requests.length,
          }),
        );
        const result = await voice.mutateAsync(item.request);
        if (!mounted.current) break;
        current = await attach(current, item.line, result.asset, "generated");
      }
    });
  const change = (id: string, text: string) => {
    setSaved(false);
    setLines((old) =>
      old.map((line) => (line.id === id ? { ...line, text } : line)),
    );
  };
  const move = (index: number, delta: number) =>
    setLines((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  const completed = lines.filter((line) => line.audio_asset_id).length;
  return (
    <div className="content-page script-page">
      <div className="section-title">
        <div>
          <span className="eyebrow">{tr("STORY FIRST")}</span>
          <h1>{tr("Script studio")}</h1>
          <p className="muted">
            {tr(
              "One line, one take. Write, record or generate your narration.",
            )}
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || !dirty}
          onClick={() =>
            void run("save", async () => {
              await commit(lines);
            })
          }
        >
          {job === "save" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          {tr("Save script")}
        </button>
      </div>
      <div className="script-status" role="status">
        <span>
          {tr("{{count}} lines · {{ready}} with audio", {
            count: lines.length,
            ready: completed,
          })}
        </span>
        <span>
          {busy
            ? progress || (edit.isPending ? tr("Saving…") : "")
            : dirty
              ? tr("Unsaved changes")
              : saved
                ? tr("Saved")
                : ""}
        </span>
      </div>
      {(error || recorder.error) && (
        <p className="warning" role="alert">
          {error || recorder.error}
        </p>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {changedElsewhere && dirty && !busy && (
        <div className="warning" role="alert">
          {tr("The script changed elsewhere. Your draft has been kept.")}{" "}
          <button
            className="button"
            onClick={() => {
              load(project);
              setError("");
            }}
          >
            {tr("Reload saved script")}
          </button>
        </div>
      )}
      <details className="script-brief">
        <summary>{tr("Brief & direction")}</summary>
        <label className="field">
          {tr("Brief")}
          <textarea
            disabled={busy}
            value={brief}
            maxLength={20000}
            onChange={(event) => setBrief(event.target.value)}
            rows={3}
            placeholder={tr("Goal, audience, emotion, direction…")}
          />
        </label>
      </details>
      <div className="script-workspace">
        <VoiceGenerator text="" projectId={project.id} busy={busy}>
          {({ request, canGenerate, limit }) => {
            const targets = lines.filter(
              (line) =>
                needsGeneratedAudio(line) ||
                (regenerate &&
                  !!line.text.trim() &&
                  line.audio_source === "generated"),
            );
            return (
              <section
                className="script-lines-panel"
                aria-label={tr("Script lines")}
              >
                <div className="script-toolbar">
                  <div>
                    <h2>{tr("Narration")}</h2>
                    <p className="hint">
                      {tr("Enter adds a line. Shift+Enter adds a line break.")}
                    </p>
                  </div>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !targets.length ||
                      !targets.every((line) => canGenerate(line.text))
                    }
                    onClick={() => void generate(targets, request)}
                  >
                    <WandSparkles size={16} />
                    {tr("Generate all")}
                  </button>
                </div>
                <p className="hint">
                  {tr(
                    "Generate all fills missing or outdated AI takes. Your recordings and uploads are kept.",
                  )}
                </p>
                {job && progress && (
                  <div className="script-progress" role="status">
                    <LoaderCircle className="spin" size={16} />
                    {progress}
                    <button
                      className="text-button"
                      disabled={stopped.current}
                      onClick={() => {
                        stopped.current = true;
                        setProgress(tr("Stopping after the current line…"));
                      }}
                    >
                      {tr("Stop after this line")}
                    </button>
                  </div>
                )}
                {media.isError && (
                  <p role="alert" className="warning">
                    {media.error.message}{" "}
                    <button
                      className="text-button"
                      onClick={() => void media.refetch()}
                    >
                      {tr("Retry")}
                    </button>
                  </p>
                )}
                <label className="script-regenerate">
                  <input
                    type="checkbox"
                    checked={regenerate}
                    disabled={busy}
                    onChange={(event) => setRegenerate(event.target.checked)}
                  />
                  {tr("Regenerate existing AI takes too")}
                </label>
                <div className="script-lines">
                  {lines.map((line, index) => {
                    const asset = media.data?.find(
                      (item) => item.id === line.audio_asset_id,
                    );
                    const outdated =
                      !!line.audio_asset_id && line.audio_text !== line.text;
                    const active = recorder.lineId === line.id;
                    return (
                      <article
                        className={`script-line${active ? " is-recording" : ""}`}
                        key={line.id}
                        aria-label={tr("Line {{number}}", {
                          number: index + 1,
                        })}
                      >
                        <div className="script-line-heading">
                          <span className="script-line-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className={outdated ? "warning" : "hint"}>
                            {outdated
                              ? tr("Text changed — review this take")
                              : line.audio_source === "recorded"
                                ? tr("Recorded")
                                : line.audio_source === "uploaded"
                                  ? tr("Uploaded")
                                  : line.audio_source === "generated"
                                    ? tr("AI-generated audio")
                                    : tr("No audio yet")}
                          </span>
                          <div className="script-line-order">
                            <button
                              className="icon-button"
                              disabled={busy || index === 0}
                              aria-label={tr("Move line up")}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={busy || index === lines.length - 1}
                              aria-label={tr("Move line down")}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={busy}
                              aria-label={tr("Remove line")}
                              onClick={() =>
                                setLines(
                                  lines.length === 1
                                    ? [newScriptLine()]
                                    : lines.filter(
                                        (item) => item.id !== line.id,
                                      ),
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <textarea
                          id={`script-line-${line.id}`}
                          aria-label={tr("Line {{number}} text", {
                            number: index + 1,
                          })}
                          value={line.text}
                          disabled={busy}
                          rows={Math.max(
                            2,
                            Math.min(8, line.text.split("\n").length),
                          )}
                          maxLength={100000}
                          placeholder={tr(
                            "Write a sentence or a short passage…",
                          )}
                          onChange={(event) =>
                            change(line.id, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key !== "Enter" ||
                              event.shiftKey ||
                              event.nativeEvent.isComposing
                            )
                              return;
                            event.preventDefault();
                            if (lines.length >= 500) return;
                            const start = event.currentTarget.selectionStart,
                              end = event.currentTarget.selectionEnd;
                            const added = newScriptLine(line.text.slice(end));
                            setLines([
                              ...lines.slice(0, index),
                              { ...line, text: line.text.slice(0, start) },
                              added,
                              ...lines.slice(index + 1),
                            ]);
                            requestAnimationFrame(() =>
                              document
                                .getElementById(`script-line-${added.id}`)
                                ?.focus(),
                            );
                          }}
                        />
                        <div className="script-line-actions">
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void recorder.start(line.id, line.text, index + 1)
                            }
                          >
                            <Mic size={15} />
                            {tr("Record")}
                          </button>
                          <label
                            className={`button script-upload${busy ? " disabled" : ""}`}
                          >
                            <Upload size={15} />
                            {tr("Upload audio")}
                            <input
                              aria-label={tr(
                                "Upload audio for line {{number}}",
                                { number: index + 1 },
                              )}
                              type="file"
                              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
                              disabled={busy}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file)
                                  void importAudio(line, file, "uploaded");
                              }}
                            />
                          </label>
                          <button
                            className="button"
                            disabled={busy || !canGenerate(line.text)}
                            onClick={() => void generate([line], request)}
                          >
                            <WandSparkles size={15} />
                            {line.audio_source === "generated"
                              ? tr("Regenerate")
                              : tr("Generate line")}
                          </button>
                          <span
                            className={
                              limit && line.text.length > limit
                                ? "warning"
                                : "hint"
                            }
                          >
                            {tr("{{count}} characters", {
                              count: line.text.length,
                            })}
                          </span>
                          {job === line.id && (
                            <LoaderCircle
                              className="spin"
                              size={16}
                              aria-label={tr("Working…")}
                            />
                          )}
                        </div>
                        {active && (
                          <div className="script-recording" role="status">
                            {recorder.phase === "permission" && (
                              <span>
                                {tr("Allow microphone access in your browser…")}
                              </span>
                            )}
                            {recorder.phase === "recording" && (
                              <>
                                <span className="recording-dot" />
                                <strong>
                                  {tr("Recording")} ·{" "}
                                  {Math.floor(recorder.elapsed / 60)}:
                                  {String(recorder.elapsed % 60).padStart(
                                    2,
                                    "0",
                                  )}
                                </strong>
                                <button
                                  className="button"
                                  onClick={recorder.stop}
                                >
                                  <Square size={14} />
                                  {tr("Stop recording")}
                                </button>
                              </>
                            )}
                            {recorder.take && (
                              <>
                                <audio
                                  controls
                                  src={recorder.take.url}
                                  aria-label={tr("Recording preview")}
                                />
                                <button
                                  className="button primary"
                                  disabled={!!job}
                                  onClick={() =>
                                    void importAudio(
                                      line,
                                      recorder.take!.file,
                                      "recorded",
                                    )
                                  }
                                >
                                  {tr("Use recording")}
                                </button>
                              </>
                            )}
                            <button
                              className="text-button"
                              disabled={!!job}
                              onClick={recorder.cancel}
                            >
                              {tr("Discard recording")}
                            </button>
                          </div>
                        )}
                        {asset && (
                          <div className="script-take">
                            <audio
                              controls
                              preload="none"
                              src={asset.url}
                              aria-label={tr("Audio for line {{number}}", {
                                number: index + 1,
                              })}
                            />
                            <span className="hint">
                              {asset.name} ·{" "}
                              {(asset.duration_ms! / 1000).toFixed(1)} s
                            </span>
                            <button
                              className="text-button"
                              disabled={busy}
                              title={tr(
                                "Remove this take from the project and disk. Its audio cannot be restored from script history. Shared files are kept.",
                              )}
                              onClick={() => void removeAudio(line, asset)}
                            >
                              <Trash2 size={14} /> {tr("Remove audio")}
                            </button>
                          </div>
                        )}
                        {line.audio_asset_id &&
                          !asset &&
                          !media.isPending &&
                          !media.isError && (
                            <p className="warning">
                              {tr(
                                "This take is unavailable. Upload or generate a replacement.",
                              )}
                            </p>
                          )}
                      </article>
                    );
                  })}
                </div>
                <div className="script-add-actions">
                  <button
                    className="button"
                    disabled={busy || lines.length >= 500}
                    onClick={() => {
                      const added = newScriptLine();
                      setLines([...lines, added]);
                      requestAnimationFrame(() =>
                        document
                          .getElementById(`script-line-${added.id}`)
                          ?.focus(),
                      );
                    }}
                  >
                    <Plus size={16} />
                    {tr("Add line")}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setBulkOpen(!bulkOpen)}
                  >
                    {tr("Paste multiple lines")}
                  </button>
                </div>
                {bulkOpen && (
                  <div className="script-paste">
                    <label className="field">
                      {tr("One passage per line")}
                      <textarea
                        value={bulkText}
                        disabled={busy}
                        onChange={(event) => setBulkText(event.target.value)}
                        rows={5}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={busy || !bulkText.trim()}
                      onClick={() => {
                        const added = bulkText
                          .split(/\r?\n/)
                          .filter((text) => text.trim())
                          .map(newScriptLine);
                        const existing =
                          lines.length === 1 &&
                          !lines[0].text &&
                          !lines[0].audio_asset_id
                            ? []
                            : lines;
                        if (existing.length + added.length > 500) {
                          setError(tr("A script can contain up to 500 lines."));
                          return;
                        }
                        setLines([...existing, ...added]);
                        setBulkText("");
                        setBulkOpen(false);
                      }}
                    >
                      {tr("Add pasted lines")}
                    </button>
                  </div>
                )}
                <p className="hint">
                  {tr(
                    "Audio is saved in project media. Add takes to a voiceover track in Edit when you are ready to arrange timing.",
                  )}
                </p>
              </section>
            );
          }}
        </VoiceGenerator>
      </div>
      {!!project.scenes.length && (
        <details className="script-scenes">
          <summary>{tr("Scene notes")}</summary>
          <div className="scene-list">
            {project.scenes.map((scene, index) => (
              <div key={scene.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{scene.title}</h3>
                  <p>{scene.narration}</p>
                  <small>{scene.notes}</small>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      <button
        className="button"
        onClick={() => {
          setError("");
          void query
            .fetchQuery(reads.captions(project.id, project.revision))
            .then((text) => downloadText(text, "captions.srt"))
            .catch((cause) => setError(cause.message));
        }}
      >
        <ArrowDownToLine size={16} />
        {tr("Download SRT subtitles")}
      </button>
    </div>
  );
}
