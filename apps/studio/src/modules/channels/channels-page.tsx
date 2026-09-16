import { CreateProjectDialog } from "@/modules/projects/create-project-dialog";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import Channels from "./Channels";

export function ChannelsPage({
  channelId = null,
}: {
  channelId?: string | null;
}) {
  const navigate = useNavigate();
  const [createChannel, setCreateChannel] = useState<string>();
  return (
    <>
      <Channels
        channelId={channelId}
        onSelect={(id) => {
          if (id)
            void navigate({
              to: "/channels/$channelId",
              params: { channelId: id },
            });
          else void navigate({ to: "/channels" });
        }}
        onProject={(id) =>
          void navigate({
            to: "/projects/$projectId",
            params: { projectId: id },
          })
        }
        onNewProject={setCreateChannel}
      />
      <CreateProjectDialog
        open={createChannel !== undefined}
        onOpenChange={(open) => {
          if (!open) setCreateChannel(undefined);
        }}
        channelId={createChannel}
      />
    </>
  );
}
