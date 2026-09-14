import { Api } from "./generated/client";
import { tr } from "../i18n";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

// The generated client owns URLs, methods, bodies and response types. This adapter
// only normalizes HTTP errors; components never import it or call fetch directly.
export const http = new Api({
  baseUrl: "",
  customFetch: async (...args: Parameters<typeof fetch>) => {
    const response = await fetch(...args);
    if (!response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      const detail = body?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail
                .map(
                  (item) => `${item.loc?.join(".") || "Request"}: ${item.msg}`,
                )
                .join("; ")
            : tr("Server error ({{status}})", { status: response.status });
      const messages: Record<string, string> = {
        "Cannot decode this media file": tr(
          "Unable to read this file. Check that it contains valid video, image or audio media.",
        ),
        "Audio tracks require assets with audio": tr(
          "This media has no audio. Choose a video track.",
        ),
        "Visual tracks require image or video assets": tr(
          "Video tracks accept videos or images.",
        ),
        "Split point must leave at least 100ms on both sides": tr(
          "Place the playhead inside the clip, at least 0.1 s from either edge.",
        ),
        "Bake or remove animations before splitting this clip": tr(
          "Remove the clip's animation before splitting it. You can add motion to each part afterwards.",
        ),
      };
      throw new ApiRequestError(
        response.status,
        detail,
        messages[message] || message,
      );
    }
    return response;
  },
});
