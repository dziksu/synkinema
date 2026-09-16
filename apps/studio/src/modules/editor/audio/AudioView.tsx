import { tr, useLocale } from "@/lib/i18n";
import { Check } from "lucide-react";

import type { AudioReport } from "@/lib/types";

export default function AudioView({ report }: { report: AudioReport }) {
  useLocale();
  return (
    <div className="audio-report">
      <div className="metrics">
        <div>
          <span>{tr("Integrated loudness")}</span>
          <strong>
            {report.integrated_lufs ?? "—"}
            <small>LUFS</small>
          </strong>
        </div>
        <div>
          <span>{tr("True peak")}</span>
          <strong>
            {report.true_peak_dbtp ?? "—"}
            <small>dBTP</small>
          </strong>
        </div>
        <div>
          <span>{tr("Loudness range")}</span>
          <strong>
            {report.loudness_range ?? "—"}
            <small>LU</small>
          </strong>
        </div>
      </div>
      <img src={report.map_url} alt={tr("Mix loudness in 500 ms windows")} />
      <audio controls src={report.audio_url} />
      {report.warnings.length ? (
        report.warnings.map((w) => (
          <p className="warning" key={w.type}>
            {w.message}
          </p>
        ))
      ) : (
        <p className="success">
          <Check size={16} />{" "}
          {tr("The mix is within the loudness profile tolerance.")}{" "}
        </p>
      )}
    </div>
  );
}
