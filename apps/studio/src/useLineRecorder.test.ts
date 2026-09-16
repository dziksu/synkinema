// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useLineRecorder } from "./useLineRecorder";
let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let active: Recorder;
class Recorder {
  static isTypeSupported = (type: string) => type === "audio/mp4";
  mimeType = "audio/mp4";
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    active = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["sound"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}
beforeEach(() => {
  stopTrack = vi.fn();
  getUserMedia = vi
    .fn()
    .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  URL.createObjectURL = vi.fn().mockReturnValue("blob:take");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("requests microphone on demand, uses the browser codec and releases tracks and preview", async () => {
  const { result } = renderHook(useLineRecorder);
  expect(getUserMedia).not.toHaveBeenCalled();
  await act(async () => result.current.start("one", "Hello / world?!", 2));
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(result.current.phase).toBe("recording");
  act(() => result.current.stop());
  expect(result.current.take?.file.name).toMatch(
    /^recording-02-hello-world-\d{8}T\d{9}Z\.m4a$/,
  );
  expect(result.current.phase).toBe("ready");
  expect(stopTrack).toHaveBeenCalled();
  act(() => result.current.cancel());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:take");
});
it("releases a late permission result after unmount without starting recording", async () => {
  let resolve!: (value: unknown) => void;
  getUserMedia.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result, unmount } = renderHook(useLineRecorder);
  let task!: Promise<void>;
  act(() => {
    task = result.current.start("one");
  });
  unmount();
  await act(async () => {
    resolve({ getTracks: () => [{ stop: stopTrack }] });
    await task;
  });
  expect(stopTrack).toHaveBeenCalledOnce();
});
it("stops active recording on unmount and shows actionable permission errors", async () => {
  const { result, unmount } = renderHook(useLineRecorder);
  getUserMedia.mockRejectedValueOnce(
    new DOMException("Denied", "NotAllowedError"),
  );
  await act(async () => result.current.start("one"));
  expect(result.current.error).toContain("Microphone access was denied");
  expect(result.current.phase).toBe("idle");
  await act(async () => result.current.start("one"));
  unmount();
  expect(active.state).toBe("inactive");
  expect(stopTrack).toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
