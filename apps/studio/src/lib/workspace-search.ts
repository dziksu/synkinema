import { z } from "zod";

export const workspaceSearchSchema = z.object({
  editorFocus: z.literal("focus").optional().catch(undefined),
  editorTab: z
    .enum(["timeline", "script", "audio", "exports", "history"])
    .optional()
    .catch(undefined),
  channelTab: z
    .enum(["brief", "publications", "reviews"])
    .optional()
    .catch(undefined),
  mediaScope: z.enum(["project", "library"]).optional().catch(undefined),
  mediaKind: z
    .enum(["all", "image", "video", "audio"])
    .optional()
    .catch(undefined),
  libraryView: z.enum(["shared", "all", "private"]).optional().catch(undefined),
  mediaFolder: z.string().min(1).optional().catch(undefined),
  mediaId: z.string().min(1).optional().catch(undefined),
  mediaTab: z.enum(["details", "sharing"]).optional().catch(undefined),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;
