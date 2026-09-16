/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

/** Append a clip record on an existing track at its explicit start_ms (default 0); does NOT append in time, snap, resolve collisions or extract audio. Omit id to generate one. Reference library asset_id for media; text tracks require nonempty text. Overlay tracks also accept assetless shape clips (rectangle/ellipse/line). placement sets layer position/size; caption_style selects text styling. Full Clip defaults apply. All track kinds reject new overlapping intervals (422), including muted tracks; explicit primary-video transitions are the only intentional overlap. For simultaneous layers choose an unmuted same-kind track free for the entire [start_ms,start_ms+duration_ms) interval, or batch add_track + add_clip. This operation never silently changes the requested start. */
export interface AddClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Clip */
    clip: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * @min 100
       * @max 86400000
       * @default 4000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /** Id */
      id?: string;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Start Ms
       * Absolute start on project timeline, in integer milliseconds.
       * @min 0
       * @max 86400000
       * @default 0
       */
      start_ms?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "add_clip";
}

/** Append a clip record on an existing track at its explicit start_ms (default 0); does NOT append in time, snap, resolve collisions or extract audio. Omit id to generate one. Reference library asset_id for media; text tracks require nonempty text. Overlay tracks also accept assetless shape clips (rectangle/ellipse/line). placement sets layer position/size; caption_style selects text styling. Full Clip defaults apply. All track kinds reject new overlapping intervals (422), including muted tracks; explicit primary-video transitions are the only intentional overlap. For simultaneous layers choose an unmuted same-kind track free for the entire [start_ms,start_ms+duration_ms) interval, or batch add_track + add_clip. This operation never silently changes the requested start. */
export interface AddClipStep {
  payload: {
    /** Clip */
    clip: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * @min 100
       * @max 86400000
       * @default 4000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /** Id */
      id?: string;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Start Ms
       * Absolute start on project timeline, in integer milliseconds.
       * @min 0
       * @max 86400000
       * @default 0
       */
      start_ms?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "add_clip";
}

/** Append a track; generated ID if omitted. Use video for one primary track, overlay for additional visuals, text for captions; voiceover/music/sound/ambient for audio. */
export interface AddTrackOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  /** Track */
  payload: {
    /**
     * Clips
     * @maxItems 500
     */
    clips?: EditClip[];
    /**
     * Ducking
     * @default false
     */
    ducking?: boolean;
    /**
     * Gain Db
     * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
     * @min -60
     * @max 12
     * @default 0
     */
    gain_db?: number;
    /** Id */
    id?: string;
    /** Kind */
    kind:
      | "video"
      | "overlay"
      | "text"
      | "voiceover"
      | "music"
      | "sound"
      | "ambient";
    /**
     * Muted
     * @default false
     */
    muted?: boolean;
    /** Name */
    name: string;
  };
  type: "add_track";
}

/** Append a track; generated ID if omitted. Use video for one primary track, overlay for additional visuals, text for captions; voiceover/music/sound/ambient for audio. */
export interface AddTrackStep {
  /** Track */
  payload: {
    /**
     * Clips
     * @maxItems 500
     */
    clips?: EditClip[];
    /**
     * Ducking
     * @default false
     */
    ducking?: boolean;
    /**
     * Gain Db
     * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
     * @min -60
     * @max 12
     * @default 0
     */
    gain_db?: number;
    /** Id */
    id?: string;
    /** Kind */
    kind:
      | "video"
      | "overlay"
      | "text"
      | "voiceover"
      | "music"
      | "sound"
      | "ambient";
    /**
     * Muted
     * @default false
     */
    muted?: boolean;
    /** Name */
    name: string;
  };
  type: "add_track";
}

/** Animation */
export interface AnimationInput {
  /**
   * Keyframes
   * @maxItems 64
   * @minItems 1
   */
  keyframes: KeyframeInput[];
  /** Property */
  property: "scale" | "x" | "y" | "opacity" | "gain_db";
}

/** Animation */
export interface AnimationOutput {
  /**
   * Keyframes
   * @maxItems 64
   * @minItems 1
   */
  keyframes: KeyframeOutput[];
  /** Property */
  property: "scale" | "x" | "y" | "opacity" | "gain_db";
}

/** ApiError */
export interface ApiError {
  /** Detail */
  detail: string | ValidationIssue[];
}

/** Append at the end of the target track (0 when empty), never at the global project end. Omit start_ms. If duration_ms omitted, use remaining source duration / speed rounded down; images/text default 4000ms. Source limits still apply. Incoming transition must be cut; set_transition afterwards can ripple aligned media. Provide id to refer to this clip in later batch steps. */
export interface AppendClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    clip: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * Omit to use remaining media duration divided by speed (floor ms); images/text default to 4000ms.
       * @min 100
       * @max 86400000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /** Id */
      id?: string;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "append_clip";
}

/** Append at the end of the target track (0 when empty), never at the global project end. Omit start_ms. If duration_ms omitted, use remaining source duration / speed rounded down; images/text default 4000ms. Source limits still apply. Incoming transition must be cut; set_transition afterwards can ripple aligned media. Provide id to refer to this clip in later batch steps. */
export interface AppendClipStep {
  payload: {
    clip: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * Omit to use remaining media duration divided by speed (floor ms); images/text default to 4000ms.
       * @min 100
       * @max 86400000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /** Id */
      id?: string;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "append_clip";
}

/** Asset */
export interface Asset {
  /**
   * Audio Duration Ms
   * Measured audio stream duration; null for older metadata or missing audio.
   */
  audio_duration_ms: number | null;
  /** Checksum */
  checksum: string;
  /** Codec */
  codec: string | null;
  /** Created At */
  created_at: string;
  /** Duration Ms */
  duration_ms: number | null;
  /** Has Audio */
  has_audio: boolean;
  /** Height */
  height: number | null;
  /** Id */
  id: string;
  /** Kind */
  kind: "image" | "video" | "audio";
  /** License */
  license: string;
  /**
   * Locations
   * Collection ID (library or project ID) to folder ID; empty string means root.
   */
  locations: Record<string, string>;
  /** Name */
  name: string;
  /** Path */
  path: string;
  /** Size */
  size: number;
  /** Source */
  source: string;
  /** Tags */
  tags: string[];
  /** Thumbnail Url */
  thumbnail_url: string | null;
  /** Url */
  url: string;
  /**
   * Version
   * Metadata/membership version; legacy assets start at 1. Use for guarded metadata edits and deletion.
   * @min 1
   * @default 1
   */
  version: number;
  /** Width */
  width: number | null;
}

/** AssetBatchUpdate */
export interface AssetBatchUpdate {
  /** Action */
  action: "add_tags" | "remove_tags" | "locate";
  /**
   * Asset Ids
   * @maxItems 100
   * @minItems 1
   */
  asset_ids: string[];
  /** Required only for locate. Adds/moves membership in one scope; keeps every other collection and never copies bytes. */
  destination?: AssetLocation | null;
  /**
   * Tags
   * Tags to merge/remove atomically. Case-sensitive, trimmed, deduplicated; never replaces unrelated tags.
   * @maxItems 50
   */
  tags?: string[];
}

/** AssetDeleteItem */
export interface AssetDeleteItem {
  /**
   * Expected Version
   * Confirmed asset metadata version. Stale version returns 409; reload and reconcile.
   * @min 1
   */
  expected_version: number;
  /** Id */
  id: string;
}

/** AssetFolder */
export interface AssetFolder {
  /** Id */
  id: string;
  /** Name */
  name: string;
}

/** AssetLocation */
export interface AssetLocation {
  /**
   * Folder Id
   * Folder in the selected collection, or null for its root. Adds or moves membership without copying media or changing timeline revisions.
   */
  folder_id?: string | null;
  /**
   * Project Id
   * Omit for shared library; set to a project ID for its private media collection.
   */
  project_id?: string | null;
}

/** AssetMetadataUpdate */
export interface AssetMetadataUpdate {
  /**
   * Expected Version
   * Confirmed asset metadata version. Stale version returns 409; reload and reconcile.
   * @min 1
   */
  expected_version: number;
  /**
   * License
   * @maxLength 2000
   */
  license: string;
  /**
   * Name
   * @minLength 1
   * @maxLength 300
   */
  name: string;
  /**
   * Source
   * @maxLength 5000
   */
  source: string;
  /**
   * Tags
   * @maxItems 50
   */
  tags: string[];
}

/** AssetProjectUsage */
export interface AssetProjectUsage {
  /** Current */
  current: boolean;
  /** Job Ids */
  job_ids: string[];
  /** Name */
  name: string;
  /** Project Id */
  project_id: string;
  /** Revisions */
  revisions: number[];
}

/** AssetUsage */
export interface AssetUsage {
  /** Asset Id */
  asset_id: string;
  /** Can Delete */
  can_delete: boolean;
  /** Projects */
  projects: AssetProjectUsage[];
  /** Version */
  version: number;
}

/** AudioReport */
export interface AudioReport {
  /** Ebu R128 */
  ebu_r128: LoudnessSample[];
  /** Audio Url */
  audio_url: string;
  /** From Ms */
  from_ms: number;
  /** Integrated Lufs */
  integrated_lufs: number | null;
  /** Job Id */
  job_id: string | null;
  /** Loudness Range */
  loudness_range: number | null;
  /** Map Path */
  map_path: string;
  /** Map Url */
  map_url: string;
  /** Revision */
  revision: number;
  /** Target Lufs */
  target_lufs: number;
  /** To Ms */
  to_ms: number;
  /** True Peak Dbtp */
  true_peak_dbtp: number | null;
  /** Warnings */
  warnings: AudioWarning[];
  /** Windows */
  windows: AudioWindow[];
}

/** AudioRequest */
export interface AudioRequest {
  /** Job Id */
  job_id?: string | null;
  /** Revision */
  revision?: number | null;
}

/** AudioWarning */
export interface AudioWarning {
  /** Message */
  message: string;
  /** Type */
  type: string;
}

/** AudioWindow */
export interface AudioWindow {
  /** Active Tracks */
  active_tracks: string[];
  /** Clipping */
  clipping: boolean;
  /** Duration Ms */
  duration_ms: number;
  /** Rms Dbfs */
  rms_dbfs: number;
  /** Sample Peak Dbfs */
  sample_peak_dbfs: number;
  /** Silence */
  silence: boolean;
  /** Time Ms */
  time_ms: number;
}

/** BatchRequest */
export interface BatchRequest {
  /**
   * Dry Run
   * Validate and return a candidate without saving. Generated IDs are provisional; a later commit generates new IDs unless supplied explicitly.
   * @default false
   */
  dry_run?: boolean;
  /**
   * Expected Revision
   * Last confirmed project revision. The entire batch rejects atomically when stale.
   * @min 1
   */
  expected_revision: number;
  /**
   * Operations
   * Ordered editing operations committed as one revision; later steps see earlier steps in this list.
   * @maxItems 100
   * @minItems 1
   */
  operations: EditStep[];
}

/** BatchResult */
export interface BatchResult {
  /** Applied Operations */
  applied_operations: number;
  /** Base Revision */
  base_revision: number;
  /** Committed */
  committed: boolean;
  project: ProjectSnapshot;
}

/** Body_upload_api_assets_post */
export interface BodyUploadApiAssetsPost {
  /** File */
  file: File | Blob;
  /** Folder Id */
  folder_id?: string | null;
  /**
   * License
   * @default ""
   */
  license?: string;
  /** Project Id */
  project_id?: string | null;
  /**
   * Source
   * @default ""
   */
  source?: string;
  /**
   * Tags
   * @default "[]"
   */
  tags?: string;
}

/** Body_upload_channel_logo_api_channel_logos_post */
export interface BodyUploadChannelLogoApiChannelLogosPost {
  /** File */
  file: File | Blob;
}

/** Capabilities */
export interface Capabilities {
  /** Agent Guide Url */
  agent_guide_url: string;
  /** Animation Bounds */
  animation_bounds: Record<string, number[]>;
  /** Animations */
  animations: string[];
  /** Audio */
  audio: string[];
  /** Caption Styles */
  caption_styles: string[];
  /** Easing */
  easing: string[];
  /** Editing Helpers */
  editing_helpers: string[];
  /** Effect Bounds */
  effect_bounds: Record<string, number[]>;
  /** Effects */
  effects: string[];
  /** Inspection */
  inspection: string[];
  /** Limits */
  limits: Record<string, number>;
  /** Notes */
  notes: string[];
  /** Operation Reference Url */
  operation_reference_url: string;
  /** Project Schema Url */
  project_schema_url: string;
  /** Renderer */
  renderer: string;
  /** Shapes */
  shapes: string[];
  /** Transitions */
  transitions: string[];
}

/** CaptionBounds */
export interface CaptionBounds {
  /**
   * Height
   * Foreground height in pixels, including wrapped lines, subtitle and accent.
   * @exclusiveMin 0
   */
  height: number;
  /**
   * Left
   * Left edge in output-profile pixels, clipped to the frame.
   * @min 0
   */
  left: number;
  /**
   * Top
   * Top edge in output-profile pixels, after layout and vertical clamping.
   * @min 0
   */
  top: number;
  /**
   * Width
   * Foreground width in pixels, including strokes and caption boxes.
   * @exclusiveMin 0
   */
  width: number;
}

/** CaptionPreview */
export interface CaptionPreview {
  /** Visible caption bounds, excluding the editorial contrast gradient. Null when there is no caption foreground. Paired atomically with url; never reuse across different requests. */
  bounds: CaptionBounds | null;
  /**
   * Height
   * Full raster height in output-profile pixels.
   * @exclusiveMin 0
   */
  height: number;
  /**
   * Url
   * Content-addressed transparent PNG under /media/cache/, from the export renderer.
   */
  url: string;
  /**
   * Width
   * Full raster width in output-profile pixels.
   * @exclusiveMin 0
   */
  width: number;
}

/** Channel */
export interface Channel {
  /**
   * Archived
   * @default false
   */
  archived: boolean;
  /**
   * Audience
   * @maxLength 4000
   * @default ""
   */
  audience: string;
  /**
   * Avoid
   * @maxLength 4000
   * @default ""
   */
  avoid: string;
  /**
   * Concept
   * @maxLength 10000
   * @default ""
   */
  concept: string;
  /** Created At */
  created_at: string;
  /**
   * Cta Guidance
   * @maxLength 4000
   * @default ""
   */
  cta_guidance: string;
  /**
   * Hook Guidance
   * @maxLength 4000
   * @default ""
   */
  hook_guidance: string;
  /** Id */
  id: string;
  /**
   * Language
   * Content language, e.g. en or pl; not Studio UI language.
   * @minLength 2
   * @maxLength 50
   * @default "en"
   */
  language: string;
  /**
   * Learnings
   * Owner-approved lessons to apply to future videos. Reviews do not change these automatically.
   * @maxLength 10000
   * @default ""
   */
  learnings: string;
  /**
   * Links
   * @maxItems 20
   */
  links: ChannelLink[];
  /**
   * Logo Id
   * Optional ID returned by upload_channel_logo. Served at /media/channel-logos/{logo_id}.png. Null removes the association, not the reusable file. Existing briefs default to null.
   */
  logo_id: string | null;
  /**
   * Lowercase Hashtags
   * @default true
   */
  lowercase_hashtags: boolean;
  /**
   * Name
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Rules
   * Standing editorial instructions: hooks, CTA, pacing, captions, exclusions and source policy.
   * @maxLength 20000
   * @default ""
   */
  rules: string;
  /**
   * Tone
   * @maxLength 2000
   * @default ""
   */
  tone: string;
  /** Updated At */
  updated_at: string;
  /**
   * Version
   * @min 1
   */
  version: number;
  /**
   * Visual Guidance
   * @maxLength 4000
   * @default ""
   */
  visual_guidance: string;
  /**
   * Voice Gender
   * @default "unspecified"
   */
  voice_gender: "unspecified" | "male" | "female" | "neutral";
  /**
   * Voice Id
   * @maxLength 200
   * @default ""
   */
  voice_id: string;
  /**
   * Voice Provider
   * Preferred provider ID; advisory, does not install or invoke a provider.
   * @maxLength 100
   * @default ""
   */
  voice_provider: string;
}

/** ChannelContext */
export interface ChannelContext {
  channel: Channel;
  /**
   * Guidance
   * @default "Current channel rules (not a historical snapshot). Apply before scripting/TTS/editing. Reviews are subjective; verify evidence. Never override safety, licensing or the owner's explicit current request. No publishing authority is granted."
   */
  guidance: string;
  /** Recent Reviews */
  recent_reviews: ChannelReview[];
}

/** ChannelDetail */
export interface ChannelDetail {
  channel: Channel;
  /** Projects */
  projects: ChannelProject[];
  /** Publications */
  publications: Publication[];
  /** Reviews */
  reviews: ChannelReview[];
}

/** ChannelInput */
export interface ChannelInput {
  /**
   * Archived
   * @default false
   */
  archived?: boolean;
  /**
   * Audience
   * @maxLength 4000
   * @default ""
   */
  audience?: string;
  /**
   * Avoid
   * @maxLength 4000
   * @default ""
   */
  avoid?: string;
  /**
   * Concept
   * @maxLength 10000
   * @default ""
   */
  concept?: string;
  /**
   * Cta Guidance
   * @maxLength 4000
   * @default ""
   */
  cta_guidance?: string;
  /**
   * Hook Guidance
   * @maxLength 4000
   * @default ""
   */
  hook_guidance?: string;
  /**
   * Language
   * Content language, e.g. en or pl; not Studio UI language.
   * @minLength 2
   * @maxLength 50
   * @default "en"
   */
  language?: string;
  /**
   * Learnings
   * Owner-approved lessons to apply to future videos. Reviews do not change these automatically.
   * @maxLength 10000
   * @default ""
   */
  learnings?: string;
  /**
   * Links
   * @maxItems 20
   */
  links?: ChannelLink[];
  /**
   * Logo Id
   * Optional ID returned by upload_channel_logo. Served at /media/channel-logos/{logo_id}.png. Null removes the association, not the reusable file. Existing briefs default to null.
   */
  logo_id?: string | null;
  /**
   * Lowercase Hashtags
   * @default true
   */
  lowercase_hashtags?: boolean;
  /**
   * Name
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Rules
   * Standing editorial instructions: hooks, CTA, pacing, captions, exclusions and source policy.
   * @maxLength 20000
   * @default ""
   */
  rules?: string;
  /**
   * Tone
   * @maxLength 2000
   * @default ""
   */
  tone?: string;
  /**
   * Visual Guidance
   * @maxLength 4000
   * @default ""
   */
  visual_guidance?: string;
  /**
   * Voice Gender
   * @default "unspecified"
   */
  voice_gender?: "unspecified" | "male" | "female" | "neutral";
  /**
   * Voice Id
   * @maxLength 200
   * @default ""
   */
  voice_id?: string;
  /**
   * Voice Provider
   * Preferred provider ID; advisory, does not install or invoke a provider.
   * @maxLength 100
   * @default ""
   */
  voice_provider?: string;
}

/** ChannelLink */
export interface ChannelLink {
  /** Platform */
  platform:
    | "youtube"
    | "tiktok"
    | "instagram"
    | "facebook"
    | "twitch"
    | "x"
    | "linkedin"
    | "other";
  /**
   * Url
   * @maxLength 2000
   */
  url: string;
}

/** ChannelLogo */
export interface ChannelLogo {
  /**
   * Height
   * Decoded output height in pixels.
   * @min 1
   * @max 512
   */
  height: number;
  /**
   * Id
   * SHA-256 of the sanitized PNG; assign to ChannelInput.logo_id.
   */
  id: string;
  /**
   * Url
   * Local /media/channel-logos/*.png preview URL.
   */
  url: string;
  /**
   * Width
   * Decoded output width in pixels.
   * @min 1
   * @max 512
   */
  width: number;
}

/** ChannelProject */
export interface ChannelProject {
  /** Duration Ms */
  duration_ms: number;
  /** Id */
  id: string;
  /** Name */
  name: string;
  /** Revision */
  revision: number;
}

/** ChannelReview */
export interface ChannelReview {
  /**
   * Author
   * Reviewer identity, e.g. owner or agent. Not verified by the server.
   * @minLength 1
   * @maxLength 200
   */
  author: string;
  /**
   * Channel Fit
   * @min 0
   * @max 10
   */
  channel_fit: number;
  /**
   * Clarity
   * @min 0
   * @max 10
   */
  clarity: number;
  /** Created At */
  created_at: string;
  /**
   * Cta
   * @min 0
   * @max 10
   */
  cta: number;
  /**
   * Evidence
   * What was actually inspected: script, revision, render ID/timestamps or published observations. Scores are subjective, not predicted reach.
   * @minLength 1
   * @maxLength 6000
   */
  evidence: string;
  /**
   * Hook
   * @min 0
   * @max 10
   */
  hook: number;
  /** Id */
  id: string;
  /**
   * Improvements
   * @minLength 1
   * @maxLength 6000
   */
  improvements: string;
  /**
   * Pacing
   * @min 0
   * @max 10
   */
  pacing: number;
  /** Project Id */
  project_id: string;
  /**
   * Project Revision
   * @min 1
   */
  project_revision: number;
  /**
   * Score
   * Unweighted mean of five 0–10 editorial criteria multiplied by ten. NOT a performance or virality prediction.
   * @min 0
   * @max 100
   */
  score: number;
  /**
   * Strengths
   * @maxLength 4000
   * @default ""
   */
  strengths: string;
}

/** ChannelReviewWrite */
export interface ChannelReviewWrite {
  /**
   * Author
   * Reviewer identity, e.g. owner or agent. Not verified by the server.
   * @minLength 1
   * @maxLength 200
   */
  author: string;
  /**
   * Channel Fit
   * @min 0
   * @max 10
   */
  channel_fit: number;
  /**
   * Clarity
   * @min 0
   * @max 10
   */
  clarity: number;
  /**
   * Cta
   * @min 0
   * @max 10
   */
  cta: number;
  /**
   * Evidence
   * What was actually inspected: script, revision, render ID/timestamps or published observations. Scores are subjective, not predicted reach.
   * @minLength 1
   * @maxLength 6000
   */
  evidence: string;
  /**
   * Expected Version
   * @min 1
   */
  expected_version: number;
  /**
   * Hook
   * @min 0
   * @max 10
   */
  hook: number;
  /**
   * Improvements
   * @minLength 1
   * @maxLength 6000
   */
  improvements: string;
  /**
   * Pacing
   * @min 0
   * @max 10
   */
  pacing: number;
  /** Project Id */
  project_id: string;
  /**
   * Project Revision
   * @min 1
   */
  project_revision: number;
  /**
   * Strengths
   * @maxLength 4000
   * @default ""
   */
  strengths?: string;
}

/** ChannelUpdate */
export interface ChannelUpdate {
  /**
   * Archived
   * @default false
   */
  archived?: boolean;
  /**
   * Audience
   * @maxLength 4000
   * @default ""
   */
  audience?: string;
  /**
   * Avoid
   * @maxLength 4000
   * @default ""
   */
  avoid?: string;
  /**
   * Concept
   * @maxLength 10000
   * @default ""
   */
  concept?: string;
  /**
   * Cta Guidance
   * @maxLength 4000
   * @default ""
   */
  cta_guidance?: string;
  /**
   * Expected Version
   * Last confirmed channel version; conflicts reject without retry. Replaces editable fields, including links.
   * @min 1
   */
  expected_version: number;
  /**
   * Hook Guidance
   * @maxLength 4000
   * @default ""
   */
  hook_guidance?: string;
  /**
   * Language
   * Content language, e.g. en or pl; not Studio UI language.
   * @minLength 2
   * @maxLength 50
   * @default "en"
   */
  language?: string;
  /**
   * Learnings
   * Owner-approved lessons to apply to future videos. Reviews do not change these automatically.
   * @maxLength 10000
   * @default ""
   */
  learnings?: string;
  /**
   * Links
   * @maxItems 20
   */
  links?: ChannelLink[];
  /**
   * Logo Id
   * Optional ID returned by upload_channel_logo. Served at /media/channel-logos/{logo_id}.png. Null removes the association, not the reusable file. Existing briefs default to null.
   */
  logo_id?: string | null;
  /**
   * Lowercase Hashtags
   * @default true
   */
  lowercase_hashtags?: boolean;
  /**
   * Name
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Rules
   * Standing editorial instructions: hooks, CTA, pacing, captions, exclusions and source policy.
   * @maxLength 20000
   * @default ""
   */
  rules?: string;
  /**
   * Tone
   * @maxLength 2000
   * @default ""
   */
  tone?: string;
  /**
   * Visual Guidance
   * @maxLength 4000
   * @default ""
   */
  visual_guidance?: string;
  /**
   * Voice Gender
   * @default "unspecified"
   */
  voice_gender?: "unspecified" | "male" | "female" | "neutral";
  /**
   * Voice Id
   * @maxLength 200
   * @default ""
   */
  voice_id?: string;
  /**
   * Voice Provider
   * Preferred provider ID; advisory, does not install or invoke a provider.
   * @maxLength 100
   * @default ""
   */
  voice_provider?: string;
}

/** CleanupResult */
export interface CleanupResult {
  /**
   * Deleted Files
   * Existing nonempty files physically removed by this cleanup pass.
   * @min 0
   */
  deleted_files: number;
  /**
   * Freed Bytes
   * Bytes physically unlinked in this pass, not an estimate.
   * @min 0
   */
  freed_bytes: number;
  /**
   * Pending Files
   * Durable pending cleanup entries; nonzero means deletion committed but disk cleanup is incomplete. Retried every 10 seconds and after restart.
   * @min 0
   */
  pending_files: number;
}

/** ClipChange */
export interface ClipChange {
  /** Change */
  change: "added" | "removed" | "updated";
  /** Clip Id */
  clip_id: string;
  /** Fields */
  fields: string[];
}

/** Clip */
export interface ClipInput {
  /**
   * Animations
   * @maxItems 5
   */
  animations?: AnimationInput[];
  /** Asset Id */
  asset_id?: string | null;
  /**
   * Caption Style
   * @default "editorial"
   */
  caption_style?: "editorial" | "bold" | "boxed" | "minimal";
  /**
   * Color
   * @default "#d8fb76"
   * @pattern ^#[0-9a-fA-F]{6}$
   */
  color?: string;
  /**
   * Duration Ms
   * @min 100
   * @max 86400000
   * @default 4000
   */
  duration_ms?: number;
  /**
   * Effects
   * @maxItems 16
   */
  effects?: EffectInput[];
  /**
   * Fade In Ms
   * @min 0
   * @max 10000
   * @default 0
   */
  fade_in_ms?: number;
  /**
   * Fade Out Ms
   * @min 0
   * @max 10000
   * @default 0
   */
  fade_out_ms?: number;
  /**
   * Font Size
   * @min 16
   * @max 200
   * @default 80
   */
  font_size?: number;
  /**
   * Gain Db
   * @min -60
   * @max 12
   * @default 0
   */
  gain_db?: number;
  /** Id */
  id?: string;
  /**
   * Name
   * @maxLength 300
   * @default "Untitled clip"
   */
  name?: string;
  /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
  placement?: PlacementInput;
  /**
   * Shape
   * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
   */
  shape?: "rectangle" | "ellipse" | "line" | null;
  /**
   * Source In Ms
   * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
   * @min 0
   * @default 0
   */
  source_in_ms?: number;
  /**
   * Speed
   * @min 0.25
   * @max 4
   * @default 1
   */
  speed?: number;
  /**
   * Start Ms
   * Absolute start on project timeline, in integer milliseconds.
   * @min 0
   * @max 86400000
   * @default 0
   */
  start_ms?: number;
  /**
   * Subtitle
   * @maxLength 2000
   * @default ""
   */
  subtitle?: string;
  /**
   * Text
   * @maxLength 2000
   * @default ""
   */
  text?: string;
  /**
   * Text X
   * Left edge of caption block as fraction of output width.
   * @min 0
   * @max 0.9
   * @default 0.09
   */
  text_x?: number;
  /**
   * Text Y
   * @min 0.1
   * @max 0.85
   * @default 0.66
   */
  text_y?: number;
  transform?: TransformInput;
  transition?: TransitionInput;
}

/** Clip */
export interface ClipOutput {
  /**
   * Animations
   * @maxItems 5
   */
  animations: AnimationOutput[];
  /** Asset Id */
  asset_id: string | null;
  /**
   * Caption Style
   * @default "editorial"
   */
  caption_style: "editorial" | "bold" | "boxed" | "minimal";
  /**
   * Color
   * @default "#d8fb76"
   * @pattern ^#[0-9a-fA-F]{6}$
   */
  color: string;
  /**
   * Duration Ms
   * @min 100
   * @max 86400000
   * @default 4000
   */
  duration_ms: number;
  /**
   * Effects
   * @maxItems 16
   */
  effects: EffectOutput[];
  /**
   * Fade In Ms
   * @min 0
   * @max 10000
   * @default 0
   */
  fade_in_ms: number;
  /**
   * Fade Out Ms
   * @min 0
   * @max 10000
   * @default 0
   */
  fade_out_ms: number;
  /**
   * Font Size
   * @min 16
   * @max 200
   * @default 80
   */
  font_size: number;
  /**
   * Gain Db
   * @min -60
   * @max 12
   * @default 0
   */
  gain_db: number;
  /** Id */
  id: string;
  /**
   * Name
   * @maxLength 300
   * @default "Untitled clip"
   */
  name: string;
  /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
  placement: PlacementOutput;
  /**
   * Shape
   * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
   */
  shape: "rectangle" | "ellipse" | "line" | null;
  /**
   * Source In Ms
   * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
   * @min 0
   * @default 0
   */
  source_in_ms: number;
  /**
   * Speed
   * @min 0.25
   * @max 4
   * @default 1
   */
  speed: number;
  /**
   * Start Ms
   * Absolute start on project timeline, in integer milliseconds.
   * @min 0
   * @max 86400000
   * @default 0
   */
  start_ms: number;
  /**
   * Subtitle
   * @maxLength 2000
   * @default ""
   */
  subtitle: string;
  /**
   * Text
   * @maxLength 2000
   * @default ""
   */
  text: string;
  /**
   * Text X
   * Left edge of caption block as fraction of output width.
   * @min 0
   * @max 0.9
   * @default 0.09
   */
  text_x: number;
  /**
   * Text Y
   * @min 0.1
   * @max 0.85
   * @default 0.66
   */
  text_y: number;
  transform: TransformOutput;
  transition: TransitionOutput;
}

/** CloneRequest */
export interface CloneRequest {
  /**
   * Name
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Revision
   * Exact source revision to copy. Source stays unchanged; assets are shared.
   * @min 1
   */
  revision: number;
}

/** CommentRequest */
export interface CommentRequest {
  /** Message */
  message: string;
  /** Revision */
  revision: number;
  /** Time Ms */
  time_ms: number;
}

/** ComposeReel */
export interface ComposeReel {
  /**
   * Beats
   * @maxItems 12
   * @minItems 1
   */
  beats: ReelBeat[];
  /**
   * Caption Style
   * @default "boxed"
   */
  caption_style?: "boxed" | "bold" | "minimal" | "editorial";
  /**
   * Dry Run
   * @default true
   */
  dry_run?: boolean;
  /**
   * Expected Revision
   * @min 1
   */
  expected_revision: number;
  /** Music Asset Id */
  music_asset_id?: string | null;
  /** Narration Task Id */
  narration_task_id: string;
  profile?: OutputProfileInput;
  /**
   * Replace Existing
   * Explicitly replace all existing tracks. Defaults to requiring an empty project. All writes remain revision-guarded and undoable.
   * @default false
   */
  replace_existing?: boolean;
  /**
   * Series Title
   * @maxLength 100
   * @default "NEXT UP / AFTER DARK"
   */
  series_title?: string;
}

/** CompositionResult */
export interface CompositionResult {
  /** Base Revision */
  base_revision: number;
  /** Committed */
  committed: boolean;
  layout: LayoutReport;
  project: ProjectSnapshot;
  /** Warnings */
  warnings: string[];
}

/** DeleteAssetsRequest */
export interface DeleteAssetsRequest {
  /**
   * Assets
   * Atomic selection. All assets must match version and be unused in ALL current/historical projects and render snapshots, or nothing is deleted.
   * @maxItems 100
   * @minItems 1
   */
  assets: AssetDeleteItem[];
}

/** DeleteJobsRequest */
export interface DeleteJobsRequest {
  /**
   * Job Ids
   * Exact selection (1–100 distinct existing job IDs). When set, status is ignored; queued/running jobs are cancelled first.
   */
  job_ids?: string[] | null;
  /**
   * Project Id
   * Limit deletion to this project; omitted means all projects.
   */
  project_id?: string | null;
  /**
   * Status
   * Without job_ids: finished deletes completed/failed/cancelled; all also cancels and deletes active jobs. Applies to the entire database, not the latest-100 display limit.
   * @default "finished"
   */
  status?: "finished" | "all";
}

/** DeleteProjectRequest */
export interface DeleteProjectRequest {
  /**
   * Expected Revision
   * Current confirmed project revision. A stale revision returns 409 without deleting the project.
   * @min 1
   */
  expected_revision: number;
}

/** DeletionResult */
export interface DeletionResult {
  /**
   * Asset Ids
   * Exclusive private sources deleted. Shared library and other projects' historical sources are preserved.
   */
  asset_ids: string[];
  /**
   * Deleted Files
   * Existing nonempty files physically removed by this cleanup pass.
   * @min 0
   */
  deleted_files: number;
  /**
   * Freed Bytes
   * Bytes physically unlinked in this pass, not an estimate.
   * @min 0
   */
  freed_bytes: number;
  /** Job Ids */
  job_ids: string[];
  /**
   * Pending Files
   * Durable pending cleanup entries; nonzero means deletion committed but disk cleanup is incomplete. Retried every 10 seconds and after restart.
   * @min 0
   */
  pending_files: number;
  /** Project Ids */
  project_ids: string[];
}

/** Delivery */
export interface Delivery {
  /** Sha256 */
  sha256: string;
  /** Bundle Url */
  bundle_url: string;
  /** Captions Url */
  captions_url: string;
  /** Job Id */
  job_id: string;
  /** Project Id */
  project_id: string;
  /** Revision */
  revision: number;
  /** Size Bytes */
  size_bytes: number;
  /**
   * Verification Passed
   * A delivery can include a report with warnings. Packaging does not imply QA approval.
   */
  verification_passed: boolean;
  /** Video Url */
  video_url: string;
}

/** Copy clip to optional target_track_id (default source track) with new generated ID or supplied new_clip_id. start_ms defaults to target track end; explicit time allowed. Preserves source trim, speed, fades, effects and animations; resets incoming transition to cut. Source clip is unchanged. Does not copy linked audio/text; use a batch for synchronized copies. Invalid overlaps/track compatibility reject. */
export interface DuplicateClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    new_clip_id?: string;
    /**
     * Integer milliseconds on the project timeline.
     * @min 0
     */
    start_ms?: number;
    /** Existing ID returned by this server; never guess. */
    target_track_id?: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "duplicate_clip";
}

