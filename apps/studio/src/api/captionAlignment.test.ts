import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import cases from "@/api/generated/edit-cases.json";
import defaults from "@/api/generated/defaults.json";
import type { ProjectSnapshot } from "@/api/generated/client";
import type { Clip, Profile } from "@/lib/types";
import { projectWrites } from "@/api/projectMutations";
import { keys, reads } from "@/api/queries";
import { http } from "@/api/transport";

it.each([{ text_align: "center" as const }, { text_auto_center: true }])(
  "caches caption layout $text_auto_center $text_align separately and forwards cancellation",
  async (changes) => {
    const client = new QueryClient();
    const request = {
      clip: defaults.clip as Clip,
      profile: defaults.profile as Profile,
    };
    const preview = vi.spyOn(http.api, "previewCaption").mockResolvedValue({
      url: "/media/left.png",
      width: 1080,
      height: 1920,
      bounds: null,
    });
    try {
      await client.fetchQuery(reads.captionPreview(request));
      const centered = {
        ...request,
        clip: { ...request.clip, ...changes },
      };
      preview.mockResolvedValue({
        url: "/media/center.png",
        width: 1080,
        height: 1920,
        bounds: null,
      });
      await client.fetchQuery(reads.captionPreview(centered));
      await client.fetchQuery(reads.captionPreview(request));
      expect(preview).toHaveBeenCalledTimes(2);
      expect(preview.mock.calls[1][0].clip).toMatchObject(changes);
      expect(preview.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
      expect(
        client.getQueryData(reads.captionPreview(request).queryKey)?.url,
      ).toBe("/media/left.png");
    } finally {
      vi.restoreAllMocks();
      client.clear();
    }
  },
);

it.each([
  { field: "text_align" as const, firstValue: "center", nextValue: "right" },
  { field: "text_auto_center" as const, firstValue: true, nextValue: false },
])(
  "rolls back $field and cancels dependent queued edits on a revision conflict",
  async ({ field, firstValue, nextValue }) => {
    const before = structuredClone(
      cases[0].before,
    ) as unknown as ProjectSnapshot;
    const track = before.tracks.find((t) => t.kind === "text")!;
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    client.setQueryData(keys.project(before.id), before);
    client.setQueryData(keys.projects, [before]);
    let rejectSave: (reason: Error) => void = () => {};
    const write = vi.spyOn(http.api, "operation").mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const observer = new MutationObserver(client, projectWrites(client));
    const change = (value: string | boolean) =>
      observer
        .mutate({
          projectId: before.id,
          resolve: () => ({
            steps: [
              {
                type: "update_clip",
                payload: {
                  track_id: track.id,
                  clip_id: track.clips[0].id,
                  changes: { [field]: value },
                },
              },
            ],
          }),
        })
        .catch((error) => error);
    try {
      const first = change(firstValue);
      await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
      const second = change(nextValue);
      await vi.waitFor(() =>
        expect(
          client
            .getQueryData<ProjectSnapshot>(keys.project(before.id))
            ?.tracks.find((t) => t.id === track.id)?.clips[0][field],
        ).toBe(nextValue),
      );
      expect(write.mock.calls[0][1].expected_revision).toBe(before.revision);
      rejectSave(new Error("revision conflict"));
      expect((await first).message).toBe("revision conflict");
      expect(await second).toBeInstanceOf(Error);
      expect(write).toHaveBeenCalledOnce();
      expect(client.getQueryData(keys.project(before.id))).toEqual(before);
    } finally {
      vi.restoreAllMocks();
      client.clear();
    }
  },
);
