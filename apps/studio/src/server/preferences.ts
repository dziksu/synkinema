import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequestUrl,
  setCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { z } from "zod";
export const themeSchema = z.enum(["light", "dark", "system"]);
export const readPreferences = createServerFn({ method: "GET" }).handler(() => {
  setResponseHeader("Cache-Control", "private, no-store");
  return {
    theme: themeSchema.catch("system").parse(getCookie("studio-theme")),
    mcpUrl: new URL("/mcp/", getRequestUrl()).href,
  };
});
export const savePreferences = createServerFn({ method: "POST" })
  .validator(z.object({ theme: themeSchema }))
  .handler(({ data }) => {
    setCookie("studio-theme", data.theme, {
      path: "/",
      sameSite: "lax",
      maxAge: 31536000,
    });
    return { ...data, mcpUrl: new URL("/mcp/", getRequestUrl()).href };
  });