/** Copy clip to optional target_track_id (default source track) with new generated ID or supplied new_clip_id. start_ms defaults to target track end; explicit time allowed. Preserves source trim, speed, fades, effects and animations; resets incoming transition to cut. Source clip is unchanged. Does not copy linked audio/text; use a batch for synchronized copies. Invalid overlaps/track compatibility reject. */
export interface DuplicateClipStep {
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    new_clip_id?: string;
    /**
     * Integer milliseconds on the project timeline.
     * @min 0
     */
    start_ms?: number;
    /** Existing ID returned by this server; never guess. */
    target_track_id?: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "duplicate_clip";
}

/** Animation */
export interface EditAnimation {
  /**
   * Keyframes
   * @maxItems 64
   * @minItems 1
   */
  keyframes: EditKeyframe[];
  /** Property */
  property: "scale" | "x" | "y" | "opacity" | "gain_db";
}

/** Clip */
export interface EditClip {
  /**
   * Animations
   * @maxItems 5
   */
  animations?: EditAnimation[];
  /**
   * Asset Id
   * @default null
   */
  asset_id?: string | null;
  /**
   * Caption Style
   * @default "editorial"
   */
  caption_style?: "editorial" | "bold" | "boxed" | "minimal";
  /**
   * Color
   * @default "#d8fb76"
   * @pattern ^#[0-9a-fA-F]{6}$
   */
  color?: string;
  /**
   * Duration Ms
   * @min 100
   * @max 86400000
   * @default 4000
   */
  duration_ms?: number;
  /**
   * Effects
   * @maxItems 16
   */
  effects?: EditEffect[];
  /**
   * Fade In Ms
   * @min 0
   * @max 10000
   * @default 0
   */
  fade_in_ms?: number;
  /**
   * Fade Out Ms
   * @min 0
   * @max 10000
   * @default 0
   */
  fade_out_ms?: number;
  /**
   * Font Size
   * @min 16
   * @max 200
   * @default 80
   */
  font_size?: number;
  /**
   * Gain Db
   * @min -60
   * @max 12
   * @default 0
   */
  gain_db?: number;
  /** Id */
  id?: string;
  /**
   * Name
   * @maxLength 300
   * @default "Untitled clip"
   */
  name?: string;
  /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
  placement?: EditPlacement;
  /**
   * Shape
   * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
   * @default null
   */
  shape?: "rectangle" | "ellipse" | "line" | null;
  /**
   * Source In Ms
   * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
   * @min 0
   * @default 0
   */
  source_in_ms?: number;
  /**
   * Speed
   * @min 0.25
   * @max 4
   * @default 1
   */
  speed?: number;
  /**
   * Start Ms
   * Absolute start on project timeline, in integer milliseconds.
   * @min 0
   * @max 86400000
   * @default 0
   */
  start_ms?: number;
  /**
   * Subtitle
   * @maxLength 2000
   * @default ""
   */
  subtitle?: string;
  /**
   * Text
   * @maxLength 2000
   * @default ""
   */
  text?: string;
  /**
   * Text X
   * Left edge of caption block as fraction of output width.
   * @min 0
   * @max 0.9
   * @default 0.09
   */
  text_x?: number;
  /**
   * Text Y
   * @min 0.1
   * @max 0.85
   * @default 0.66
   */
  text_y?: number;
  transform?: EditTransform;
  transition?: EditTransition;
}

/** Effect */
export interface EditEffect {
  /**
   * Enabled
   * @default true
   */
  enabled?: boolean;
  /** Type */
  type:
    | "blur"
    | "brightness"
    | "contrast"
    | "saturation"
    | "grayscale"
    | "vignette"
    | "sharpen";
  /**
   * Value
   * @default 1
   */
  value?: number;
}

/** Keyframe */
export interface EditKeyframe {
  /**
   * Easing
   * @default "linear"
   */
  easing?: "linear" | "ease_in" | "ease_out" | "ease_in_out";
  /**
   * Time Ms
   * Clip-local keyframe time in milliseconds, not absolute timeline time; must not exceed clip duration.
   * @min 0
   */
  time_ms: number;
  /** Value */
  value: number;
}

/** OutputProfile */
export interface EditOutputProfile {
  /**
   * Crf
   * H.264 constant quality: lower is better/larger. 18 high, 20 balanced, 23 compact.
   * @min 15
   * @max 35
   * @default 18
   */
  crf?: number;
  /**
   * Fps
   * @min 12
   * @max 60
   * @default 30
   */
  fps?: number;
  /**
   * Height
   * @min 128
   * @multipleOf 2
   * @max 3840
   * @default 1920
   */
  height?: number;
  /**
   * Kind
   * @default "reel"
   */
  kind?: "reel" | "short" | "video" | "square" | "custom";
  /**
   * Name
   * @default "Instagram Reel"
   */
  name?: string;
  /**
   * Normalize
   * @default true
   */
  normalize?: boolean;
  /**
   * Target Lufs
   * @min -30
   * @max -10
   * @default -16
   */
  target_lufs?: number;
  /**
   * True Peak
   * @min -6
   * @max -1
   * @default -1.5
   */
  true_peak?: number;
  /**
   * Width
   * @min 128
   * @multipleOf 2
   * @max 3840
   * @default 1080
   */
  width?: number;
}

/**
 * Placement
 * Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors.
 */
export interface EditPlacement {
  /**
   * Height
   * @min 0.05
   * @max 2
   * @default 1
   */
  height?: number;
  /**
   * Width
   * @min 0.05
   * @max 2
   * @default 1
   */
  width?: number;
  /**
   * X
   * @min 0
   * @max 1
   * @default 0.5
   */
  x?: number;
  /**
   * Y
   * @min 0
   * @max 1
   * @default 0.5
   */
  y?: number;
}

/** Scene */
export interface EditScene {
  /**
   * Duration Ms
   * @min 100
   * @default 4000
   */
  duration_ms?: number;
  /** Id */
  id?: string;
  /**
   * Narration
   * @default ""
   */
  narration?: string;
  /**
   * Notes
   * @default ""
   */
  notes?: string;
  /**
   * Start Ms
   * @min 0
   * @default 0
   */
  start_ms?: number;
  /** Title */
  title: string;
  /**
   * Voice Asset Id
   * @default null
   */
  voice_asset_id?: string | null;
}

