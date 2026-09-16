import { useState } from "react";

export default function ChannelAvatar({
  name,
  logoId,
  large = false,
}: {
  name: string;
  logoId?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={`channel-avatar ${large ? "channel-avatar-large" : ""}`}
      aria-hidden="true"
    >
      {logoId && failed !== logoId ? (
        <img
          src={`/media/channel-logos/${logoId}.png`}
          alt=""
          onError={() => setFailed(logoId)}
        />
      ) : (
        <span>{name.trim().slice(0, 2).toUpperCase() || "CH"}</span>
      )}
    </span>
  );
}
