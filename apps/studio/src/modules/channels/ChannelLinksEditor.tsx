import type { ChannelLink } from "@/api/generated/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { tr } from "@/lib/i18n";
import { Plus, X } from "lucide-react";
import { useState } from "react";

export const platformNames = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  twitch: "Twitch",
  x: "X",
  linkedin: "LinkedIn",
  other: "Other",
};
export const platforms = Object.keys(
  platformNames,
) as ChannelLink["platform"][];

export function channelLinkLabel(link: ChannelLink) {
  try {
    if (link.platform === "youtube")
      return new URL(link.url).hostname === "studio.youtube.com"
        ? "YouTube Studio"
        : "YouTube";
  } catch {
    /* A draft URL may be incomplete. */
  }
  return platformNames[link.platform];
}

export default function ChannelLinksEditor({
  links,
  onChange,
}: {
  links: ChannelLink[];
  onChange: (links: ChannelLink[]) => void;
}) {
  const [platform, setPlatform] = useState<ChannelLink["platform"]>("youtube");
  const add = (value: ChannelLink["platform"]) =>
    onChange([...links, { platform: value, url: "" }]);
  return (
    <section className="channel-form-section" id="channel-platforms">
      <h3>{tr("Platform links")}</h3>
      <p className="channel-help">
        {tr(
          "Keep multiple links under one platform: public channel, creator dashboard or another reference. These links do not connect accounts.",
        )}
      </p>
      {[...new Set(links.map((l) => l.platform))].map((group) => (
        <div className="channel-platform-group" key={group}>
          <header>
            <h4>{platformNames[group]}</h4>
            <Button
              variant="ghost"
              type="button"
              className="button subtle"
              disabled={links.length >= 20}
              onClick={() => add(group)}
            >
              <Plus size={16} />
              {tr("Add another link")}
            </Button>
          </header>
          {links.map(
            (link, index) =>
              link.platform === group && (
                <div className="channel-url-row" key={index}>
                  <label className="field">
                    <span>
                      {channelLinkLabel(link)} · {tr("Channel URL")}
                    </span>
                    <Input
                      type="url"
                      required
                      pattern="https://.*"
                      maxLength={2000}
                      placeholder={
                        group === "youtube"
                          ? "https://www.youtube.com/@your-channel"
                          : "https://…"
                      }
                      value={link.url}
                      onChange={(e) =>
                        onChange(
                          links.map((l, i) =>
                            i === index ? { ...l, url: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    className="icon-button"
                    aria-label={tr("Remove link {{number}}", {
                      number: index + 1,
                    })}
                    onClick={() =>
                      onChange(links.filter((_, i) => i !== index))
                    }
                  >
                    <X size={18} />
                  </Button>
                </div>
              ),
          )}
        </div>
      ))}
      <div className="channel-add-platform">
        <label className="field">
          {tr("Platform")}
          <NativeSelect
            value={platform}
            onChange={(e) =>
              setPlatform(e.target.value as ChannelLink["platform"])
            }
          >
            {platforms.map((p) => (
              <option value={p} key={p}>
                {platformNames[p]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          variant="outline"
          type="button"
          className="button"
          disabled={links.length >= 20}
          onClick={() => add(platform)}
        >
          <Plus size={16} />
          {tr("Add platform link")}
        </Button>
      </div>
    </section>
  );
}