/** ScriptLine */
export interface EditScriptLine {
  /**
   * Audio Asset Id
   * Server-validated audio asset; no automatic timeline insertion.
   * @default null
   */
  audio_asset_id?: string | null;
  /**
   * Audio Source
   * @default null
   */
  audio_source?: "recorded" | "uploaded" | "generated" | null;
  /**
   * Audio Text
   * Text at recording/upload/generation time. A mismatch with text means the take may be outdated.
   * @default null
   */
  audio_text?: string | null;
  /**
   * Id
   * Stable line identity across edits and reordering.
   * @minLength 1
   * @maxLength 100
   */
  id: string;
  /**
   * Text
   * @maxLength 100000
   * @default ""
   */
  text?: string;
}

export type EditStep =
  | UpdateProjectStep
  | AddTrackStep
  | ReorderTracksStep
  | RemoveTrackStep
  | UpdateTrackStep
  | AddClipStep
  | AppendClipStep
  | DuplicateClipStep
  | ExtractAudioStep
  | UpdateClipStep
  | MoveClipStep
  | TrimClipStep
  | SetTransitionStep
  | SplitClipStep
  | RemoveClipStep
  | RestoreRevisionStep;

/** Track */
export interface EditTrack {
  /**
   * Clips
   * @maxItems 500
   */
  clips?: EditClip[];
  /**
   * Ducking
   * @default false
   */
  ducking?: boolean;
  /**
   * Gain Db
   * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
   * @min -60
   * @max 12
   * @default 0
   */
  gain_db?: number;
  /** Id */
  id?: string;
  /** Kind */
  kind:
    | "video"
    | "overlay"
    | "text"
    | "voiceover"
    | "music"
    | "sound"
    | "ambient";
  /**
   * Muted
   * @default false
   */
  muted?: boolean;
  /** Name */
  name: string;
}

/** Transform */
export interface EditTransform {
  /**
   * Fit
   * @default "cover"
   */
  fit?: "cover" | "contain";
  /**
   * Opacity
   * @min 0
   * @max 1
   * @default 1
   */
  opacity?: number;
  /**
   * Rotation
   * @min -180
   * @max 180
   * @default 0
   */
  rotation?: number;
  /**
   * Scale
   * @min 1
   * @max 4
   * @default 1
   */
  scale?: number;
  /**
   * X
   * @min 0
   * @max 1
   * @default 0.5
   */
  x?: number;
  /**
   * Y
   * @min 0
   * @max 1
   * @default 0.5
   */
  y?: number;
}

/** Transition */
export interface EditTransition {
  /**
   * Duration Ms
   * @min 0
   * @max 2000
   * @default 300
   */
  duration_ms?: number;
  /**
   * Type
   * @default "cut"
   */
  type?:
    | "cut"
    | "crossfade"
    | "fade_black"
    | "slide"
    | "wipe"
    | "zoom"
    | "blur";
}

/** Effect */
export interface EffectInput {
  /**
   * Enabled
   * @default true
   */
  enabled?: boolean;
  /** Type */
  type:
    | "blur"
    | "brightness"
    | "contrast"
    | "saturation"
    | "grayscale"
    | "vignette"
    | "sharpen";
  /**
   * Value
   * @default 1
   */
  value?: number;
}

/** Effect */
export interface EffectOutput {
  /**
   * Enabled
   * @default true
   */
  enabled: boolean;
  /** Type */
  type:
    | "blur"
    | "brightness"
    | "contrast"
    | "saturation"
    | "grayscale"
    | "vignette"
    | "sharpen";
  /**
   * Value
   * @default 1
   */
  value: number;
}

/** EncodingQuality */
export interface EncodingQuality {
  /** Crf */
  crf: number;
  /** Id */
  id: string;
  /** Name */
  name: string;
}

/** ExportCatalog */
export interface ExportCatalog {
  /**
   * Default Crf
   * @default 18
   */
  default_crf: number;
  /** Frame Rates */
  frame_rates: number[];
  /** Presets */
  presets: ExportPreset[];
  /**
   * Preview Max Edge
   * @default 640
   */
  preview_max_edge: number;
  /** Qualities */
  qualities: EncodingQuality[];
}

/** ExportOutput */
export interface ExportOutputInput {
  /**
   * Background
   * Letterbox color for contain.
   * @default "#080e10"
   * @pattern ^#[0-9a-fA-F]{6}$
   */
  background?: string;
  /**
   * Crf
   * H.264 constant quality; 15 maximum, 18 high, 20 balanced, 23 compact. Bitrate/file size depend on content.
   * @min 15
   * @max 35
   * @default 18
   */
  crf?: number;
  /**
   * Fit
   * Adapt the ENTIRE composition, including captions: contain preserves it with bars, cover crops it without distortion. Does not rearrange clips.
   * @default "contain"
   */
  fit?: "contain" | "cover";
  /**
   * Fps
   * Output frames per second. Increasing FPS repeats source frames; no motion interpolation.
   * @min 12
   * @max 60
   * @default 30
   */
  fps?: number;
  /**
   * Height
   * Encoded frame height in pixels, even.
   * @min 2
   * @multipleOf 2
   * @max 3840
   */
  height: number;
  /**
   * Width
   * Encoded frame width in pixels, even; not the editor canvas width.
   * @min 2
   * @multipleOf 2
   * @max 3840
   */
  width: number;
  /**
   * X
   * Horizontal crop/padding alignment: 0 left, 0.5 center, 1 right.
   * @min 0
   * @max 1
   * @default 0.5
   */
  x?: number;
  /**
   * Y
   * Vertical crop/padding alignment: 0 top, 0.5 center, 1 bottom.
   * @min 0
   * @max 1
   * @default 0.5
   */
  y?: number;
}

/** ExportOutput */
export interface ExportOutputOutput {
  /**
   * Background
   * Letterbox color for contain.
   * @default "#080e10"
   * @pattern ^#[0-9a-fA-F]{6}$
   */
  background: string;
  /**
   * Crf
   * H.264 constant quality; 15 maximum, 18 high, 20 balanced, 23 compact. Bitrate/file size depend on content.
   * @min 15
   * @max 35
   * @default 18
   */
  crf: number;
  /**
   * Fit
   * Adapt the ENTIRE composition, including captions: contain preserves it with bars, cover crops it without distortion. Does not rearrange clips.
   * @default "contain"
   */
  fit: "contain" | "cover";
  /**
   * Fps
   * Output frames per second. Increasing FPS repeats source frames; no motion interpolation.
   * @min 12
   * @max 60
   * @default 30
   */
  fps: number;
  /**
   * Height
   * Encoded frame height in pixels, even.
   * @min 2
   * @multipleOf 2
   * @max 3840
   */
  height: number;
  /**
   * Width
   * Encoded frame width in pixels, even; not the editor canvas width.
   * @min 2
   * @multipleOf 2
   * @max 3840
   */
  width: number;
  /**
   * X
   * Horizontal crop/padding alignment: 0 left, 0.5 center, 1 right.
   * @min 0
   * @max 1
   * @default 0.5
   */
  x: number;
  /**
   * Y
   * Vertical crop/padding alignment: 0 top, 0.5 center, 1 bottom.
   * @min 0
   * @max 1
   * @default 0.5
   */
  y: number;
}

/** ExportPlan */
export interface ExportPlan {
  /** Canvas Height */
  canvas_height: number;
  /** Canvas Width */
  canvas_width: number;
  output: ExportOutputOutput;
  /** Project Id */
  project_id: string;
  /** Revision */
  revision: number;
  /** Warnings */
  warnings: ExportWarning[];
}

/** ExportPreset */
export interface ExportPreset {
  /** Aspect */
  aspect: string;
  /** Height */
  height: number;
  /** Id */
  id: string;
  /** Kind */
  kind: "video" | "reel" | "square" | "custom";
  /** Name */
  name: string;
  /** Resolution */
  resolution: string;
  /** Width */
  width: number;
}

/** ExportWarning */
export interface ExportWarning {
  /** Asset Id */
  asset_id: string | null;
  /** Clip Id */
  clip_id: string | null;
  /** Code */
  code: string;
  /** Message */
  message: string;
}

/** Copy audio from video/overlay clip to REQUIRED existing audio target_track_id. Requires source has_audio=true. Preserves absolute start, duration, source_in, speed, gain and fades, but removes visual effects/animations/transform and incoming transition. New ID generated unless new_clip_id supplied; source visual stays unchanged and silent. No new asset/file, no persistent link: later trims/moves do not sync the copy. Target must be free for the entire copied interval; repeated extraction onto an occupied track rejects (422). Batch add_track + extract_audio to create a separate simultaneous audio layer. */
export interface ExtractAudioOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    new_clip_id?: string;
    /** Existing ID returned by this server; never guess. */
    target_track_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "extract_audio";
}

/** Copy audio from video/overlay clip to REQUIRED existing audio target_track_id. Requires source has_audio=true. Preserves absolute start, duration, source_in, speed, gain and fades, but removes visual effects/animations/transform and incoming transition. New ID generated unless new_clip_id supplied; source visual stays unchanged and silent. No new asset/file, no persistent link: later trims/moves do not sync the copy. Target must be free for the entire copied interval; repeated extraction onto an occupied track rejects (422). Batch add_track + extract_audio to create a separate simultaneous audio layer. */
export interface ExtractAudioStep {
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    new_clip_id?: string;
    /** Existing ID returned by this server; never guess. */
    target_track_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "extract_audio";
}

/** FolderDeletion */
export interface FolderDeletion {
  /**
   * Assets
   * Updated memberships: folder contents move to this collection's root. No file or project deletion.
   */
  assets: Asset[];
  /** Folder Id */
  folder_id: string;
  /** Project Id */
  project_id: string | null;
}

/** FolderRename */
export interface FolderRename {
  /**
   * Name
   * @minLength 1
   * @maxLength 100
   */
  name: string;
}

/** FolderRequest */
export interface FolderRequest {
  /**
   * Name
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  /** Project Id */
  project_id?: string | null;
}

/** FrameRequest */
export interface FrameRequest {
  /** Job Id */
  job_id?: string | null;
  /** Revision */
  revision?: number | null;
  /**
   * Time Ms
   * @default 0
   */
  time_ms?: number;
}

/** GenerateScore */
export interface GenerateScoreInput {
  /**
   * Accents Ms
   * @maxItems 100
   */
  accents_ms?: number[];
  /**
   * Bpm
   * @min 40
   * @max 180
   * @default 96
   */
  bpm?: number;
  /**
   * Duration Ms
   * @min 1000
   * @max 600000
   * @default 43000
   */
  duration_ms?: number;
  /** Folder Id */
  folder_id?: string | null;
  /**
   * Mood
   * @default "horror"
   */
  mood?: "horror" | "pulse" | "ambient";
  /** Project Id */
  project_id: string;
  /**
   * Seed
   * @min 0
   * @max 4294967295
   * @default 1
   */
  seed?: number;
  /**
   * Type
   * @default "generate_score"
   */
  type?: "generate_score";
}

/** GenerateScore */
export interface GenerateScoreOutput {
  /**
   * Accents Ms
   * @maxItems 100
   */
  accents_ms: number[];
  /**
   * Bpm
   * @min 40
   * @max 180
   * @default 96
   */
  bpm: number;
  /**
   * Duration Ms
   * @min 1000
   * @max 600000
   * @default 43000
   */
  duration_ms: number;
  /** Folder Id */
  folder_id: string | null;
  /**
   * Mood
   * @default "horror"
   */
  mood: "horror" | "pulse" | "ambient";
  /** Project Id */
  project_id: string;
  /**
   * Seed
   * @min 0
   * @max 4294967295
   * @default 1
   */
  seed: number;
  /**
   * Type
   * @default "generate_score"
   */
  type: "generate_score";
}

/** Health */
export interface Health {
  /** Ffmpeg */
  ffmpeg: boolean;
  /** Ffprobe */
  ffprobe: boolean;
  /** Status */
  status: "ok";
  /** Version */
  version: string;
}

/** ImportMedia */
export interface ImportMediaInput {
  /** Folder Id */
  folder_id?: string | null;
  /** Project Id */
  project_id: string;
  /**
   * Sources
   * @maxItems 8
   * @minItems 1
   */
  sources: MediaSourceInput[];
  /**
   * Type
   * @default "import_media"
   */
  type?: "import_media";
}

/** ImportMedia */
export interface ImportMediaOutput {
  /** Folder Id */
  folder_id: string | null;
  /** Project Id */
  project_id: string;
  /**
   * Sources
   * @maxItems 8
   * @minItems 1
   */
  sources: MediaSourceOutput[];
  /**
   * Type
   * @default "import_media"
   */
  type: "import_media";
}

/** ImportSteam */
export interface ImportSteamInput {
  /**
   * App Id
   * @exclusiveMin 0
   */
  app_id: number;
  /** Folder Id */
  folder_id?: string | null;
  /**
   * From Ms
   * @min 0
   * @default 0
   */
  from_ms?: number;
  /**
   * Max Height
   * @min 240
   * @max 2160
   * @default 1080
   */
  max_height?: number;
  /**
   * Movie Id
   * Exact returned Steam movie ID. Select after get_steam_games, never assume the first trailer is gameplay.
   * @exclusiveMin 0
   */
  movie_id: number;
  /** Project Id */
  project_id: string;
  /**
   * To Ms
   * @exclusiveMin 0
   * @default 120000
   */
  to_ms?: number;
  /**
   * Type
   * @default "import_steam_trailer"
   */
  type?: "import_steam_trailer";
}

/** ImportSteam */
export interface ImportSteamOutput {
  /**
   * App Id
   * @exclusiveMin 0
   */
  app_id: number;
  /** Folder Id */
  folder_id: string | null;
  /**
   * From Ms
   * @min 0
   * @default 0
   */
  from_ms: number;
  /**
   * Max Height
   * @min 240
   * @max 2160
   * @default 1080
   */
  max_height: number;
  /**
   * Movie Id
   * Exact returned Steam movie ID. Select after get_steam_games, never assume the first trailer is gameplay.
   * @exclusiveMin 0
   */
  movie_id: number;
  /** Project Id */
  project_id: string;
  /**
   * To Ms
   * @exclusiveMin 0
   * @default 120000
   */
  to_ms: number;
  /**
   * Type
   * @default "import_steam_trailer"
   */
  type: "import_steam_trailer";
}

/** InspectionFrame */
export interface InspectionFrame {
  /** From Ms */
  from_ms: number;
  /** Job Id */
  job_id: string | null;
  /** Output Time Ms */
  output_time_ms: number;
  /** Path */
  path: string;
  /** Project Id */
  project_id: string;
  /** Revision */
  revision: number;
  /** Time Ms */
  time_ms: number;
  /** To Ms */
  to_ms: number;
  /** Url */
  url: string;
}

/** InspectionPoints */
export interface InspectionPoints {
  /** Revision */
  revision: number;
  /** Timestamps Ms */
  timestamps_ms: number[];
}

/** InspectionSheet */
export interface InspectionSheet {
  /** From Ms */
  from_ms: number;
  /** Job Id */
  job_id: string | null;
  /** Path */
  path: string;
  /** Revision */
  revision: number;
  /** Timestamps Ms */
  timestamps_ms: number[];
  /** To Ms */
  to_ms: number;
  /** Url */
  url: string;
}

/** InstallTranscriber */
export interface InstallTranscriberInput {
  /**
   * Model
   * @default "tiny.en"
   */
  model?: "tiny.en" | "tiny";
  /**
   * Type
   * @default "install_transcriber"
   */
  type?: "install_transcriber";
}

/** InstallTranscriber */
export interface InstallTranscriberOutput {
  /**
   * Model
   * @default "tiny.en"
   */
  model: "tiny.en" | "tiny";
  /**
   * Type
   * @default "install_transcriber"
   */
  type: "install_transcriber";
}

/**
 * InstallVoiceModel
 * Install the pinned local Supertonic 3 weights and license; no paid provider or timeline edit.
 */
export interface InstallVoiceModelInput {
  /**
   * Type
   * @default "install_voice_model"
   */
  type?: "install_voice_model";
}

/**
 * InstallVoiceModel
 * Install the pinned local Supertonic 3 weights and license; no paid provider or timeline edit.
 */
export interface InstallVoiceModelOutput {
  /**
   * Type
   * @default "install_voice_model"
   */
  type: "install_voice_model";
}

/** Issue */
export interface Issue {
  /** Asset Id */
  asset_id: string | null;
  /** Clip Id */
  clip_id: string | null;
  /** Code */
  code: string;
  /** From Ms */
  from_ms: number | null;
  /** Message */
  message: string;
  /** To Ms */
  to_ms: number | null;
  /** Track Id */
  track_id: string | null;
}

export type JsonValue = any;

/** Keyframe */
export interface KeyframeInput {
  /**
   * Easing
   * @default "linear"
   */
  easing?: "linear" | "ease_in" | "ease_out" | "ease_in_out";
  /**
   * Time Ms
   * Clip-local keyframe time in milliseconds, not absolute timeline time; must not exceed clip duration.
   * @min 0
   */
  time_ms: number;
  /** Value */
  value: number;
}

/** Keyframe */
export interface KeyframeOutput {
  /**
   * Easing
   * @default "linear"
   */
  easing: "linear" | "ease_in" | "ease_out" | "ease_in_out";
  /**
   * Time Ms
   * Clip-local keyframe time in milliseconds, not absolute timeline time; must not exceed clip duration.
   * @min 0
   */
  time_ms: number;
  /** Value */
  value: number;
}

/** LayoutItem */
export interface LayoutItem {
  bounds: CaptionBounds | null;
  /** Clip Id */
  clip_id: string;
  /** Clipped */
  clipped: boolean;
  /** End Ms */
  end_ms: number;
  /** Start Ms */
  start_ms: number;
  /** Text */
  text: string;
  /** Track Id */
  track_id: string;
  /** Unclipped Bounds */
  unclipped_bounds: Record<string, number> | null;
}

/** LayoutReport */
export interface LayoutReport {
  /** Issues */
  issues: Record<string, any>[];
  /** Items */
  items: LayoutItem[];
  /** Passed */
  passed: boolean;
  /** Revision */
  revision: number;
}

/** LayoutRequest */
export interface LayoutRequest {
  /** Project Id */
  project_id: string;
  /** Revision */
  revision?: number | null;
}

/** LoudnessSample */
export interface LoudnessSample {
  /** Momentary Lufs */
  momentary_lufs: number;
  /** Short Term Lufs */
  short_term_lufs: number;
  /** Time Ms */
  time_ms: number;
}

/** MediaMetadata */
export interface MediaMetadata {
  /**
   * Audio Duration Ms
   * Measured audio stream duration; null for older metadata or missing audio.
   */
  audio_duration_ms: number | null;
  /** Codec */
  codec: string | null;
  /** Duration Ms */
  duration_ms: number | null;
  /** Has Audio */
  has_audio: boolean;
  /** Height */
  height: number | null;
  /** Kind */
  kind: "image" | "video" | "audio";
  /** Size */
  size: number;
  /** Width */
  width: number | null;
}

/** MediaSource */
export interface MediaSourceInput {
  /**
   * Filename
   * @minLength 1
   * @maxLength 180
   * @default "source.mp4"
   */
  filename?: string;
  /**
   * From Ms
   * @min 0
   * @max 3600000
   * @default 0
   */
  from_ms?: number;
  /**
   * Include Audio
   * Keep embedded audio when importing video. Audio-only media retain their audio. Video defaults to silent for separate editing tracks.
   * @default false
   */
  include_audio?: boolean;
  /**
   * License
   * Known ownership/license; availability does not grant a reuse license.
   * @maxLength 4096
   * @default ""
   */
  license?: string;
  /**
   * Max Height
   * @min 240
   * @max 2160
   * @default 1080
   */
  max_height?: number;
  /**
   * Source
   * Source page / attribution, retained on the imported asset.
   * @maxLength 4096
   * @default ""
   */
  source?: string;
  /**
   * Tags
   * @maxItems 50
   */
  tags?: string[];
  /**
   * To Ms
   * Exclusive source end. HLS defaults to at most the first 120 seconds. Direct files are not trimmed unless an interval is supplied.
   */
  to_ms?: number | null;
  /**
   * Url
   * Public HTTP(S) direct media or unencrypted VOD HLS URL; never a local path.
   * @minLength 8
   * @maxLength 4096
   */
  url: string;
}

