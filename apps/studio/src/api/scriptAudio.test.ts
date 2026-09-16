import { QueryClient, MutationObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import cases from "@/api/generated/edit-cases.json";
import type { ProjectSnapshot, Asset } from "@/api/generated/client";
import {
  projectAfter,
  replacedAudioIds,
  type EditPlan,
} from "@/api/projectReducer";
import { projectWrites } from "@/api/projectMutations";
import { keys } from "@/api/queries";
import { http } from "@/api/transport";

const fixture = () =>
  structuredClone(
    cases.find((item) => item.name === "replace_script_audio")!,
  ) as unknown as {
    before: ProjectSnapshot;
    after: ProjectSnapshot;
    plan: EditPlan & { audioAssets: Record<string, Asset> };
  };

it("projects server-measured take replacement with exact backend parity and no invented revision", () => {
  const sample = fixture();
  expect(replacedAudioIds(sample.before, sample.plan.steps)).toEqual([
    "old",
    "new",
  ]);
  const projected = projectAfter(sample.before, sample.plan);
  expect(projected.revision).toBe(sample.before.revision);
  expect({ ...projected, revision: sample.after.revision }).toEqual(
    sample.after,
  );
  expect(projected.tracks[0].clips[0]).toMatchObject({
    asset_id: "new",
    start_ms: 100,
    duration_ms: 700,
    gain_db: -4,
    fade_out_ms: 700,
  });
});

it("does not invent decoded duration when measured assets are unavailable", () => {
  const sample = fixture();
  const projected = projectAfter(sample.before, { steps: sample.plan.steps });
  expect(projected.tracks).toEqual(sample.before.tracks);
});

it("swaps two line takes without applying the second replacement to the first clip", () => {
  const sample = fixture();
  const other = {
    ...sample.before.script_lines[0],
    id: "second",
    audio_asset_id: "new",
  };
  sample.before.script_lines.push(other);
  sample.before.tracks[0].clips.push({
    ...sample.before.tracks[0].clips[0],
    id: "second-clip",
    start_ms: 1800,
    duration_ms: 700,
    fade_out_ms: 0,
    asset_id: "new",
  });
  const plan: EditPlan = {
    audioAssets: sample.plan.audioAssets,
    steps: [
      {
        type: "update_project",
        payload: {
          script_lines: [
            { ...sample.before.script_lines[0], audio_asset_id: "new" },
            { ...other, audio_asset_id: "old" },
          ],
        },
      },
    ],
  };
  const projected = projectAfter(sample.before, plan);
  expect(projected.tracks[0].clips.map((clip) => clip.asset_id)).toEqual([
    "new",
    "old",
  ]);
  expect(projected.scenes[0].voice_asset_id).toBe("new");
});

it("rolls back the line, scene and clip together when the revision-guarded save fails", async () => {
  const sample = fixture();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(keys.project(sample.before.id), sample.before);
  client.setQueryData(keys.projects, [sample.before]);
  const assetRead = vi
    .spyOn(http.api, "assets")
    .mockResolvedValue(Object.values(sample.plan.audioAssets));
  let rejectSave: (reason: Error) => void = () => {};
  const write = vi.spyOn(http.api, "operation").mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
  );
  const observer = new MutationObserver(client, projectWrites(client));
  const saving = observer.mutate({
    projectId: sample.before.id,
    resolve: () => ({ steps: sample.plan.steps }),
  });
  // Attach rejection handling before resolving the pending transport.
  const outcome = saving.catch((error) => error);
  try {
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    const pending = client.getQueryData<ProjectSnapshot>(
      keys.project(sample.before.id),
    )!;
    expect(pending.tracks[0].clips[0].asset_id).toBe("new");
    expect(pending.revision).toBe(1);
    expect(write.mock.calls[0][1].expected_revision).toBe(1);
    rejectSave(new Error("revision conflict"));
    expect((await outcome).message).toBe("revision conflict");
    expect(client.getQueryData(keys.project(sample.before.id))).toEqual(
      sample.before,
    );
    expect(client.getQueryData(keys.projects)).toEqual([sample.before]);
    expect(assetRead.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  } finally {
    vi.restoreAllMocks();
    client.clear();
  }
});
