import { tr } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";

type Take = { lineId: string; file: File; url: string };
export function useLineRecorder() {
  const [lineId, setLineId] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "permission" | "recording" | "ready"
  >("idle");
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const session = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const preview = useRef<string | null>(null);
  const release = () => {
    session.current++;
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.ondataavailable = null;
      recorder.current.onerror = null;
      if (recorder.current.state !== "inactive") recorder.current.stop();
      recorder.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
  };
  useEffect(() => () => release(), []);
  useEffect(() => {
    if (phase !== "recording") return;
    const start = Date.now();
    const interval = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      250,
    );
    return () => window.clearInterval(interval);
  }, [phase]);
  const cancel = () => {
    release();
    setTake(null);
    setLineId(null);
    setPhase("idle");
    setElapsed(0);
  };
  const start = async (id: string, text = "", number = 1) => {
    cancel();
    setError("");
    setLineId(id);
    const token = session.current;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        tr(
          "Microphone recording requires HTTPS or localhost and a supported browser. You can upload an audio file instead.",
        ),
      );
      setLineId(null);
      return;
    }
    setPhase("permission");
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== session.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(
        input,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = active;
      const chunks: Blob[] = [];
      active.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      active.onerror = () => {
        if (token !== session.current) return;
        cancel();
        setError(tr("Recording failed. Check your microphone and try again."));
      };
      active.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        if (token !== session.current) return;
        const type = active.mimeType || chunks[0]?.type || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (!blob.size) {
          cancel();
          setError(tr("The recording was empty. Please try again."));
          return;
        }
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        const excerpt =
          text
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 60)
            .replace(/-$/, "") || "narration";
        const stamp = new Date().toISOString().replace(/[-:.]/g, "");
        const file = new File(
          [blob],
          `recording-${String(number).padStart(2, "0")}-${excerpt}-${stamp}.${extension}`,
          { type },
        );
        preview.current = URL.createObjectURL(file);
        setTake({ lineId: id, file, url: preview.current });
        setPhase("ready");
      };
      active.start(1000);
      setPhase("recording");
    } catch (cause) {
      if (token !== session.current) return;
      cancel();
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? tr(
              "Microphone access was denied. Allow it in your browser settings or upload an audio file.",
            )
          : tr(
              "Could not start recording. Check that a microphone is connected and available.",
            ),
      );
    }
  };
  return {
    lineId,
    phase,
    take,
    error,
    elapsed,
    start,
    cancel,
    stop: () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
  };
}