/** MediaSource */
export interface MediaSourceOutput {
  /**
   * Filename
   * @minLength 1
   * @maxLength 180
   * @default "source.mp4"
   */
  filename: string;
  /**
   * From Ms
   * @min 0
   * @max 3600000
   * @default 0
   */
  from_ms: number;
  /**
   * Include Audio
   * Keep embedded audio when importing video. Audio-only media retain their audio. Video defaults to silent for separate editing tracks.
   * @default false
   */
  include_audio: boolean;
  /**
   * License
   * Known ownership/license; availability does not grant a reuse license.
   * @maxLength 4096
   * @default ""
   */
  license: string;
  /**
   * Max Height
   * @min 240
   * @max 2160
   * @default 1080
   */
  max_height: number;
  /**
   * Source
   * Source page / attribution, retained on the imported asset.
   * @maxLength 4096
   * @default ""
   */
  source: string;
  /**
   * Tags
   * @maxItems 50
   */
  tags: string[];
  /**
   * To Ms
   * Exclusive source end. HLS defaults to at most the first 120 seconds. Direct files are not trimmed unless an interval is supplied.
   */
  to_ms: number | null;
  /**
   * Url
   * Public HTTP(S) direct media or unencrypted VOD HLS URL; never a local path.
   * @minLength 8
   * @maxLength 4096
   */
  url: string;
}

/** Set absolute start_ms; optional target_track_id relocates the SAME clip. No snapping, copying or audio extraction. Clears moved clip's incoming transition and the next chronological clip's transition on the SOURCE track; validates primary timeline and asset/track compatibility atomically. Moving to audio preserves visual animations, so incompatible properties reject. */
export interface MoveClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /**
     * Integer milliseconds on the project timeline.
     * @min 0
     */
    start_ms: number;
    /** Existing ID returned by this server; never guess. */
    target_track_id?: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "move_clip";
}

/** Set absolute start_ms; optional target_track_id relocates the SAME clip. No snapping, copying or audio extraction. Clears moved clip's incoming transition and the next chronological clip's transition on the SOURCE track; validates primary timeline and asset/track compatibility atomically. Moving to audio preserves visual animations, so incompatible properties reject. */
export interface MoveClipStep {
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /**
     * Integer milliseconds on the project timeline.
     * @min 0
     */
    start_ms: number;
    /** Existing ID returned by this server; never guess. */
    target_track_id?: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "move_clip";
}

/** NarrationLine */
export interface NarrationLine {
  /**
   * Id
   * @pattern ^[a-zA-Z0-9_-]{1,60}$
   */
  id: string;
  /**
   * Text
   * @minLength 1
   * @maxLength 1000
   */
  text: string;
}

/** NarrationTake */
export interface NarrationTake {
  asset: Asset;
  /** Id */
  id: string;
  /** Text */
  text: string;
  transcript: Transcript;
}

export type Operation =
  | UpdateProjectOperation
  | AddTrackOperation
  | ReorderTracksOperation
  | RemoveTrackOperation
  | UpdateTrackOperation
  | AddClipOperation
  | AppendClipOperation
  | DuplicateClipOperation
  | ExtractAudioOperation
  | UpdateClipOperation
  | MoveClipOperation
  | TrimClipOperation
  | SetTransitionOperation
  | SplitClipOperation
  | RemoveClipOperation
  | RestoreRevisionOperation;

/** OutputProfile */
export interface OutputProfileInput {
  /**
   * Crf
   * H.264 constant quality: lower is better/larger. 18 high, 20 balanced, 23 compact.
   * @min 15
   * @max 35
   * @default 18
   */
  crf?: number;
  /**
   * Fps
   * @min 12
   * @max 60
   * @default 30
   */
  fps?: number;
  /**
   * Height
   * @min 128
   * @multipleOf 2
   * @max 3840
   * @default 1920
   */
  height?: number;
  /**
   * Kind
   * @default "reel"
   */
  kind?: "reel" | "short" | "video" | "square" | "custom";
  /**
   * Name
   * @default "Instagram Reel"
   */
  name?: string;
  /**
   * Normalize
   * @default true
   */
  normalize?: boolean;
  /**
   * Target Lufs
   * @min -30
   * @max -10
   * @default -16
   */
  target_lufs?: number;
  /**
   * True Peak
   * @min -6
   * @max -1
   * @default -1.5
   */
  true_peak?: number;
  /**
   * Width
   * @min 128
   * @multipleOf 2
   * @max 3840
   * @default 1080
   */
  width?: number;
}

/** OutputProfile */
export interface OutputProfileOutput {
  /**
   * Crf
   * H.264 constant quality: lower is better/larger. 18 high, 20 balanced, 23 compact.
   * @min 15
   * @max 35
   * @default 18
   */
  crf: number;
  /**
   * Fps
   * @min 12
   * @max 60
   * @default 30
   */
  fps: number;
  /**
   * Height
   * @min 128
   * @multipleOf 2
   * @max 3840
   * @default 1920
   */
  height: number;
  /**
   * Kind
   * @default "reel"
   */
  kind: "reel" | "short" | "video" | "square" | "custom";
  /**
   * Name
   * @default "Instagram Reel"
   */
  name: string;
  /**
   * Normalize
   * @default true
   */
  normalize: boolean;
  /**
   * Target Lufs
   * @min -30
   * @max -10
   * @default -16
   */
  target_lufs: number;
  /**
   * True Peak
   * @min -6
   * @max -1
   * @default -1.5
   */
  true_peak: number;
  /**
   * Width
   * @min 128
   * @multipleOf 2
   * @max 3840
   * @default 1080
   */
  width: number;
}

/** PackageDelivery */
export interface PackageDeliveryInput {
  /** Caption Track Ids */
  caption_track_ids?: string[] | null;
  /** Job Id */
  job_id: string;
  /**
   * Type
   * @default "package_delivery"
   */
  type?: "package_delivery";
  /** Verification Task Id */
  verification_task_id: string;
}

/** PackageDelivery */
export interface PackageDeliveryOutput {
  /** Caption Track Ids */
  caption_track_ids: string[] | null;
  /** Job Id */
  job_id: string;
  /**
   * Type
   * @default "package_delivery"
   */
  type: "package_delivery";
  /** Verification Task Id */
  verification_task_id: string;
}

/**
 * Placement
 * Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors.
 */
export interface PlacementInput {
  /**
   * Height
   * @min 0.05
   * @max 2
   * @default 1
   */
  height?: number;
  /**
   * Width
   * @min 0.05
   * @max 2
   * @default 1
   */
  width?: number;
  /**
   * X
   * @min 0
   * @max 1
   * @default 0.5
   */
  x?: number;
  /**
   * Y
   * @min 0
   * @max 1
   * @default 0.5
   */
  y?: number;
}

/**
 * Placement
 * Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors.
 */
export interface PlacementOutput {
  /**
   * Height
   * @min 0.05
   * @max 2
   * @default 1
   */
  height: number;
  /**
   * Width
   * @min 0.05
   * @max 2
   * @default 1
   */
  width: number;
  /**
   * X
   * @min 0
   * @max 1
   * @default 0.5
   */
  x: number;
  /**
   * Y
   * @min 0
   * @max 1
   * @default 0.5
   */
  y: number;
}

/** Preflight */
export interface Preflight {
  /** Asset Count */
  asset_count: number;
  /** Clip Count */
  clip_count: number;
  /** Duration Ms */
  duration_ms: number;
  /** Errors */
  errors: Issue[];
  /** Project Id */
  project_id: string;
  /** Requires Render Review */
  requires_render_review: boolean;
  /** Revision */
  revision: number;
  /** Track Count */
  track_count: number;
  /** Valid */
  valid: boolean;
  /** Warnings */
  warnings: Issue[];
}

/** PrepareNarration */
export interface PrepareNarrationInput {
  /** Folder Id */
  folder_id?: string | null;
  /**
   * Language
   * @default "en"
   */
  language?:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi";
  /**
   * Lines
   * @maxItems 20
   * @minItems 1
   */
  lines: NarrationLine[];
  /**
   * Model
   * @default "tiny.en"
   */
  model?: "tiny.en" | "tiny";
  /** Project Id */
  project_id: string;
  /**
   * Speed
   * @min 0.7
   * @max 2
   * @default 1.08
   */
  speed?: number;
  /**
   * Steps
   * @min 4
   * @max 16
   * @default 12
   */
  steps?: number;
  /**
   * Type
   * @default "prepare_narration"
   */
  type?: "prepare_narration";
  /**
   * Voice Id
   * @default "M2"
   */
  voice_id?:
    | "M1"
    | "M2"
    | "M3"
    | "M4"
    | "M5"
    | "F1"
    | "F2"
    | "F3"
    | "F4"
    | "F5";
}

/** PrepareNarration */
export interface PrepareNarrationOutput {
  /** Folder Id */
  folder_id: string | null;
  /**
   * Language
   * @default "en"
   */
  language:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi";
  /**
   * Lines
   * @maxItems 20
   * @minItems 1
   */
  lines: NarrationLine[];
  /**
   * Model
   * @default "tiny.en"
   */
  model: "tiny.en" | "tiny";
  /** Project Id */
  project_id: string;
  /**
   * Speed
   * @min 0.7
   * @max 2
   * @default 1.08
   */
  speed: number;
  /**
   * Steps
   * @min 4
   * @max 16
   * @default 12
   */
  steps: number;
  /**
   * Type
   * @default "prepare_narration"
   */
  type: "prepare_narration";
  /**
   * Voice Id
   * @default "M2"
   */
  voice_id: "M1" | "M2" | "M3" | "M4" | "M5" | "F1" | "F2" | "F3" | "F4" | "F5";
}

/** ProductionCapabilities */
export interface ProductionCapabilities {
  /** Limits */
  limits: Record<string, number>;
  /** Limits Notes */
  limits_notes: string[];
  /** Task Types */
  task_types: string[];
  /** Templates */
  templates: Record<string, any>[];
  /** Transcribers */
  transcribers: TranscriberStatus[];
  /**
   * Version
   * @default 1
   */
  version: 1;
  /** Workflow */
  workflow: string[];
}

/** ProductionResult */
export interface ProductionResult {
  /** Assets */
  assets: Asset[];
  delivery: Delivery | null;
  model_status: TranscriberStatus | null;
  /** Narration */
  narration: NarrationTake[];
  transcript: Transcript | null;
  /** Versioned measured FFprobe, decode, SHA-256, audio, caption layout and optional independent ASR report. Checks report measured failures; successful task execution alone is not a passed video. */
  verification: VerificationReport | null;
  voice_model: VoiceProvider | null;
}

/** ProductionTask */
export interface ProductionTask {
  /**
   * Cancel Requested
   * @default false
   */
  cancel_requested: boolean;
  /** Created At */
  created_at: string;
  /** Error */
  error: string | null;
  /** Id */
  id: string;
  /** Phase */
  phase: string;
  /**
   * Progress
   * @min 0
   * @max 1
   */
  progress: number;
  /** Request */
  request:
    | ({
        type: "generate_score";
      } & GenerateScoreOutput)
    | ({
        type: "import_media";
      } & ImportMediaOutput)
    | ({
        type: "import_steam_trailer";
      } & ImportSteamOutput)
    | ({
        type: "install_transcriber";
      } & InstallTranscriberOutput)
    | ({
        type: "install_voice_model";
      } & InstallVoiceModelOutput)
    | ({
        type: "package_delivery";
      } & PackageDeliveryOutput)
    | ({
        type: "prepare_narration";
      } & PrepareNarrationOutput)
    | ({
        type: "transcribe";
      } & TranscribeOutput)
    | ({
        type: "verify_render";
      } & VerifyRenderOutput);
  /** Request Key */
  request_key: string;
  result: ProductionResult;
  /** Status */
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  /** Updated At */
  updated_at: string;
}

/** Project */
export interface Project {
  /** Asset Ids */
  asset_ids?: string[];
  /**
   * Brief
   * @maxLength 20000
   * @default ""
   */
  brief?: string;
  /**
   * Channel Id
   * Optional local editorial channel ID. Null means independent. Link/unlink via update_project with expected_revision; no media or timeline changes.
   */
  channel_id?: string | null;
  /** Id */
  id?: string;
  /**
   * Name
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  profile?: OutputProfileInput;
  /**
   * Revision
   * @min 1
   * @default 1
   */
  revision?: number;
  /**
   * Scenes
   * @maxItems 500
   */
  scenes?: SceneInput[];
  /**
   * Script
   * @maxLength 100000
   * @default ""
   */
  script?: string;
  /**
   * Script Lines
   * Ordered narration lines and optional audio takes. Empty for legacy plain-text scripts. When supplied to update_project, replaces the list and synchronizes script with newline-joined text. A changed script-only edit clears these associations. Does not alter scenes or timeline clips.
   * @maxItems 500
   */
  script_lines?: ScriptLineInput[];
  /**
   * Tracks
   * @maxItems 32
   */
  tracks?: TrackInput[];
}

/** ProjectSnapshot */
export interface ProjectSnapshot {
  /** Asset Ids */
  asset_ids: string[];
  /**
   * Brief
   * @maxLength 20000
   * @default ""
   */
  brief: string;
  /** Live editorial channel context, even for historical project reads; not part of the immutable timeline snapshot. */
  channel_context: ChannelContext | null;
  /**
   * Channel Id
   * Optional local editorial channel ID. Null means independent. Link/unlink via update_project with expected_revision; no media or timeline changes.
   */
  channel_id: string | null;
  /**
   * Created At
   * Immutable project creation time from its first persisted revision, in ISO 8601 UTC. Empty only for an unpersisted snapshot.
   * @default ""
   */
  created_at: string;
  /**
   * Duration Ms
   * Maximum clip end, including muted tracks, in milliseconds.
   * @min 0
   */
  duration_ms: number;
  /** Id */
  id: string;
  /**
   * Name
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  profile: OutputProfileOutput;
  /**
   * Revision
   * @min 1
   * @default 1
   */
  revision: number;
  /**
   * Scenes
   * @maxItems 500
   */
  scenes: SceneOutput[];
  /**
   * Script
   * @maxLength 100000
   * @default ""
   */
  script: string;
  /**
   * Script Lines
   * Ordered narration lines and optional audio takes. Empty for legacy plain-text scripts. When supplied to update_project, replaces the list and synchronizes script with newline-joined text. A changed script-only edit clears these associations. Does not alter scenes or timeline clips.
   * @maxItems 500
   */
  script_lines: ScriptLineOutput[];
  /**
   * Tracks
   * @maxItems 32
   */
  tracks: TrackOutput[];
}

/** ProjectVersion */
export interface ProjectVersion {
  /** Id */
  id: string;
  /** Revision */
  revision: number;
}

/** Publication */
export interface Publication {
  /**
   * Average Viewed Percent
   * 0–100 percent; loops can exceed 100. Null means unknown, never zero.
   */
  average_viewed_percent: number | null;
  /** Comments */
  comments: number | null;
  /**
   * Evidence
   * Manual source/provenance, observation period and caveats. No automatic analytics sync.
   * @maxLength 4000
   * @default ""
   */
  evidence: string;
  /** Id */
  id: string;
  /** Likes */
  likes: number | null;
  /** Metrics As Of */
  metrics_as_of: string | null;
  /** Platform */
  platform:
    | "youtube"
    | "tiktok"
    | "instagram"
    | "facebook"
    | "twitch"
    | "x"
    | "linkedin"
    | "other";
  /**
   * Project Id
   * Optional currently linked project; historical publication remains if later unlinked or deleted.
   */
  project_id: string | null;
  /** Published At */
  published_at: string | null;
  /** Recorded At */
  recorded_at: string;
  /**
   * Status
   * @default "published"
   */
  status: "draft" | "scheduled" | "published";
  /**
   * Title
   * @minLength 1
   * @maxLength 200
   */
  title: string;
  /**
   * Url
   * @maxLength 2000
   */
  url: string;
  /** Views */
  views: number | null;
}

/** PublicationWrite */
export interface PublicationWrite {
  /**
   * Average Viewed Percent
   * 0–100 percent; loops can exceed 100. Null means unknown, never zero.
   */
  average_viewed_percent?: number | null;
  /** Comments */
  comments?: number | null;
  /**
   * Evidence
   * Manual source/provenance, observation period and caveats. No automatic analytics sync.
   * @maxLength 4000
   * @default ""
   */
  evidence?: string;
  /**
   * Expected Version
   * @min 1
   */
  expected_version: number;
  /** Likes */
  likes?: number | null;
  /** Metrics As Of */
  metrics_as_of?: string | null;
  /** Platform */
  platform:
    | "youtube"
    | "tiktok"
    | "instagram"
    | "facebook"
    | "twitch"
    | "x"
    | "linkedin"
    | "other";
  /**
   * Project Id
   * Optional currently linked project; historical publication remains if later unlinked or deleted.
   */
  project_id?: string | null;
  /**
   * Publication Id
   * Omit to append; existing ID to replace this record, e.g. refresh manually observed metrics.
   */
  publication_id?: string | null;
  /** Published At */
  published_at?: string | null;
  /**
   * Status
   * @default "published"
   */
  status?: "draft" | "scheduled" | "published";
  /**
   * Title
   * @minLength 1
   * @maxLength 200
   */
  title: string;
  /**
   * Url
   * @maxLength 2000
   */
  url: string;
  /** Views */
  views?: number | null;
}

/** ReelBeat */
export interface ReelBeat {
  /**
   * Color
   * @default "#D8FB76"
   * @pattern ^#[a-fA-F0-9]{6}$
   */
  color?: string;
  /**
   * Duration Ms
   * Omit to fit actual voice duration with breathing room. Explicit times never speed up or trim speech implicitly.
   */
  duration_ms?: number | null;
  /**
   * Id
   * ID of a completed narration line, or unique beat ID if using narration_asset_id.
   * @pattern ^[a-zA-Z0-9_-]{1,60}$
   */
  id: string;
  /** Narration Asset Id */
  narration_asset_id?: string | null;
  /**
   * Role
   * @default "feature"
   */
  role?: "hook" | "feature" | "outro";
  /**
   * Shots
   * @maxItems 8
   * @minItems 1
   */
  shots: ReelShot[];
  /**
   * Subtitle
   * @maxLength 180
   * @default ""
   */
  subtitle?: string;
  /**
   * Tagline
   * @maxLength 120
   * @default ""
   */
  tagline?: string;
  /**
   * Title
   * @minLength 1
   * @maxLength 150
   */
  title: string;
}

/** ReelShot */
export interface ReelShot {
  /** Asset Id */
  asset_id: string;
  /**
   * Brightness
   * @min -1
   * @max 1
   * @default 0
   */
  brightness?: number;
  /**
   * Source In Ms
   * @min 0
   * @default 0
   */
  source_in_ms?: number;
}

/** RemoveAssetLocation */
export interface RemoveAssetLocation {
  /**
   * Expected Version
   * Confirmed asset metadata version. Stale version returns 409; reload and reconcile.
   * @min 1
   */
  expected_version: number;
  /**
   * Project Id
   * Omit for shared library. Removing membership retains bytes. Current project timeline/asset-list references block removal from that project.
   */
  project_id?: string | null;
}

/** Remove one clip; no ripple and source asset remains in library. Clears next chronological clip's incoming transition on source track. Full primary timeline validation may reject inconsistent pre-existing overlaps. */
export interface RemoveClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "remove_clip";
}

/** Remove one clip; no ripple and source asset remains in library. Clears next chronological clip's incoming transition on source track. Full primary timeline validation may reject inconsistent pre-existing overlaps. */
export interface RemoveClipStep {
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "remove_clip";
}

/** RemoveScriptAudioRequest */
export interface RemoveScriptAudioRequest {
  /**
   * Audio Asset Id
   * Exact take currently attached to the selected line; a different take returns 409.
   * @minLength 1
   */
  audio_asset_id: string;
  /**
   * Expected Revision
   * Last confirmed project revision; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  /**
   * Expected Version
   * Confirmed asset metadata version. Stale version returns 409; reload and reconcile.
   * @min 1
   */
  expected_version: number;
}

/** RemoveScriptAudioResult */
export interface RemoveScriptAudioResult {
  /**
   * Asset Ids
   * Exclusive private sources deleted. Shared library and other projects' historical sources are preserved.
   */
  asset_ids: string[];
  /**
   * Deleted Files
   * Existing nonempty files physically removed by this cleanup pass.
   * @min 0
   */
  deleted_files: number;
  /**
   * Freed Bytes
   * Bytes physically unlinked in this pass, not an estimate.
   * @min 0
   */
  freed_bytes: number;
  /** Job Ids */
  job_ids: string[];
  /**
   * Pending Files
   * Durable pending cleanup entries; nonzero means deletion committed but disk cleanup is incomplete. Retried every 10 seconds and after restart.
   * @min 0
   */
  pending_files: number;
  project: ProjectSnapshot;
  /** Project Ids */
  project_ids: string[];
  /**
   * Retained Asset Id
   * Source retained only because another collection/project/history still uses it. Removed from this project's collection regardless.
   */
  retained_asset_id: string | null;
}

