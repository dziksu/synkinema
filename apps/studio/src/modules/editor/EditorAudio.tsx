import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { tr, trackKindLabel } from "@/lib/i18n";
import AudioView from "@/modules/editor/audio/AudioView";
import type { EditorController } from "@/modules/editor/hooks/use-editor-controller";
import { Activity, LoaderCircle, Music2, Volume2, VolumeX } from "lucide-react";
export function EditorAudio({ controller }: { controller: EditorController }) {
  const { inspectBusy, audio, project, operation, edit, inspect } = controller;
  if (!project) return null;
  return (
    <div className="content-page">
      <div className="section-title">
        <div>
          <span className="eyebrow">{tr("MIX CONTROL")}</span>
          <h1>{tr("Give every sound its space.")}</h1>
          <p>
            {" "}
            {tr(
              "Measure loudness, peak levels and silence in the rendered mix.",
            )}{" "}
          </p>
        </div>
        <Button
          variant="default"
          className="button primary"
          disabled={inspectBusy || operation.isPending || !project.duration_ms}
          onClick={() => void inspect("audio")}
        >
          {inspectBusy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Activity size={17} />
          )}{" "}
          {tr("Analyze mix")}{" "}
        </Button>
      </div>
      <div className="audio-tracks">
        {project.tracks
          .filter((t) =>
            ["voiceover", "music", "sound", "ambient"].includes(t.kind),
          )
          .map((t) => (
            <div className="audio-track" key={t.id}>
              <Music2 />
              <div>
                <strong>{t.name}</strong>
                <small>
                  {tr("clipCount", { count: t.clips.length })} ·{" "}
                  {trackKindLabel(t.kind)}
                </small>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={t.ducking}
                  disabled={t.kind !== "music"}
                  onChange={(e) =>
                    edit("update_track", {
                      track_id: t.id,
                      changes: { ducking: e.target.checked },
                    })
                  }
                />{" "}
                {tr("Duck under voiceover")}{" "}
              </label>
              <IconButton
                label={t.muted ? tr("Unmute track") : tr("Mute track")}
                onClick={() =>
                  edit("update_track", {
                    track_id: t.id,
                    changes: { muted: !t.muted },
                  })
                }
              >
                {t.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </IconButton>
            </div>
          ))}
      </div>
      {audio ? (
        <AudioView report={audio} />
      ) : (
        <div className="empty">
          <Activity size={40} />
          <h3>{tr("Hear the difference. See the measurements.")}</h3>
          <p>
            {" "}
            {tr("Target {{lufs}} LUFS and maximum {{peak}} dBTP.", {
              lufs: project.profile.target_lufs,
              peak: project.profile.true_peak,
            })}
            <br /> {tr(
              "Analysis uses FFmpeg EBU R128 and 500 ms samples.",
            )}{" "}
          </p>
        </div>
      )}
    </div>
  );
}
