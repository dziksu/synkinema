import { z } from "zod";
export const projectSearchSchema = z.object({
  q: z.string().catch(""),
  sort: z.enum(["newest", "name"]).catch("newest"),
  view: z.enum(["grid", "list"]).catch("grid"),
});
export type ProjectSearch = z.infer<typeof projectSearchSchema>;