/** Remove a track. By default only EMPTY tracks can be removed; nonempty tracks reject. Set remove_clips=true explicitly to atomically remove the track and all its clips, including tracks with more than 100 clips. Source media is retained; restore_revision can undo the edit. Default tracks can also be removed. Confirm the intended track and contents before removing a populated track. */
export interface RemoveTrackOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /**
     * Explicitly remove every clip on this track too. Source media is retained. Defaults to false (empty tracks only).
     * @default false
     */
    remove_clips?: boolean;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "remove_track";
}

/** Remove a track. By default only EMPTY tracks can be removed; nonempty tracks reject. Set remove_clips=true explicitly to atomically remove the track and all its clips, including tracks with more than 100 clips. Source media is retained; restore_revision can undo the edit. Default tracks can also be removed. Confirm the intended track and contents before removing a populated track. */
export interface RemoveTrackStep {
  payload: {
    /**
     * Explicitly remove every clip on this track too. Source media is retained. Defaults to false (empty tracks only).
     * @default false
     */
    remove_clips?: boolean;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "remove_track";
}

/** RenderJob */
export interface RenderJob {
  /** Created At */
  created_at: string;
  /** Error */
  error: string | null;
  /** Finished At */
  finished_at: string | null;
  /** Id */
  id: string;
  metadata: MediaMetadata | null;
  /** Resolved encoded settings, including the 640 px cap for previews. Null only for legacy jobs. */
  output: ExportOutputOutput | null;
  /** Output Url */
  output_url: string | null;
  /** Phase */
  phase: string;
  /** Progress */
  progress: number;
  /** Project Id */
  project_id: string;
  /** Project Name */
  project_name: string;
  /** Render Seconds */
  render_seconds: number | null;
  request: RenderRequestOutput;
  /** Revision */
  revision: number;
  /** Started At */
  started_at: string | null;
  /** Status */
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  /**
   * Warnings
   * Source enlargement/framing warnings; not a claim of visual quality.
   */
  warnings: ExportWarning[];
}

/** RenderRequest */
export interface RenderRequestInput {
  /** Expected Revision */
  expected_revision?: number | null;
  /**
   * From Ms
   * @min 0
   * @default 0
   */
  from_ms?: number;
  /** Optional export-only settings; project profile, clips and revision stay unchanged. Omit to use the project profile. Preview applies this framing but caps its longest edge at 640 px and uses CRF 27. Discover /api/export-presets. */
  output?: ExportOutputInput | null;
  /**
   * Quality
   * @default "final"
   */
  quality?: "preview" | "final";
  /** To Ms */
  to_ms?: number | null;
}

/** RenderRequest */
export interface RenderRequestOutput {
  /** Expected Revision */
  expected_revision: number | null;
  /**
   * From Ms
   * @min 0
   * @default 0
   */
  from_ms: number;
  /** Optional export-only settings; project profile, clips and revision stay unchanged. Omit to use the project profile. Preview applies this framing but caps its longest edge at 640 px and uses CRF 27. Discover /api/export-presets. */
  output: ExportOutputOutput | null;
  /**
   * Quality
   * @default "final"
   */
  quality: "preview" | "final";
  /** To Ms */
  to_ms: number | null;
}

/** Replace ordering using every existing track ID exactly once. No timing changes. Track order affects text/overlay compositing order; this is not merely a UI preference. */
export interface ReorderTracksOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** @uniqueItems true */
    track_ids: string[];
  };
  type: "reorder_tracks";
}

/** Replace ordering using every existing track ID exactly once. No timing changes. Track order affects text/overlay compositing order; this is not merely a UI preference. */
export interface ReorderTracksStep {
  payload: {
    /** @uniqueItems true */
    track_ids: string[];
  };
  type: "reorder_tracks";
}

/** Copy an existing historical snapshot into a NEW current revision. History is preserved, revision never decreases. Assets and render jobs are not rolled back. Repeated current_revision-1 is not multi-step undo: choose the actual target from list_revisions/history. */
export interface RestoreRevisionOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** @min 1 */
    revision: number;
  };
  type: "restore_revision";
}

/** Copy an existing historical snapshot into a NEW current revision. History is preserved, revision never decreases. Assets and render jobs are not rolled back. Repeated current_revision-1 is not multi-step undo: choose the actual target from list_revisions/history. */
export interface RestoreRevisionStep {
  payload: {
    /** @min 1 */
    revision: number;
  };
  type: "restore_revision";
}

/** ReviewComment */
export interface ReviewComment {
  /** Created At */
  created_at: string;
  /** Id */
  id: string;
  /** Message */
  message: string;
  /** Project Id */
  project_id: string;
  /** Resolved */
  resolved: boolean;
  /** Revision */
  revision: number;
  /** Time Ms */
  time_ms: number;
}

/** Revision */
export interface Revision {
  /** Created At */
  created_at: string;
  /** Operation */
  operation: string;
  /** Revision */
  revision: number;
}

/** RevisionCompare */
export interface RevisionCompare {
  /**
   * After Revision
   * @min 1
   */
  after_revision: number;
  /**
   * Before Revision
   * @min 1
   */
  before_revision: number;
}

/** RevisionComparison */
export interface RevisionComparison {
  /** After Revision */
  after_revision: number;
  /** Audio Unchanged */
  audio_unchanged: boolean;
  /** Before Revision */
  before_revision: number;
  /** Clip Changes */
  clip_changes: ClipChange[];
  /** Profile Unchanged */
  profile_unchanged: boolean;
  /** Project Id */
  project_id: string;
  /** Script Unchanged */
  script_unchanged: boolean;
  /** Text Unchanged */
  text_unchanged: boolean;
  /** Track Changes */
  track_changes: string[];
}

/** Scene */
export interface SceneInput {
  /**
   * Duration Ms
   * @min 100
   * @default 4000
   */
  duration_ms?: number;
  /** Id */
  id?: string;
  /**
   * Narration
   * @default ""
   */
  narration?: string;
  /**
   * Notes
   * @default ""
   */
  notes?: string;
  /**
   * Start Ms
   * @min 0
   * @default 0
   */
  start_ms?: number;
  /** Title */
  title: string;
  /** Voice Asset Id */
  voice_asset_id?: string | null;
}

/** Scene */
export interface SceneOutput {
  /**
   * Duration Ms
   * @min 100
   * @default 4000
   */
  duration_ms: number;
  /** Id */
  id: string;
  /**
   * Narration
   * @default ""
   */
  narration: string;
  /**
   * Notes
   * @default ""
   */
  notes: string;
  /**
   * Start Ms
   * @min 0
   * @default 0
   */
  start_ms: number;
  /** Title */
  title: string;
  /** Voice Asset Id */
  voice_asset_id: string | null;
}

/** ScriptLine */
export interface ScriptLineInput {
  /**
   * Audio Asset Id
   * Server-validated audio asset; no automatic timeline insertion.
   */
  audio_asset_id?: string | null;
  /** Audio Source */
  audio_source?: "recorded" | "uploaded" | "generated" | null;
  /**
   * Audio Text
   * Text at recording/upload/generation time. A mismatch with text means the take may be outdated.
   */
  audio_text?: string | null;
  /**
   * Id
   * Stable line identity across edits and reordering.
   * @minLength 1
   * @maxLength 100
   */
  id: string;
  /**
   * Text
   * @maxLength 100000
   * @default ""
   */
  text?: string;
}

/** ScriptLine */
export interface ScriptLineOutput {
  /**
   * Audio Asset Id
   * Server-validated audio asset; no automatic timeline insertion.
   */
  audio_asset_id: string | null;
  /** Audio Source */
  audio_source: "recorded" | "uploaded" | "generated" | null;
  /**
   * Audio Text
   * Text at recording/upload/generation time. A mismatch with text means the take may be outdated.
   */
  audio_text: string | null;
  /**
   * Id
   * Stable line identity across edits and reordering.
   * @minLength 1
   * @maxLength 100
   */
  id: string;
  /**
   * Text
   * @maxLength 100000
   * @default ""
   */
  text: string;
}

/** Primary video track only. Non-cut needs a preceding clip. Use a positive duration shorter than BOTH clips. Sets start to previous end minus overlap (cut: previous end). Shifts ALL clips on ALL tracks, including muted ones, and all scenes whose start >= this clip's OLD start by the same delta. Spanning earlier audio/text stays unchanged; review sync. First clip only accepts cut. Timeline validation is atomic. If ripple creates an audio/text/overlay collision, the entire write rejects (422); use separate tracks or a batch that resolves every collision. */
export interface SetTransitionOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
    /** Transition */
    transition: {
      /**
       * Duration Ms
       * @min 0
       * @max 2000
       * @default 300
       */
      duration_ms?: number;
      /**
       * Type
       * @default "cut"
       */
      type?:
        | "cut"
        | "crossfade"
        | "fade_black"
        | "slide"
        | "wipe"
        | "zoom"
        | "blur";
    };
  };
  type: "set_transition";
}

/** Primary video track only. Non-cut needs a preceding clip. Use a positive duration shorter than BOTH clips. Sets start to previous end minus overlap (cut: previous end). Shifts ALL clips on ALL tracks, including muted ones, and all scenes whose start >= this clip's OLD start by the same delta. Spanning earlier audio/text stays unchanged; review sync. First clip only accepts cut. Timeline validation is atomic. If ripple creates an audio/text/overlay collision, the entire write rejects (422); use separate tracks or a batch that resolves every collision. */
export interface SetTransitionStep {
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
    /** Transition */
    transition: {
      /**
       * Duration Ms
       * @min 0
       * @max 2000
       * @default 300
       */
      duration_ms?: number;
      /**
       * Type
       * @default "cut"
       */
      type?:
        | "cut"
        | "crossfade"
        | "fade_black"
        | "slide"
        | "wipe"
        | "zoom"
        | "blur";
    };
  };
  type: "set_transition";
}

/** SheetRequest */
export interface SheetRequest {
  /** Job Id */
  job_id?: string | null;
  /** Revision */
  revision?: number | null;
  /** Timestamps Ms */
  timestamps_ms?: number[] | null;
}

/** SourceInspection */
export interface SourceInspection {
  /** Asset Id */
  asset_id: string;
  /**
   * Count
   * Evenly spaced source samples. For a proposed cut use count=3: start, middle and near the end (100ms margin). Images return one sample.
   * @min 1
   * @max 24
   * @default 12
   */
  count?: number;
  /**
   * From Ms
   * @min 0
   * @default 0
   */
  from_ms?: number;
  /** Timestamps Ms */
  timestamps_ms?: number[] | null;
  /** To Ms */
  to_ms?: number | null;
}

/** SourceSheet */
export interface SourceSheet {
  /** Asset Id */
  asset_id: string;
  /** Checksum */
  checksum: string;
  /** Height */
  height: number;
  /** Timestamps Ms */
  timestamps_ms: number[];
  /** Url */
  url: string;
  /** Width */
  width: number;
}

/** time_ms is an ABSOLUTE timeline timestamp. Both pieces must be >=100 ms. Animated clips reject. Original ID remains on left; optional new_clip_id sets a stable right ID, otherwise generated; right source_in advances by (time_ms-start_ms)*speed; right incoming transition becomes cut. Boundary fades are removed and remaining fades clamped. Find new right ID by comparing returned project. Text/image source offsets also advance though unused by rendering. */
export interface SplitClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Optional stable ID for the new right-hand clip; generated when omitted. */
    new_clip_id?: string;
    /**
     * Integer milliseconds on the project timeline.
     * @min 0
     */
    time_ms: number;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "split_clip";
}

/** time_ms is an ABSOLUTE timeline timestamp. Both pieces must be >=100 ms. Animated clips reject. Original ID remains on left; optional new_clip_id sets a stable right ID, otherwise generated; right source_in advances by (time_ms-start_ms)*speed; right incoming transition becomes cut. Boundary fades are removed and remaining fades clamped. Find new right ID by comparing returned project. Text/image source offsets also advance though unused by rendering. */
export interface SplitClipStep {
  payload: {
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Optional stable ID for the new right-hand clip; generated when omitted. */
    new_clip_id?: string;
    /**
     * Integer milliseconds on the project timeline.
     * @min 0
     */
    time_ms: number;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "split_clip";
}

/** StartProduction */
export interface StartProduction {
  /** Request */
  request:
    | ({
        type: "generate_score";
      } & GenerateScoreInput)
    | ({
        type: "import_media";
      } & ImportMediaInput)
    | ({
        type: "import_steam_trailer";
      } & ImportSteamInput)
    | ({
        type: "install_transcriber";
      } & InstallTranscriberInput)
    | ({
        type: "install_voice_model";
      } & InstallVoiceModelInput)
    | ({
        type: "package_delivery";
      } & PackageDeliveryInput)
    | ({
        type: "prepare_narration";
      } & PrepareNarrationInput)
    | ({
        type: "transcribe";
      } & TranscribeInput)
    | ({
        type: "verify_render";
      } & VerifyRenderInput);
  /**
   * Request Key
   * Caller-chosen idempotency key. Same key and request returns the existing task, including failures. A changed payload under the same key conflicts; use a new key for an intentional retry.
   * @minLength 8
   * @maxLength 100
   */
  request_key: string;
}

/** StateSnapshot */
export interface StateSnapshot {
  /** Jobs */
  jobs: RenderJob[];
  /** Projects */
  projects: ProjectVersion[];
}

/** SteamCandidate */
export interface SteamCandidate {
  /** App Id */
  app_id: number;
  /** Name */
  name: string;
  /** Url */
  url: string;
}

/** SteamGame */
export interface SteamGame {
  /** Metadata Sha256 */
  metadata_sha256: string;
  /** App Id */
  app_id: number;
  /** Categories */
  categories: string[];
  /** Coming Soon */
  coming_soon: boolean;
  /** Description */
  description: string;
  /** Developers */
  developers: string[];
  /** Fetched At */
  fetched_at: string;
  /** Genres */
  genres: string[];
  /** Movies */
  movies: SteamMovie[];
  /** Name */
  name: string;
  /** Publishers */
  publishers: string[];
  /** Release Date */
  release_date: string;
  /** Url */
  url: string;
}

/** SteamGames */
export interface SteamGames {
  /**
   * App Ids
   * @maxItems 10
   * @minItems 1
   */
  app_ids: number[];
}

/** SteamMovie */
export interface SteamMovie {
  /** Mp4 Url */
  mp4_url: string | null;
  /** Hls Url */
  hls_url: string | null;
  /** Id */
  id: number;
  /** Name */
  name: string;
  /** Thumbnail */
  thumbnail: string | null;
}

/** SteamSearch */
export interface SteamSearch {
  /**
   * Count
   * @min 1
   * @max 20
   * @default 10
   */
  count?: number;
  /**
   * Query
   * @maxLength 150
   * @default "horror"
   */
  query?: string;
  /**
   * Start
   * @min 0
   * @max 1000
   * @default 0
   */
  start?: number;
}

/** SteamSearchResult */
export interface SteamSearchResult {
  /** Candidates */
  candidates: SteamCandidate[];
  /** Fetched At */
  fetched_at: string;
  /** Next Start */
  next_start: number;
  /** Note */
  note: string;
  /** Source */
  source: string;
  /** Total Count */
  total_count: number | null;
}

/** TextLayerRequest */
export interface TextLayerRequest {
  clip: ClipInput;
  profile: OutputProfileInput;
}

/** Track */
export interface TrackInput {
  /**
   * Clips
   * @maxItems 500
   */
  clips?: ClipInput[];
  /**
   * Ducking
   * @default false
   */
  ducking?: boolean;
  /**
   * Gain Db
   * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
   * @min -60
   * @max 12
   * @default 0
   */
  gain_db?: number;
  /** Id */
  id?: string;
  /** Kind */
  kind:
    | "video"
    | "overlay"
    | "text"
    | "voiceover"
    | "music"
    | "sound"
    | "ambient";
  /**
   * Muted
   * @default false
   */
  muted?: boolean;
  /** Name */
  name: string;
}

/** Track */
export interface TrackOutput {
  /**
   * Clips
   * @maxItems 500
   */
  clips: ClipOutput[];
  /**
   * Ducking
   * @default false
   */
  ducking: boolean;
  /**
   * Gain Db
   * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
   * @min -60
   * @max 12
   * @default 0
   */
  gain_db: number;
  /** Id */
  id: string;
  /** Kind */
  kind:
    | "video"
    | "overlay"
    | "text"
    | "voiceover"
    | "music"
    | "sound"
    | "ambient";
  /**
   * Muted
   * @default false
   */
  muted: boolean;
  /** Name */
  name: string;
}

/** Transcribe */
export interface TranscribeInput {
  /** Asset Id */
  asset_id?: string | null;
  /** Job Id */
  job_id?: string | null;
  /**
   * Language
   * @default "en"
   */
  language?:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi";
  /**
   * Model
   * @default "tiny.en"
   */
  model?: "tiny.en" | "tiny";
  /**
   * Reference Text
   * Optional authored text for alignment/comparison AFTER independent ASR. Never passed as a recognition prompt.
   */
  reference_text?: string | null;
  /**
   * Type
   * @default "transcribe"
   */
  type?: "transcribe";
}

/** Transcribe */
export interface TranscribeOutput {
  /** Asset Id */
  asset_id: string | null;
  /** Job Id */
  job_id: string | null;
  /**
   * Language
   * @default "en"
   */
  language:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi";
  /**
   * Model
   * @default "tiny.en"
   */
  model: "tiny.en" | "tiny";
  /**
   * Reference Text
   * Optional authored text for alignment/comparison AFTER independent ASR. Never passed as a recognition prompt.
   */
  reference_text: string | null;
  /**
   * Type
   * @default "transcribe"
   */
  type: "transcribe";
}

/** TranscriberStatus */
export interface TranscriberStatus {
  /** English Only */
  english_only: boolean;
  install_task: InstallTranscriberOutput;
  /** Installed */
  installed: boolean;
  /** License */
  license: string;
  /** Model */
  model: string;
  /** Repository */
  repository: string;
  /** Revision */
  revision: string;
  /** Runtime Available */
  runtime_available: boolean;
}

/** Transcript */
export interface Transcript {
  /** Aligned Words */
  aligned_words: WordTiming[];
  /** Language */
  language: string;
  /** Match Ratio */
  match_ratio: number | null;
  /** Model */
  model: string;
  /** Model Revision */
  model_revision: string;
  /** Reference Text */
  reference_text: string | null;
  /** Speech End Ms */
  speech_end_ms: number;
  /** Text */
  text: string;
  /** Warnings */
  warnings: string[];
  /** Words */
  words: WordTiming[];
}

/** Transform */
export interface TransformInput {
  /**
   * Fit
   * @default "cover"
   */
  fit?: "cover" | "contain";
  /**
   * Opacity
   * @min 0
   * @max 1
   * @default 1
   */
  opacity?: number;
  /**
   * Rotation
   * @min -180
   * @max 180
   * @default 0
   */
  rotation?: number;
  /**
   * Scale
   * @min 1
   * @max 4
   * @default 1
   */
  scale?: number;
  /**
   * X
   * @min 0
   * @max 1
   * @default 0.5
   */
  x?: number;
  /**
   * Y
   * @min 0
   * @max 1
   * @default 0.5
   */
  y?: number;
}

/** Transform */
export interface TransformOutput {
  /**
   * Fit
   * @default "cover"
   */
  fit: "cover" | "contain";
  /**
   * Opacity
   * @min 0
   * @max 1
   * @default 1
   */
  opacity: number;
  /**
   * Rotation
   * @min -180
   * @max 180
   * @default 0
   */
  rotation: number;
  /**
   * Scale
   * @min 1
   * @max 4
   * @default 1
   */
  scale: number;
  /**
   * X
   * @min 0
   * @max 1
   * @default 0.5
   */
  x: number;
  /**
   * Y
   * @min 0
   * @max 1
   * @default 0.5
   */
  y: number;
}

/** Transition */
export interface TransitionInput {
  /**
   * Duration Ms
   * @min 0
   * @max 2000
   * @default 300
   */
  duration_ms?: number;
  /**
   * Type
   * @default "cut"
   */
  type?:
    | "cut"
    | "crossfade"
    | "fade_black"
    | "slide"
    | "wipe"
    | "zoom"
    | "blur";
}

/** Transition */
export interface TransitionOutput {
  /**
   * Duration Ms
   * @min 0
   * @max 2000
   * @default 300
   */
  duration_ms: number;
  /**
   * Type
   * @default "cut"
   */
  type: "cut" | "crossfade" | "fade_black" | "slide" | "wipe" | "zoom" | "blur";
}

/** Apply changes with timing validation. Provide resulting start_ms, duration_ms and source_in_ms yourself; there is no side/delta parameter. Retains incoming transition when start is unchanged; changing start clears it. Always clears next chronological clip's incoming transition. Supply retimed animations and bounded fades yourself; API does NOT reproduce UI trim calculations. No ripple or linked audio movement. */
export interface TrimClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    changes: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * @min 100
       * @max 86400000
       * @default 4000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Start Ms
       * Absolute start on project timeline, in integer milliseconds.
       * @min 0
       * @max 86400000
       * @default 0
       */
      start_ms?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "trim_clip";
}

