/** Domain types are generated from FastAPI. UI-only state belongs in store.ts. */
export type {
  AnimationOutput as Animation,
  ClipOutput as Clip,
  TrackOutput as Track,
  OutputProfileOutput as Profile,
  SceneOutput as Scene,
  ProjectSnapshot as Project,
  Asset,
  RenderJob as Job,
  ReviewComment as Review,
  AudioReport,
} from "./api/generated/client";