/** Apply changes with timing validation. Provide resulting start_ms, duration_ms and source_in_ms yourself; there is no side/delta parameter. Retains incoming transition when start is unchanged; changing start clears it. Always clears next chronological clip's incoming transition. Supply retimed animations and bounded fades yourself; API does NOT reproduce UI trim calculations. No ripple or linked audio movement. */
export interface TrimClipStep {
  payload: {
    changes: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * @min 100
       * @max 86400000
       * @default 4000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Start Ms
       * Absolute start on project timeline, in integer milliseconds.
       * @min 0
       * @max 86400000
       * @default 0
       */
      start_ms?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "trim_clip";
}

/** Shallow replacement of supplied clip fields except immutable id. effects/animations replace entire arrays; transform/transition are rebuilt with model defaults for omitted properties. Read-modify-write complete nested values. Does not retime animations, adjust source bounds, ripple, or snap. All edits validate the final timeline and reject new overlaps on every track kind, including muted tracks. Use dedicated move/trim/transition operations for their side effects. */
export interface UpdateClipOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    changes: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * @min 100
       * @max 86400000
       * @default 4000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Start Ms
       * Absolute start on project timeline, in integer milliseconds.
       * @min 0
       * @max 86400000
       * @default 0
       */
      start_ms?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "update_clip";
}

/** Shallow replacement of supplied clip fields except immutable id. effects/animations replace entire arrays; transform/transition are rebuilt with model defaults for omitted properties. Read-modify-write complete nested values. Does not retime animations, adjust source bounds, ripple, or snap. All edits validate the final timeline and reject new overlaps on every track kind, including muted tracks. Use dedicated move/trim/transition operations for their side effects. */
export interface UpdateClipStep {
  payload: {
    changes: {
      /**
       * Animations
       * @maxItems 5
       */
      animations?: EditAnimation[];
      /**
       * Asset Id
       * @default null
       */
      asset_id?: string | null;
      /**
       * Caption Style
       * @default "editorial"
       */
      caption_style?: "editorial" | "bold" | "boxed" | "minimal";
      /**
       * Color
       * @default "#d8fb76"
       * @pattern ^#[0-9a-fA-F]{6}$
       */
      color?: string;
      /**
       * Duration Ms
       * @min 100
       * @max 86400000
       * @default 4000
       */
      duration_ms?: number;
      /**
       * Effects
       * @maxItems 16
       */
      effects?: EditEffect[];
      /**
       * Fade In Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_in_ms?: number;
      /**
       * Fade Out Ms
       * @min 0
       * @max 10000
       * @default 0
       */
      fade_out_ms?: number;
      /**
       * Font Size
       * @min 16
       * @max 200
       * @default 80
       */
      font_size?: number;
      /**
       * Gain Db
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /**
       * Name
       * @maxLength 300
       * @default "Untitled clip"
       */
      name?: string;
      /** Canvas rectangle. Center and dimensions are fractions of the output frame, independent of crop anchors. */
      placement?: EditPlacement;
      /**
       * Shape
       * Assetless graphic on an overlay track; uses placement and color. Only opacity animation is supported.
       * @default null
       */
      shape?: "rectangle" | "ellipse" | "line" | null;
      /**
       * Source In Ms
       * Source-file offset in milliseconds. Source consumed = duration_ms * speed; video audio requires a separate audio-track clip.
       * @min 0
       * @default 0
       */
      source_in_ms?: number;
      /**
       * Speed
       * @min 0.25
       * @max 4
       * @default 1
       */
      speed?: number;
      /**
       * Start Ms
       * Absolute start on project timeline, in integer milliseconds.
       * @min 0
       * @max 86400000
       * @default 0
       */
      start_ms?: number;
      /**
       * Subtitle
       * @maxLength 2000
       * @default ""
       */
      subtitle?: string;
      /**
       * Text
       * @maxLength 2000
       * @default ""
       */
      text?: string;
      /**
       * Text X
       * Left edge of caption block as fraction of output width.
       * @min 0
       * @max 0.9
       * @default 0.09
       */
      text_x?: number;
      /**
       * Text Y
       * @min 0.1
       * @max 0.85
       * @default 0.66
       */
      text_y?: number;
      transform?: EditTransform;
      transition?: EditTransition;
    };
    /** Existing ID returned by this server; never guess. */
    clip_id: string;
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "update_clip";
}

/** Shallow replacement of supplied project fields. profile/scenes/script_lines/asset_ids replace their entire values; omitted nested model fields reset to defaults. script_lines synchronize script to newline-joined text; a changed script-only edit clears line audio associations. Line audio must reference an existing, probed audio asset. IDs and revision cannot be changed. Scenes and script lines are planning metadata, not executable clips. */
export interface UpdateProjectOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    /** Asset Ids */
    asset_ids?: string[];
    /**
     * Brief
     * @maxLength 20000
     * @default ""
     */
    brief?: string;
    /**
     * Channel Id
     * Optional local editorial channel ID. Null means independent. Link/unlink via update_project with expected_revision; no media or timeline changes.
     * @default null
     */
    channel_id?: string | null;
    /**
     * Name
     * @minLength 1
     * @maxLength 200
     */
    name?: string;
    profile?: EditOutputProfile;
    /**
     * Scenes
     * @maxItems 500
     */
    scenes?: EditScene[];
    /**
     * Script
     * @maxLength 100000
     * @default ""
     */
    script?: string;
    /**
     * Script Lines
     * Ordered narration lines and optional audio takes. Empty for legacy plain-text scripts. When supplied to update_project, replaces the list and synchronizes script with newline-joined text. A changed script-only edit clears these associations. Does not alter scenes or timeline clips.
     * @maxItems 500
     */
    script_lines?: EditScriptLine[];
  };
  type: "update_project";
}

/** Shallow replacement of supplied project fields. profile/scenes/script_lines/asset_ids replace their entire values; omitted nested model fields reset to defaults. script_lines synchronize script to newline-joined text; a changed script-only edit clears line audio associations. Line audio must reference an existing, probed audio asset. IDs and revision cannot be changed. Scenes and script lines are planning metadata, not executable clips. */
export interface UpdateProjectStep {
  payload: {
    /** Asset Ids */
    asset_ids?: string[];
    /**
     * Brief
     * @maxLength 20000
     * @default ""
     */
    brief?: string;
    /**
     * Channel Id
     * Optional local editorial channel ID. Null means independent. Link/unlink via update_project with expected_revision; no media or timeline changes.
     * @default null
     */
    channel_id?: string | null;
    /**
     * Name
     * @minLength 1
     * @maxLength 200
     */
    name?: string;
    profile?: EditOutputProfile;
    /**
     * Scenes
     * @maxItems 500
     */
    scenes?: EditScene[];
    /**
     * Script
     * @maxLength 100000
     * @default ""
     */
    script?: string;
    /**
     * Script Lines
     * Ordered narration lines and optional audio takes. Empty for legacy plain-text scripts. When supplied to update_project, replaces the list and synchronizes script with newline-joined text. A changed script-only edit clears these associations. Does not alter scenes or timeline clips.
     * @maxItems 500
     */
    script_lines?: EditScriptLine[];
  };
  type: "update_project";
}

/** Change name, muted, ducking or gain_db. muted hides visual/text tracks or silences audio; does not change stored project duration. gain_db (-60..12 decibels, default 0) adds to clip gain/automation on audio tracks before fades/mixing; ignored on visual tracks. ducking acts on this audio track underneath voiceover tracks. */
export interface UpdateTrackOperation {
  /**
   * Last confirmed server revision. Serialize writes; conflicts reject atomically.
   * @min 1
   */
  expected_revision: number;
  payload: {
    changes: {
      /**
       * Ducking
       * @default false
       */
      ducking?: boolean;
      /**
       * Gain Db
       * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /**
       * Muted
       * @default false
       */
      muted?: boolean;
      /** Name */
      name?: string;
    };
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "update_track";
}

/** Change name, muted, ducking or gain_db. muted hides visual/text tracks or silences audio; does not change stored project duration. gain_db (-60..12 decibels, default 0) adds to clip gain/automation on audio tracks before fades/mixing; ignored on visual tracks. ducking acts on this audio track underneath voiceover tracks. */
export interface UpdateTrackStep {
  payload: {
    changes: {
      /**
       * Ducking
       * @default false
       */
      ducking?: boolean;
      /**
       * Gain Db
       * Audio track gain in decibels, added to clip gain/automation before fades and mixing. Ignored on visual tracks.
       * @min -60
       * @max 12
       * @default 0
       */
      gain_db?: number;
      /**
       * Muted
       * @default false
       */
      muted?: boolean;
      /** Name */
      name?: string;
    };
    /** Existing ID returned by this server; never guess. */
    track_id: string;
  };
  type: "update_track";
}

/** ValidationIssue */
export interface ValidationIssue {
  /** Ctx */
  ctx?: Record<string, JsonValue> | null;
  input?: JsonValue;
  /** Loc */
  loc: (string | number)[];
  /** Msg */
  msg: string;
  /** Type */
  type: string;
}

/** VerificationReport */
export interface VerificationReport {
  /** Sha256 */
  sha256: string;
  audio: AudioReport | null;
  /** Audio Pcm Hash */
  audio_pcm_hash: string | null;
  /**
   * Browser Playback Tested
   * @default false
   */
  browser_playback_tested: false;
  /** Decode Passed */
  decode_passed: boolean;
  /** From Ms */
  from_ms: number;
  /** Job Id */
  job_id: string;
  layout: LayoutReport;
  /** Layout Scope */
  layout_scope: string;
  /**
   * Metadata
   * Raw measured FFprobe format and streams; codec-specific fields vary.
   */
  metadata: Record<string, any>;
  /**
   * Passed
   * Automated checks only. A completed task can have passed=false; always inspect warnings and final images.
   */
  passed: boolean;
  /** Project Id */
  project_id: string;
  /**
   * Report Version
   * @default 1
   */
  report_version: 1;
  /** Revision */
  revision: number;
  /** To Ms */
  to_ms: number;
  transcript: Transcript | null;
  /**
   * Visual Review Required
   * @default true
   */
  visual_review_required: true;
}

/** VerifyRender */
export interface VerifyRenderInput {
  /** Job Id */
  job_id: string;
  /**
   * Language
   * @default "en"
   */
  language?:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi";
  /**
   * Model
   * @default "tiny.en"
   */
  model?: "tiny.en" | "tiny";
  /** Reference Text */
  reference_text?: string | null;
  /**
   * Transcribe
   * @default false
   */
  transcribe?: boolean;
  /**
   * Type
   * @default "verify_render"
   */
  type?: "verify_render";
}

/** VerifyRender */
export interface VerifyRenderOutput {
  /** Job Id */
  job_id: string;
  /**
   * Language
   * @default "en"
   */
  language:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi";
  /**
   * Model
   * @default "tiny.en"
   */
  model: "tiny.en" | "tiny";
  /** Reference Text */
  reference_text: string | null;
  /**
   * Transcribe
   * @default false
   */
  transcribe: boolean;
  /**
   * Type
   * @default "verify_render"
   */
  type: "verify_render";
}

/** VoiceChoice */
export interface VoiceChoice {
  /** Id */
  id: string;
  /** Name */
  name: string;
}

/** VoiceProvider */
export interface VoiceProvider {
  /**
   * Configured
   * Required runtime/model or credentials are present. Generation may still fail; inspect its result.
   */
  configured: boolean;
  /** Id */
  id: "supertonic" | "elevenlabs";
  /** Input Limit */
  input_limit: number;
  /**
   * Languages
   * Supertonic's explicit 31-code allowlist. Empty for ElevenLabs, whose model manages languages.
   */
  languages: VoiceChoice[];
  /** License Url */
  license_url: string;
  /**
   * Local
   * True means synthesis is offline on this server; installation downloads are separate.
   */
  local: boolean;
  /** Model Id */
  model_id: string;
  /** Name */
  name: string;
  /** Reason */
  reason: string | null;
  /** Upstream Archived */
  upstream_archived: boolean;
  /**
   * Voices
   * Local preset voices; empty for ElevenLabs, which requires a user's account voice ID.
   */
  voices: VoiceChoice[];
}

/** VoiceRequest */
export interface VoiceRequest {
  /**
   * Language
   * Required for Supertonic: exactly one supported ISO code. No auto/na fallback and no translation or language detection. Omit for ElevenLabs.
   */
  language?:
    | "en"
    | "ko"
    | "ja"
    | "ar"
    | "bg"
    | "cs"
    | "da"
    | "de"
    | "el"
    | "es"
    | "et"
    | "fi"
    | "fr"
    | "hi"
    | "hr"
    | "hu"
    | "id"
    | "it"
    | "lt"
    | "lv"
    | "nl"
    | "pl"
    | "pt"
    | "ro"
    | "ru"
    | "sk"
    | "sl"
    | "sv"
    | "tr"
    | "uk"
    | "vi"
    | null;
  /**
   * Model Id
   * Omit for the selected provider's default: supertonic-3 or eleven_multilingual_v2.
   */
  model_id?: string | null;
  /**
   * Project Id
   * Import into this project's private media; omit for shared Voiceovers. Never inserts timeline clips or changes revision.
   */
  project_id?: string | null;
  /**
   * Provider
   * Legacy default remains ElevenLabs. Choose supertonic explicitly for offline CPU synthesis.
   * @default "elevenlabs"
   */
  provider?: "elevenlabs" | "supertonic";
  /**
   * Speed
   * Speech speed multiplier. Supertonic: 0.7–2.0; ElevenLabs: 0.7–1.2.
   * @min 0.7
   * @max 2
   * @default 1
   */
  speed?: number;
  /**
   * Stability
   * ElevenLabs only. Leave at the default for Supertonic.
   * @min 0
   * @max 1
   * @default 0.5
   */
  stability?: number;
  /**
   * Steps
   * Supertonic inference steps; more steps cost CPU time. Leave at 8 for ElevenLabs.
   * @min 4
   * @max 16
   * @default 8
   */
  steps?: number;
  /**
   * Text
   * Text to speak, in the explicitly selected language. Supertonic limit: 1000 characters; ElevenLabs: 5000.
   * @minLength 1
   * @maxLength 5000
   */
  text: string;
  /**
   * Voice Id
   * Supertonic preset F1–F5 or M1–M5, or an ElevenLabs account voice ID.
   * @pattern ^[a-zA-Z0-9_-]{1,80}$
   */
  voice_id: string;
}

/** VoiceResult */
export interface VoiceResult {
  asset: Asset;
  /** Cached */
  cached: boolean;
}

/** VoiceStatus */
export interface VoiceStatus {
  /** Configured */
  configured: boolean;
  /** Default Provider */
  default_provider: "supertonic" | "elevenlabs";
  /** Import Supported */
  import_supported: boolean;
  /** Input Limit */
  input_limit: number;
  /** Provider */
  provider: string;
  /** Providers */
  providers: VoiceProvider[];
}

/** WaitRequest */
export interface WaitRequest {
  /**
   * Timeout Seconds
   * Bounded server-side wait for terminal state; returns current status on timeout, never claims completion.
   * @min 0
   * @max 25
   * @default 20
   */
  timeout_seconds?: number;
}

/** WordTiming */
export interface WordTiming {
  /** End Ms */
  end_ms: number;
  /**
   * Estimated
   * @default false
   */
  estimated: boolean;
  /** Probability */
  probability: number | null;
  /** Start Ms */
  start_ms: number;
  /** Word */
  word: string;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export type ContentType =
  | "application/json"
  | "application/vnd.api+json"
  | "multipart/form-data"
  | "application/x-www-form-urlencoded"
  | "text/plain";

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    ["application/json"]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    ["application/vnd.api+json"]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    ["text/plain"]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    ["multipart/form-data"]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    ["application/x-www-form-urlencoded"]: (input: any) =>
      this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<T> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || "application/json"];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== "multipart/form-data"
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data.data;
    });
  };
}

/**
 * @title Synkinema
 * @version 1.2.1
 *
 * Local FFmpeg editing API shared with MCP at /mcp/. Start with /api/agent/guide, /api/schema/project and /api/schema/operations. All timeline times are integer milliseconds. Serialize project writes using expected_revision; inspect actual renders before declaring completion.
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  api = {
    /**
     * @description Read one existing asset by ID with media metadata, has_audio/duration, source/license, tags and relative URLs. Does not decode media. Unknown ID: 404.
     *
     * @tags Composition
     * @name Asset
     * @summary Asset
     * @request GET:/api/assets/{asset_id}
     * @secure
     */
    asset: (assetId: string, params: RequestParams = {}) =>
      this.request<Asset, ApiError>({
        path: `/api/assets/${assetId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description List named media folders. Omit project_id for the shared library; use a project ID for its private collection.
     *
     * @tags Composition
     * @name AssetFolders
     * @summary Asset Folders
     * @request GET:/api/asset-folders
     * @secure
     */
    assetFolders: (
      query?: {
        /** Project Id */
        project_id?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<AssetFolder[], ApiError>({
        path: `/api/asset-folders`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read the local owner's complete stored-media inventory, including shared, private and history-only sources. Does not share private files or modify memberships. Use /api/assets for collection-scoped results. Asset.version guards metadata edits/deletion; legacy assets start at 1. Includes file metadata, tags, source/license and locations.
     *
     * @tags Composition
     * @name AssetInventory
     * @summary Asset Inventory
     * @request GET:/api/media
     * @secure
     */
    assetInventory: (params: RequestParams = {}) =>
      this.request<Asset[], ApiError>({
        path: `/api/media`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read shared library by default, or private project media with project_id; optional folder_id filters that collection. Private project search includes referenced timeline assets. q is a case-insensitive substring of name/tags, kind is image/video/audio. Returns IDs, actual durations/dimensions/has_audio, URLs, tags, checksums and source/license. No pagination.
     *
     * @tags Composition
     * @name Assets
     * @summary Assets
     * @request GET:/api/assets
     * @secure
     */
    assets: (
      query?: {
        /** Folder Id */
        folder_id?: string | null;
        /** Kind */
        kind?: string | null;
        /** Project Id */
        project_id?: string | null;
        /**
         * Q
         * @default ""
         */
        q?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<Asset[], ApiError>({
        path: `/api/assets`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read current project, historical revision and render-snapshot references for one asset, with project names, revision numbers and job IDs. can_delete is true only when no such references exist; collection memberships alone do not block physical deletion. This is advisory: deletion rechecks usage and expected_version atomically. History references protect undo and cloned projects.
     *
     * @tags Composition
     * @name AssetUsage
     * @summary Asset Usage
     * @request GET:/api/assets/{asset_id}/usage
     * @secure
     */
    assetUsage: (assetId: string, params: RequestParams = {}) =>
      this.request<AssetUsage, ApiError>({
        path: `/api/assets/${assetId}/usage`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Measure actual audio. Prefer job_id of a completed job from this project; it determines revision, overriding a supplied revision. Otherwise inspect a full preview. Returns measured LUFS/true peak, RMS windows, EBU R128 samples, warnings, map_url/audio_url and server map_path. null loudness means silent/too short. Range-job windows are project-absolute; EBU sample times are output-relative. May be expensive; does not change mix settings.
     *
     * @tags Composition
     * @name Audio
     * @summary Audio
     * @request POST:/api/projects/{project_id}/inspection/audio
     * @secure
     */
    audio: (
      projectId: string,
      data: AudioRequest,
      params: RequestParams = {},
    ) =>
      this.request<AudioReport, ApiError>({
        path: `/api/projects/${projectId}/inspection/audio`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Apply 1-100 ordered {type,payload} operations with expected_revision in one transaction and one new revision. Final project/assets/timeline validation; any failure rolls back all edits. dry_run=true returns candidate at base_revision+1 but commits nothing; generated IDs provisional. Return {committed,base_revision,applied_operations,project}. Explicit IDs allow later steps to reference created clips. No imports or renders in batches.
     *
     * @tags Composition
     * @name Batch
     * @summary Batch
     * @request POST:/api/projects/{project_id}/operations/batch
     * @secure
     */
    batch: (
      projectId: string,
      data: BatchRequest,
      params: RequestParams = {},
    ) =>
      this.request<BatchResult, ApiError>({
        path: `/api/projects/${projectId}/operations/batch`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Atomically update 1–100 distinct asset_ids. action=add_tags merges supplied tags; remove_tags subtracts only those tags; locate requires destination={project_id?,folder_id?} and adds/moves membership in that scope. Does not replace unrelated tags or other locations. All IDs and final tag limits validate before committing. Missing ID is 404 and saves nothing. No project edits, file copies or physical deletion. Returns updated Asset list, with metadata versions.
     *
     * @tags Composition
     * @name BatchAssets
     * @summary Batch Assets
     * @request POST:/api/assets/batch
     * @secure
     */
    batchAssets: (data: AssetBatchUpdate, params: RequestParams = {}) =>
      this.request<Asset[], ApiError>({
        path: `/api/assets/batch`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Cancel queued/running render and stop its FFmpeg task. No request body. Returns resulting Job; does not undo project edits or delete completed output. Already terminal jobs stay terminal.
     *
     * @tags Composition
     * @name Cancel
     * @summary Cancel
     * @request POST:/api/jobs/{job_id}/cancel
     * @secure
     */
    cancel: (jobId: string, params: RequestParams = {}) =>
      this.request<RenderJob, ApiError>({
        path: `/api/jobs/${jobId}/cancel`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read implemented features, effect/property bounds, limits and discovery links. Combine with /api/schema/project and /api/schema/operations; capabilities are not arbitrary FFmpeg support.
     *
     * @tags Agent discovery
     * @name Capabilities
     * @summary Capabilities
     * @request GET:/api/capabilities
     * @secure
     */
    capabilities: (params: RequestParams = {}) =>
      this.request<Capabilities, ApiError>({
        path: `/api/capabilities`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read image/png: transparent text or shape clip layer at project width/height, using the same font, wrapping, safe-area placement and contrast background as final FFmpeg exports. Optional revision pins an immutable snapshot; X-Project-Revision identifies it. Does not apply time-dependent opacity or fades; multiply these during playback. Does not edit the project or render a video. Unknown project/revision/text clip: 404. Pinned responses use private immutable caching; unpinned responses revalidate.
     *
     * @tags Composition
     * @name CaptionLayer
     * @summary Caption Layer
     * @request GET:/api/projects/{project_id}/clips/{clip_id}/text-layer
     * @secure
     */
    captionLayer: (
      projectId: string,
      clipId: string,
      query?: {
        /** Revision */
        revision?: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<Blob, ApiError>({
        path: `/api/projects/${projectId}/clips/${clipId}/text-layer`,
        method: "GET",
        query: query,
        secure: true,
        format: "blob",
        ...params,
      }),

    /**
     * @description Measure all unmuted text clips at the exact project revision using the export rasterizer. Returns clipped/unclipped foreground boxes and temporal text collisions. Writes only cache. A clean result does not prove visual quality; title-card detection and semantic review still require viewing actual frames.
     *
     * @tags Composition
     * @name CaptionLayout
     * @summary Caption Layout
     * @request POST:/api/production/caption-layout
     * @secure
     */
    captionLayout: (data: LayoutRequest, params: RequestParams = {}) =>
      this.request<LayoutReport, ApiError>({
        path: `/api/production/caption-layout`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Download text/plain SRT from text clips at current or pinned revision query, sorted by start. Contains headline plus subtitle. Muted tracks excluded unless include_muted=true. No transcription. X-Project-Revision identifies snapshot.
     *
     * @tags Composition
     * @name Captions
     * @summary Captions
     * @request GET:/api/projects/{project_id}/captions.srt
     * @secure
     */
    captions: (
      projectId: string,
      query?: {
        /**
         * Include Muted
         * @default false
         */
        include_muted?: boolean;
        /** Revision */
        revision?: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<string, ApiError>({
        path: `/api/projects/${projectId}/captions.srt`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * @description Read pending disk cleanup count from the durable deletion outbox. No filesystem mutation. deleted_files/freed_bytes are zero on this status endpoint. Nonzero pending_files remains visible until unlink succeeds; worker retries every 10 seconds and on restart.
     *
     * @tags Composition
     * @name CleanupStatus
     * @summary Cleanup Status
     * @request GET:/api/storage/cleanup
     * @secure
     */
    cleanupStatus: (params: RequestParams = {}) =>
      this.request<CleanupResult, ApiError>({
        path: `/api/storage/cleanup`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Permanently delete selected job_ids, or clear an entire queue with status=finished (default) or all (also cancels running/queued work). Optional project_id scopes all operations. All matching database rows are included, beyond the 100-job display limit. Exact selection is validated before cancellation; missing/wrong-scope IDs return 404. MP4/partial/mix and inspection artifacts are physically removed. Cleanup intent commits atomically with metadata deletion; pending_files reports disk failures, retried every 10 seconds/restart. Concurrent newly queued work after selection is retained. No undo.
     *
     * @tags Composition
     * @name ClearJobs
     * @summary Clear Jobs
     * @request POST:/api/jobs/clear
     * @secure
     */
    clearJobs: (data: DeleteJobsRequest, params: RequestParams = {}) =>
      this.request<DeletionResult, ApiError>({
        path: `/api/jobs/clear`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Create an independent project from required {name,revision} source snapshot. New project ID/revision 1, track/clip IDs retained within project, assets shared. No jobs/comments/history copied; source unchanged. Repeating creates another copy.
     *
     * @tags Composition
     * @name Clone
     * @summary Clone
     * @request POST:/api/projects/{project_id}/clone
     * @secure
     */
    clone: (
      projectId: string,
      data: CloneRequest,
      params: RequestParams = {},
    ) =>
      this.request<ProjectSnapshot, ApiError>({
        path: `/api/projects/${projectId}/clone`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Create a review note pinned to revision and absolute time_ms (0..duration inclusive). Nonblank message <=5000 characters. Repeating duplicates the note; no project revision change. Returns comment with id and resolved=false.
     *
     * @tags Composition
     * @name Comment
     * @summary Comment
     * @request POST:/api/projects/{project_id}/comments
     * @secure
     */
    comment: (
      projectId: string,
      data: CommentRequest,
      params: RequestParams = {},
    ) =>
      this.request<ReviewComment, ApiError>({
        path: `/api/projects/${projectId}/comments`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Read all project review comments including pinned revision/time_ms, message and resolved. Comments can refer to old snapshots. No project revision change.
     *
     * @tags Composition
     * @name Comments
     * @summary Comments
     * @request GET:/api/projects/{project_id}/comments
     * @secure
     */
    comments: (projectId: string, params: RequestParams = {}) =>
      this.request<ReviewComment[], ApiError>({
        path: `/api/projects/${projectId}/comments`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Create a project from a full or partial Project body (name required; other fields have defaults). Generates a new project id and revision 1, returns complete Project and duration_ms. Does not render or synthesize narration. Repeating creates another project. New clips cannot overlap on a single track of any kind; explicit primary-video transitions are the exception (422 on invalid layout).
     *
     * @tags Composition
     * @name Create
     * @summary Create
     * @request POST:/api/projects
     * @secure
     */
    create: (data: Project, params: RequestParams = {}) =>
      this.request<ProjectSnapshot, ApiError>({
        path: `/api/projects`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Create a named folder in the library or one project. Case-insensitive duplicate names in the same collection are rejected.
     *
     * @tags Composition
     * @name CreateAssetFolder
     * @summary Create Asset Folder
     * @request POST:/api/asset-folders
     * @secure
     */
    createAssetFolder: (data: FolderRequest, params: RequestParams = {}) =>
      this.request<AssetFolder, ApiError>({
        path: `/api/asset-folders`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Create a local editorial channel at version 1. Repeated calls create duplicates. Does not connect accounts or publish.
     *
     * @tags Composition
     * @name CreateChannel
     * @summary Create Channel
     * @request POST:/api/channels
     * @secure
     */
    createChannel: (data: ChannelInput, params: RequestParams = {}) =>
      this.request<Channel, ApiError>({
        path: `/api/channels`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Delete one named folder and move its assets to that collection's root atomically. Keeps all files, other memberships, tags and timeline references. Returns folder_id, project_id (null for shared library) and changed assets with updated versions. Missing folder is 404. This removes organization only, never the contained media.
     *
     * @tags Composition
     * @name DeleteAssetFolder
     * @summary Delete Asset Folder
     * @request DELETE:/api/asset-folders/{folder_id}
     * @secure
     */
    deleteAssetFolder: (folderId: string, params: RequestParams = {}) =>
      this.request<FolderDeletion, ApiError>({
        path: `/api/asset-folders/${folderId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Permanently delete an atomic selection {assets:[{id,expected_version}]} (1–100 distinct IDs). Rechecks ALL current projects, history and render snapshots under the SQLite transaction; any usage, version conflict or missing ID rejects the entire selection. Memberships alone do not block deletion. Removes original bytes and thumbnails from all collections with durable cleanup intent. Returns deleted asset_ids, freed_bytes and pending_files; nonzero pending means disk cleanup remains incomplete and retries automatically/on restart. No force mode or undo. Use remove_asset_location to unshare used files instead.
     *
     * @tags Composition
     * @name DeleteAssets
     * @summary Delete Assets
     * @request POST:/api/assets/delete
     * @secure
     */
    deleteAssets: (data: DeleteAssetsRequest, params: RequestParams = {}) =>
      this.request<DeletionResult, ApiError>({
        path: `/api/assets/delete`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Permanently delete one export and its MP4/partial/mix files. Cancels active FFmpeg and waits for shutdown first. Invalidates this project's inspection artifacts (retained jobs can regenerate them). Returns deleted IDs, freed_bytes and pending_files. Missing job: 404. Never deletes source assets or project edits; no undo.
     *
     * @tags Composition
     * @name DeleteJob
     * @summary Delete Job
     * @request DELETE:/api/jobs/{job_id}
     * @secure
     */
    deleteJob: (jobId: string, params: RequestParams = {}) =>
      this.request<DeletionResult, ApiError>({
        path: `/api/jobs/${jobId}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Permanently delete a project at expected_revision, ALL revisions/comments/jobs/private folders and exclusively owned private media files, plus renders and project inspection/unused current-version render caches. Shared library assets and sources referenced by other projects' historical revisions/jobs are retained. Active renders stop first; stale revision returns 409 (jobs may have been cancelled if another client edited during shutdown). Returns deleted IDs and actual disk cleanup totals. Nonzero pending_files means committed deletion with deferred disk cleanup; inspect/retry storage cleanup. No undo.
     *
     * @tags Composition
     * @name DeleteProject
     * @summary Delete Project
     * @request DELETE:/api/projects/{project_id}
     * @secure
     */
    deleteProject: (
      projectId: string,
      data: DeleteProjectRequest,
      params: RequestParams = {},
    ) =>
      this.request<DeletionResult, ApiError>({
        path: `/api/projects/${projectId}`,
        method: "DELETE",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description SSE stream: data objects contain projects [{id,revision}] and jobs. Heartbeat comments when unchanged, checked about once per second. This is invalidation/progress information, not a replayable edit log; reconnect and refetch project snapshots.
     *
     * @tags Composition
     * @name Events
     * @summary Events
     * @request GET:/api/events
     * @secure
     */
    events: (params: RequestParams = {}) =>
      this.request<string, ApiError>({
        path: `/api/events`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * @description Read the shared output catalog: landscape 16:9, Reel/Short 9:16, square 1:1 and feed 4:5 in HD, Full HD, QHD (1440p, marketed as 2K; not DCI 2048), and UHD 4K tiers. Explicit pixel dimensions are authoritative. Also returns CRF quality choices, frame rates and draft cap. No writes.
     *
     * @tags Composition
     * @name ExportPresets
     * @summary Export Presets
     * @request GET:/api/export-presets
     * @secure
     */
    exportPresets: (params: RequestParams = {}) =>
      this.request<ExportCatalog, ApiError>({
        path: `/api/export-presets`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Synchronously inspect one actual FFmpeg frame. JSON body time_ms is absolute and must be < duration_ms; pin revision for reproducibility. Optional job_id selects the exact completed export and determines revision, including range jobs. Times stay project-absolute inside [from_ms,to_ms); metadata includes job_id/from_ms/to_ms/output_time_ms. Invalid jobs or missing files fail without fallback. Returns revision/time_ms/url and server-local path. May render a full cached preview and take time; does not queue a Job. Fetch url to inspect pixels; path is not a client-local file.
     *
     * @tags Composition
     * @name Frame
     * @summary Frame
     * @request POST:/api/projects/{project_id}/inspection/frame
     * @secure
     */
    frame: (
      projectId: string,
      data: FrameRequest,
      params: RequestParams = {},
    ) =>
      this.request<InspectionFrame, ApiError>({
        path: `/api/projects/${projectId}/inspection/frame`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Generate speech, not text. Returns {asset,cached} after real audio import. Choose provider=supertonic, voice_id=F1..F5/M1..M5, language=<one of 31 supported ISO codes>, optional steps=4..16 and speed=0.7..2.0; limit 1000 chars. Supertonic runs offline using an explicitly installed pinned model; no na/auto fallback, language detection or translation. Its output must be identified as AI-generated under OpenRAIL-M. Legacy/default provider=elevenlabs requires a real account voice_id and server key, sends text externally and may consume paid credits; authorize that separately. Pass project_id for private media; omit for shared Voiceovers. Never inserts a clip or increments project revision. Duplicate requests reuse existing output in that media scope; language, voice, speed, steps and pinned model revision separate cache entries. Inspect asset duration and add_clip on a voiceover track afterwards.
     *
     * @tags Composition
     * @name GenerateVoice
     * @summary Generate Voice
     * @request POST:/api/voices/generate
     * @secure
     */
    generateVoice: (data: VoiceRequest, params: RequestParams = {}) =>
      this.request<VoiceResult, ApiError>({
        path: `/api/voices/generate`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Read channel rules, linked projects, manually recorded publications/metrics and subjective editorial reviews. No analytics synchronization.
     *
     * @tags Composition
     * @name GetChannel
     * @summary Get Channel
     * @request GET:/api/channels/{channel_id}
     * @secure
     */
    getChannel: (channelId: string, params: RequestParams = {}) =>
      this.request<ChannelDetail, ApiError>({
        path: `/api/channels/${channelId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read readiness metadata: version and whether ffmpeg/ffprobe executables are available. Does not perform a render. Exempt from optional bearer authentication.
     *
     * @tags Composition
     * @name Health
     * @summary Health
     * @request GET:/api/health
     * @secure
     */
    health: (params: RequestParams = {}) =>
      this.request<Health, ApiError>({
        path: `/api/health`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read revision/operation/created_at records newest first. Use GET project?revision=R for content. restore_revision creates a new current revision; it does not delete history.
     *
     * @tags Composition
     * @name History
     * @summary History
     * @request GET:/api/projects/{project_id}/history
     * @secure
     */
    history: (projectId: string, params: RequestParams = {}) =>
      this.request<Revision[], ApiError>({
        path: `/api/projects/${projectId}/history`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read one persisted Job. progress is 0..1. Poll about every 1-2 seconds with backoff until completed/failed/cancelled; inspect error on failure. Resolve relative output_url against server origin only after completed. No project mutation.
     *
     * @tags Composition
     * @name Job
     * @summary Job
     * @request GET:/api/jobs/{job_id}
     * @secure
     */
    job: (jobId: string, params: RequestParams = {}) =>
      this.request<RenderJob, ApiError>({
        path: `/api/jobs/${jobId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read at most the latest 100 jobs, optionally filtered by project_id BEFORE that limit. Each includes revision/status/progress/phase/error/output_url. Keep job_id to retrieve older jobs directly.
     *
     * @tags Composition
     * @name Jobs
     * @summary Jobs
     * @request GET:/api/jobs
     * @secure
     */
    jobs: (
      query?: {
        /** Project Id */
        project_id?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<RenderJob[], ApiError>({
        path: `/api/jobs`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description List local editorial channels, including archived ones. No external platform calls.
     *
     * @tags Composition
     * @name ListChannels
     * @summary List Channels
     * @request GET:/api/channels
     * @secure
     */
    listChannels: (params: RequestParams = {}) =>
      this.request<Channel[], ApiError>({
        path: `/api/channels`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Add or move an asset to a folder in a collection. Null project_id means shared library; null folder_id means root. Other collections and timeline references stay unchanged. No binary copies or project revision changes.
     *
     * @tags Composition
     * @name LocateAsset
     * @summary Locate Asset
     * @request PUT:/api/assets/{asset_id}/location
     * @secure
     */
    locateAsset: (
      assetId: string,
      data: AssetLocation,
      params: RequestParams = {},
    ) =>
      this.request<Asset, ApiError>({
        path: `/api/assets/${assetId}/location`,
        method: "PUT",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Apply ONE atomic {expected_revision,type,payload} and return updated Project with incremented revision and duration_ms. See /api/schema/operations for all payload schemas and side effects. Serialize writes; on 409 reread and reconcile. Arrays/nested values are shallow replacements. Helper operations explicitly support append, duplicate and extract_audio; no UI snapping or automatic keyframe retiming. Final validation rejects new/retimed ordinary overlaps on every track, even muted (422); no automatic new track or time shifting. Existing legacy overlap pairs may keep identical timing during unrelated edits; preflight reports legacy_lane_overlap. Missing IDs: 404; invalid values/timeline: 422.
     *
     * @tags Composition
     * @name Operation
     * @summary Operation
     * @request POST:/api/projects/{project_id}/operations
     * @secure
     */
    operation: (
      projectId: string,
      data: Operation,
      params: RequestParams = {},
    ) =>
      this.request<ProjectSnapshot, ApiError>({
        path: `/api/projects/${projectId}/operations`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Read descriptions, standalone payload JSON Schemas and examples for every editing operation; optional operation query selects one. IDs in examples are placeholders. Unknown operation: 422.
     *
     * @tags Agent discovery
     * @name OperationSchema
     * @summary Operation Schema
     * @request GET:/api/schema/operations
     * @secure
     */
    operationSchema: (
      query?: {
        /** Operation */
        operation?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<Record<string, any>, ApiError>({
        path: `/api/schema/operations`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read-only export preflight for CURRENT project: POST RenderRequest with expected_revision and optional output {width,height,fps,crf,fit,background,x,y}. Returns resolved encoded settings, intermediate canvas size and source-upscale/crop warnings; does not decode or render. 409 on revision conflict. Cache by project ID, revision and entire request. Fit contain preserves the entire composition with bars; cover crops all layers including captions. FPS increases duplicate frames; no interpolation or AI upscaling. This is geometry guidance, not proof of visual quality.
     *
     * @tags Composition
     * @name PlanExport
     * @summary Plan Export
     * @request POST:/api/projects/{project_id}/export-plan
     * @secure
     */
    planExport: (
      projectId: string,
      data: RenderRequestInput,
      params: RequestParams = {},
    ) =>
      this.request<ExportPlan, ApiError>({
        path: `/api/projects/${projectId}/export-plan`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Read suggested timestamps for current or pinned revision query: video/text clip and transition midpoints, capped at 24. Not scene metadata or exhaustive overlay coverage.
     *
     * @tags Composition
     * @name Points
     * @summary Points
     * @request GET:/api/projects/{project_id}/inspection/points
     * @secure
     */
    points: (
      projectId: string,
      query?: {
        /** Revision */
        revision?: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<InspectionPoints, ApiError>({
        path: `/api/projects/${projectId}/inspection/points`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read cheap structural diagnostics for current/pinned revision: valid, errors/warnings with codes and context IDs/times, counts. Checks source files/references/bounds and primary timeline, warns about gaps/silence/muted tails and legacy_lane_overlap for preserved ordinary overlaps on audio/text/overlay tracks. New or retimed overlaps are rejected by all edit endpoints. Does not render/decode or guarantee final quality. Missing project/revision: 404; invalid project report: 200 with valid=false.
     *
     * @tags Composition
     * @name Preflight
     * @summary Preflight
     * @request GET:/api/projects/{project_id}/preflight
     * @secure
     */
    preflight: (
      projectId: string,
      query?: {
        /** Revision */
        revision?: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<Preflight, ApiError>({
        path: `/api/projects/${projectId}/preflight`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Inspect a candidate caption, including unsaved optimistic edits. Returns one cached export-renderer PNG URL and its matching foreground bounds in output-profile pixels. Bounds include wrapping, font size, style, subtitle, stroke and vertical clamping; exclude the editorial contrast gradient. Null bounds mean no visible caption foreground. Cache by the complete clip and profile; bind bounds to the returned raster URL, never to a previous request. Creates only a reusable cache file, no project revision or render job. The raw PNG endpoint remains available.
     *
     * @tags Composition
     * @name PreviewCaption
     * @summary Preview Caption
     * @request POST:/api/preview/caption
     * @secure
     */
    previewCaption: (data: TextLayerRequest, params: RequestParams = {}) =>
      this.request<CaptionPreview, ApiError>({
        path: `/api/preview/caption`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Render a transparent PNG from a candidate clip and output profile, including unsaved optimistic edits. Uses the export renderer's cached typography; does not create a project, revision or render job. Cache by the complete request body.
     *
     * @tags Composition
     * @name PreviewTextLayer
     * @summary Preview Text Layer
     * @request POST:/api/preview/text-layer
     * @secure
     */
    previewTextLayer: (data: TextLayerRequest, params: RequestParams = {}) =>
      this.request<Blob, ApiError>({
        path: `/api/preview/text-layer`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "blob",
        ...params,
      }),

    /**
     * @description Request cancellation of a queued/running production task. Queued tasks stop immediately; active tasks stop their child process or finish the current noninterruptible speech call before confirming cancelled. Partial validated assets remain available in result; unimported temporary downloads are removed. Terminal tasks remain unchanged.
     *
     * @tags Composition
     * @name ProductionCancel
     * @summary Production Cancel
     * @request POST:/api/production/tasks/{task_id}/cancel
     * @secure
     */
    productionCancel: (taskId: string, params: RequestParams = {}) =>
      this.request<ProductionTask, ApiError>({
        path: `/api/production/tasks/${taskId}/cancel`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Discover production task types, local transcription runtime/model status, pinned downloadable models, portrait showcase template, input limits and workflow. No downloads or inference. Installed files do not guarantee successful recognition.
     *
     * @tags Composition
     * @name ProductionCapabilities
     * @summary Production Capabilities
     * @request GET:/api/production/capabilities
     * @secure
     */
    productionCapabilities: (params: RequestParams = {}) =>
      this.request<ProductionCapabilities, ApiError>({
        path: `/api/production/capabilities`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read one durable production task by exact ID. Terminal states completed/failed/cancelled. result includes only real imported assets, measured timings and completed artifacts. A cancellation request is not confirmation that work has stopped.
     *
     * @tags Composition
     * @name ProductionGet
     * @summary Production Get
     * @request GET:/api/production/tasks/{task_id}
     * @secure
     */
    productionGet: (taskId: string, params: RequestParams = {}) =>
      this.request<ProductionTask, ApiError>({
        path: `/api/production/tasks/${taskId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read the latest100 production tasks, separately from render jobs, including real progress, cancellation requests, errors and partial results. Use to reconnect without repeating imports or synthesis. A completed task does not imply its verification report passed.
     *
     * @tags Composition
     * @name ProductionList
     * @summary Production List
     * @request GET:/api/production/tasks
     * @secure
     */
    productionList: (params: RequestParams = {}) =>
      this.request<ProductionTask[], ApiError>({
        path: `/api/production/tasks`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Queue one typed production operation. request_key is required for idempotency: same key/payload returns the original task even after failure; changed payload under that key returns409. Returns queued state immediately. Partial validated assets survive cancellation/failure and are listed in result. Never updates the timeline. Discover supported types and wait for terminal state before consuming results.
     *
     * @tags Composition
     * @name ProductionStart
     * @summary Production Start
     * @request POST:/api/production/tasks
     * @secure
     */
    productionStart: (data: StartProduction, params: RequestParams = {}) =>
      this.request<ProductionTask, ApiError>({
        path: `/api/production/tasks`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Wait server-side up to25 seconds for a task to reach a terminal state; returns its current task on timeout. No busy client polling or fabricated completion. The task continues after a timeout/disconnect. Reuse the returned ID rather than enqueueing a duplicate.
     *
     * @tags Composition
     * @name ProductionWait
     * @summary Production Wait
     * @request POST:/api/production/tasks/{task_id}/wait
     * @secure
     */
    productionWait: (
      taskId: string,
      data: WaitRequest,
      params: RequestParams = {},
    ) =>
      this.request<ProductionTask, ApiError>({
        path: `/api/production/tasks/${taskId}/wait`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Read complete current Project, or immutable historical snapshot selected by revision query. Includes duration_ms. Does not restore that revision. Unknown project/revision: 404.
     *
     * @tags Composition
     * @name Project
     * @summary Project
     * @request GET:/api/projects/{project_id}
     * @secure
     */
    project: (
      projectId: string,
      query?: {
        /** Revision */
        revision?: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<ProjectSnapshot, ApiError>({
        path: `/api/projects/${projectId}`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read all persisted projects with tracks/clips, current revision and computed duration_ms. No pagination. Refresh an individual project before editing.
     *
     * @tags Composition
     * @name Projects
     * @summary Projects
     * @request GET:/api/projects
     * @secure
     */
    projects: (params: RequestParams = {}) =>
      this.request<ProjectSnapshot[], ApiError>({
        path: `/api/projects`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read full Project JSON Schema with nested models. Cross-field and property-dependent constraints are explained by capabilities and the agent guide.
     *
     * @tags Agent discovery
     * @name ProjectSchema
     * @summary Project Schema
     * @request GET:/api/schema/project
     * @secure
     */
    projectSchema: (params: RequestParams = {}) =>
      this.request<Record<string, any>, ApiError>({
        path: `/api/schema/project`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Read the packaged Markdown agent operating guide: start here before editing. Includes workflow, units, examples, revision conflicts, audio extraction, inspection and implementation limits.
     *
     * @tags Agent discovery
     * @name ReadAgentGuide
     * @summary Read Agent Guide
     * @request GET:/api/agent/guide
     * @secure
     */
    readAgentGuide: (params: RequestParams = {}) =>
      this.request<string, ApiError>({
        path: `/api/agent/guide`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * @description Append or update one manual publication record, guarded by expected_version. URL is metadata only; never fetched. Null metrics mean unknown. Does not publish, schedule or upload anything.
     *
     * @tags Composition
     * @name RecordChannelPublication
     * @summary Record Channel Publication
     * @request POST:/api/channels/{channel_id}/publications
     * @secure
     */
    recordChannelPublication: (
      channelId: string,
      data: PublicationWrite,
      params: RequestParams = {},
    ) =>
      this.request<ChannelDetail, ApiError>({
        path: `/api/channels/${channelId}/publications`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Append an evidence-backed subjective review for an existing revision of a linked project; increments channel version. Criteria 0–10 produce a mean score 0–100, NOT predicted virality. Does not run analysis or change editorial rules automatically.
     *
     * @tags Composition
     * @name RecordChannelReview
     * @summary Record Channel Review
     * @request POST:/api/channels/{channel_id}/reviews
     * @secure
     */
    recordChannelReview: (
      channelId: string,
      data: ChannelReviewWrite,
      params: RequestParams = {},
    ) =>
      this.request<ChannelDetail, ApiError>({
        path: `/api/channels/${channelId}/reviews`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Remove ONE membership with {project_id?,expected_version}; omit project_id for shared library. Retains bytes. Unsharing preserves private memberships for projects that reference the file, including history. Removing a project membership is blocked while its current timeline/asset_ids uses the file. Removing the last collection of an unused file returns 409: use delete_assets instead to avoid orphaned bytes. Wrong version returns 409. Removing an absent membership leaves the asset unchanged.
     *
     * @tags Composition
     * @name RemoveAssetLocation
     * @summary Remove Asset Location
     * @request DELETE:/api/assets/{asset_id}/location
     * @secure
     */
    removeAssetLocation: (
      assetId: string,
      data: RemoveAssetLocation,
      params: RequestParams = {},
    ) =>
      this.request<Asset, ApiError>({
        path: `/api/assets/${assetId}/location`,
        method: "DELETE",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Remove a line's audio and its project media membership at {expected_revision,expected_version,audio_asset_id}. Atomically clears this line/take association from this project's current script, saved revisions and render snapshot script metadata; removes matching asset_ids inventory entries. Script text and timeline remain unchanged. The removed take cannot be restored through undo. Another line or any timeline in this project's current/history/render snapshots using this source blocks removal with 409. Other projects and shared library memberships retain the source; otherwise deletes original/sidecar files with durable cleanup. Returns the confirmed project, deleted asset_ids or retained_asset_id, and actual cleanup metrics. Stale project/asset versions or changed take reject without changes. pending_files means disk cleanup remains incomplete. Not a regular reversible edit operation or batch step.
     *
     * @tags Composition
     * @name RemoveScriptAudio
     * @summary Remove Script Audio
     * @request DELETE:/api/projects/{project_id}/script-lines/{line_id}/audio
     * @secure
     */
    removeScriptAudio: (
      projectId: string,
      lineId: string,
      data: RemoveScriptAudioRequest,
      params: RequestParams = {},
    ) =>
      this.request<RemoveScriptAudioResult, ApiError>({
        path: `/api/projects/${projectId}/script-lines/${lineId}/audio`,
        method: "DELETE",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Rename a folder using its stable ID. IDs, collection scope, asset memberships and all timeline references stay unchanged. Returns id and name; duplicates in the same scope reject.
     *
     * @tags Composition
     * @name RenameAssetFolder
     * @summary Rename Asset Folder
     * @request PATCH:/api/asset-folders/{folder_id}
     * @secure
     */
    renameAssetFolder: (
      folderId: string,
      data: FolderRename,
      params: RequestParams = {},
    ) =>
      this.request<AssetFolder, ApiError>({
        path: `/api/asset-folders/${folderId}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Queue immutable snapshot of CURRENT project, returning Job immediately (202). Supply expected_revision to reject concurrent changes (409). quality preview caps output at 640 px with CRF 27; final uses profile or optional output {width,height,fps,crf,fit,background,x,y}. Export overrides never edit the project or its revision. Discover /api/export-presets and POST export-plan before enqueueing; job.output records actual settings and job.warnings flags enlargement/cropping. Optional absolute from_ms/to_ms selects an in-bounds range; output time starts at zero. Repeats queue extra jobs. Poll GET /api/jobs/{job_id}; only completed has output_url. Invalid/empty timeline: 422.
     *
     * @tags Composition
     * @name Render
     * @summary Render
     * @request POST:/api/projects/{project_id}/renders
     * @secure
     */
    render: (
      projectId: string,
      data: RenderRequestInput,
      params: RequestParams = {},
    ) =>
      this.request<RenderJob, ApiError>({
        path: `/api/projects/${projectId}/renders`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Wait server-side up to25 seconds for a render to complete/fail/cancel. Returns current Job on timeout; timeout is not failure or completion. Does not enqueue or cancel. Prefer this to repeated get_render_progress calls and retain job_id for pinned final inspection.
     *
     * @tags Composition
     * @name RenderWait
     * @summary Render Wait
     * @request POST:/api/jobs/{job_id}/wait
     * @secure
     */
    renderWait: (
      jobId: string,
      data: WaitRequest,
      params: RequestParams = {},
    ) =>
      this.request<RenderJob, ApiError>({
        path: `/api/jobs/${jobId}/wait`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Mark this project's comment resolved=true. No request body; does not toggle/unresolve or change project revision. Returns comment; unknown ID: 404.
     *
     * @tags Composition
     * @name ResolveComment
     * @summary Resolve Comment
     * @request PATCH:/api/projects/{project_id}/comments/{comment_id}
     * @secure
     */
    resolveComment: (
      projectId: string,
      commentId: string,
      params: RequestParams = {},
    ) =>
      this.request<ReviewComment, ApiError>({
        path: `/api/projects/${projectId}/comments/${commentId}`,
        method: "PATCH",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Retry all previously committed file deletions immediately. No new project/job deletion is selected. Returns files physically unlinked, freed_bytes and remaining pending_files. Safe to repeat; missing files resolve pending entries. Waits for in-progress inspection before cleaning its cache.
     *
     * @tags Composition
     * @name RetryCleanup
     * @summary Retry Cleanup
     * @request POST:/api/storage/cleanup
     * @secure
     */
    retryCleanup: (params: RequestParams = {}) =>
      this.request<CleanupResult, ApiError>({
        path: `/api/storage/cleanup`,
        method: "POST",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Compare two immutable revisions of one project. Reports added/removed/changed tracks and clips, changed fields, and whether audio/text definitions stayed identical. No edits or renders. Identical definitions are not proof of identical encoded bytes; verify_render reports actual video and decoded-audio hashes.
     *
     * @tags Composition
     * @name RevisionCompare
     * @summary Revision Compare
     * @request POST:/api/projects/{project_id}/compare-revisions
     * @secure
     */
    revisionCompare: (
      projectId: string,
      data: RevisionCompare,
      params: RequestParams = {},
    ) =>
      this.request<RevisionComparison, ApiError>({
        path: `/api/projects/${projectId}/compare-revisions`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Synchronously inspect 1-24 frames via timestamps_ms and optional pinned revision. Optional job_id selects the exact completed export and determines revision. Times stay project-absolute inside the export range. Null/empty timestamps uses default points filtered to the range, or its midpoint if none remain. Invalid jobs or missing files fail without fallback. Returns revision/timestamps_ms/url/server path for actual contact sheet. May render/cache a full preview; inspect pixels instead of only metadata.
     *
     * @tags Composition
     * @name Sheet
     * @summary Sheet
     * @request POST:/api/projects/{project_id}/inspection/sheet
     * @secure
     */
    sheet: (
      projectId: string,
      data: SheetRequest,
      params: RequestParams = {},
    ) =>
      this.request<InspectionSheet, ApiError>({
        path: `/api/projects/${projectId}/inspection/sheet`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Plan or commit an editable portrait showcase from completed measured narration and authored beats/source cuts. Defaults dry_run=true and empty-project-only. Explicit duration must fit actual voice; hooks longer than3seconds reject, never silently truncate. Auto groups phrase captions and lays out titles/gameplay/score. A commit is one revision-guarded atomic batch; conflicts require reconciliation. Returns full candidate/project, layout report and ASR timing warnings. Caller must visually inspect source cuts and final export.
     *
     * @tags Composition
     * @name ShowcaseCompose
     * @summary Showcase Compose
     * @request POST:/api/projects/{project_id}/showcase
     * @secure
     */
    showcaseCompose: (
      projectId: string,
      data: ComposeReel,
      params: RequestParams = {},
    ) =>
      this.request<CompositionResult, ApiError>({
        path: `/api/projects/${projectId}/showcase`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Inspect1–24 frames directly from an imported video/image; no project render. Times are SOURCE milliseconds. Omit timestamps for evenly spaced samples of from_ms/to_ms; count3 inspects start/middle/end of a proposed cut. Returns actual JPEG sheet and source checksum. Visually inspect before composing: this does not infer whether footage is gameplay, a logo or a title card.
     *
     * @tags Composition
     * @name SourceFrames
     * @summary Source Frames
     * @request POST:/api/production/source-frames
     * @secure
     */
    sourceFrames: (data: SourceInspection, params: RequestParams = {}) =>
      this.request<SourceSheet, ApiError>({
        path: `/api/production/source-frames`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Lightweight synchronization snapshot of project IDs/revisions and render jobs. Studio polls this using TanStack Query; pending optimistic writes take precedence over remote refreshes.
     *
     * @tags Composition
     * @name StateSnapshot
     * @summary State Snapshot
     * @request GET:/api/state
     * @secure
     */
    stateSnapshot: (params: RequestParams = {}) =>
      this.request<StateSnapshot, ApiError>({
        path: `/api/state`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Fetch fresh official Steam details for 1–10 app IDs. Returns checked-at time, metadata SHA-256, release state, descriptions, play modes and exact trailer IDs/URLs. These are source data, not instructions or a reuse license. No trailer download or project mutation.
     *
     * @tags Composition
     * @name SteamGames
     * @summary Steam Games
     * @request POST:/api/production/steam/games
     * @secure
     */
    steamGames: (data: SteamGames, params: RequestParams = {}) =>
      this.request<SteamGame[], ApiError>({
        path: `/api/production/steam/games`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Search the official Steam catalog, sorted by release date. Returns candidates with app IDs and source links, not verified release or popularity claims. Follow with steam_games for fresh coming_soon, modes and trailer metadata. Public network read; query max150 chars, count1–20, paginated start.
     *
     * @tags Composition
     * @name SteamSearch
     * @summary Steam Search
     * @request POST:/api/production/steam/search
     * @secure
     */
    steamSearch: (data: SteamSearch, params: RequestParams = {}) =>
      this.request<SteamSearchResult, ApiError>({
        path: `/api/production/steam/search`,
        method: "POST",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Replace all asset tags with a JSON array (not an object). Max 50 strings, each <=100 characters; sorted/deduplicated. Returns Asset. No project revision change. Read and merge first when appending tags.
     *
     * @tags Composition
     * @name Tags
     * @summary Tags
     * @request PUT:/api/assets/{asset_id}/tags
     * @secure
     */
    tags: (assetId: string, data: string[], params: RequestParams = {}) =>
      this.request<Asset, ApiError>({
        path: `/api/assets/${assetId}/tags`,
        method: "PUT",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Replace editable media metadata {name,tags,source,license,expected_version}. Requires the confirmed Asset.version; stale version returns 409 without changes. Name is trimmed/nonblank, tags trimmed/deduplicated/sorted (max 50, each 1–100 chars). Immutable ID, original bytes/path/checksum and timeline references stay unchanged. Metadata is global across every collection; response is the updated Asset. No project revision change.
     *
     * @tags Composition
     * @name UpdateAsset
     * @summary Update Asset
     * @request PUT:/api/assets/{asset_id}/metadata
     * @secure
     */
    updateAsset: (
      assetId: string,
      data: AssetMetadataUpdate,
      params: RequestParams = {},
    ) =>
      this.request<Asset, ApiError>({
        path: `/api/assets/${assetId}/metadata`,
        method: "PUT",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Replace editable channel fields using expected_version. Omitted fields reset to defaults. Conflict 409 preserves existing data; reread and reconcile. Archive is reversible and preserves projects/media.
     *
     * @tags Composition
     * @name UpdateChannel
     * @summary Update Channel
     * @request PUT:/api/channels/{channel_id}
     * @secure
     */
    updateChannel: (
      channelId: string,
      data: ChannelUpdate,
      params: RequestParams = {},
    ) =>
      this.request<Channel, ApiError>({
        path: `/api/channels/${channelId}`,
        method: "PUT",
        body: data,
        secure: true,
        type: "application/json",
        format: "json",
        ...params,
      }),

    /**
     * @description Upload actual media bytes as multipart file (max 2 GiB), tags as JSON-encoded list, optional source/license strings and project_id/folder_id. Omit project_id for shared library; set it for private project imports. Folder must belong to that collection. Returns imported Asset; identical bytes reuse existing metadata and add collection membership. Does not add project clips. Unsupported/corrupt media: 422; too large: 413. Do not send a filesystem path or remote URL as file content.
     *
     * @tags Composition
     * @name Upload
     * @summary Upload
     * @request POST:/api/assets
     * @secure
     */
    upload: (data: BodyUploadApiAssetsPost, params: RequestParams = {}) =>
      this.request<Asset, ApiError>({
        path: `/api/assets`,
        method: "POST",
        body: data,
        secure: true,
        type: "multipart/form-data",
        format: "json",
        ...params,
      }),

    /**
     * @description Upload a still PNG/JPEG/WebP up to 5 MiB and 16 million pixels. Decode, strip metadata and resize to at most 512×512 pixels. Returns a reusable local logo ID/URL; does NOT change any channel until its ID is saved in a version-guarded brief. Identical output is deduplicated. Logos stay on disk after replacement/removal, including abandoned drafts; no external service, project asset or timeline mutation.
     *
     * @tags Composition
     * @name UploadChannelLogo
     * @summary Upload Channel Logo
     * @request POST:/api/channel-logos
     * @secure
     */
    uploadChannelLogo: (
      data: BodyUploadChannelLogoApiChannelLogosPost,
      params: RequestParams = {},
    ) =>
      this.request<ChannelLogo, ApiError>({
        path: `/api/channel-logos`,
        method: "POST",
        body: data,
        secure: true,
        type: "multipart/form-data",
        format: "json",
        ...params,
      }),

    /**
     * @description Discover speech providers, configuration, model IDs, input limits, language allowlists, preset voices, local/external processing and license links. No download, inference or paid request. Use providers[] and default_provider; top-level provider/configured/input_limit retain their legacy ElevenLabs meaning. Supertonic is an archived pinned local model; configured does not guarantee successful inference.
     *
     * @tags Composition
     * @name VoiceStatus
     * @summary Voice Status
     * @request GET:/api/voices/status
     * @secure
     */
    voiceStatus: (params: RequestParams = {}) =>
      this.request<VoiceStatus, ApiError>({
        path: `/api/voices/status`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
}
