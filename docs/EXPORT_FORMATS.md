# Export formats and image quality

The Export dialog has independent delivery settings. Exporting the same project
in several formats does not change its canvas, timeline or revision. New projects
can also start from any of the 16 presets.

| Format | HD | Full HD | QHD / 2K | UHD / 4K |
| --- | --- | --- | --- | --- |
| Landscape 16:9 | 1280 × 720 | 1920 × 1080 | 2560 × 1440 | 3840 × 2160 |
| Reel / Short 9:16 | 720 × 1280 | 1080 × 1920 | 1440 × 2560 | 2160 × 3840 |

Square presets are 720, 1080, 1440 and 2160 pixels per side. Portrait feed 4:5
presets are 720 × 900, 1080 × 1350, 1440 × 1800 and 2160 × 2700. Their labels
use pixels, not UHD. QHD is commonly marketed as 2K; it is not DCI 2048 × 1080.
Custom even dimensions are available in the Studio from 128 through 3840 pixels
per edge. The HTTP schema accepts 2 through 3840, also covering tiny draft frames.

## Quality and framing

- High quality (default): H.264 CRF 18. Maximum: CRF 15. Balanced: CRF 20.
  Smaller file: CRF 23. Lower CRF preserves more information at a larger size;
  size and bitrate vary with the content. Existing project CRFs remain intact.
- Frame-rate choices: 24, 25, 30, 50 and 60 FPS; existing custom project rates
  remain selectable. The API accepts 12–60 FPS. No motion interpolation occurs.
- **Fit** preserves the complete composition with bars in a chosen color.
  **Fill** crops the whole composition, including captions and graphics.
  Alignment controls choose where crop/padding space falls, without stretching.
  The framing diagram shows geometry; use **Check framing** for actual pixels.
- **Check framing** creates a draft, up to 640 pixels on its longest edge and
  CRF 27. **Export final video** uses the exact selected dimensions and CRF.
  The queue labels drafts and displays resolved settings before completion,
  then decoded dimensions/file size after completion.
- Source warnings account for source dimensions, clip placement, crop mode,
  static zoom and maximum animated zoom. They identify enlargement, not a
  perceptual quality score. Upscaling cannot recover absent detail. Use source
  footage with enough resolution, reduce zoom, or preserve the wide composition.
- Aspect conversion preserves layout, not a semantic rearrangement of shots.
  Create a separate project/canvas when you need a different composition.

Final output is MP4 / H.264 yuv420p / AAC, with the project's loudness settings.
Static footage uses Lanczos resampling without the previous mandatory 2× resize
and zoompan downsample. Animated cameras still use bounded supersampling.
Opaque intermediate clips use CRF 14 or better for final work; transparent layers
remain FFV1. Final composition uses x264 medium. This reduces generation loss at
the cost of larger caches and more final encoding time. Range selection occurs
before final encoding; audio normalization copies the encoded video unchanged.
See [FFmpeg scaler options](https://ffmpeg.org/ffmpeg-scaler.html) for the resampler.

## HTTP and MCP

1. `GET /api/export-presets` / `get_export_presets()` returns the shared catalog.
2. `POST /api/projects/{id}/export-plan` / `plan_export(...)` returns the resolved
   output, composition size and source/crop warnings without rendering/writing.
3. `POST /api/projects/{id}/renders` / `start_render(...)` queues an immutable
   project snapshot plus immutable export settings. Send `expected_revision`.
4. Poll the job; inspect the actual completed output by its `job_id`.

Example body (also use `output` in `start_render`):

```json
{
  "expected_revision": 8,
  "quality": "final",
  "output": {
    "width": 3840,
    "height": 2160,
    "fps": 60,
    "crf": 18,
    "fit": "contain",
    "background": "#080e10",
    "x": 0.5,
    "y": 0.5
  }
}
```

Omitting `output` preserves legacy behavior (project profile). A draft always
caps the requested dimensions; `job.output` records the actual capped values.
`job.warnings` records planning warnings. Old jobs can have null output settings;
use decoded metadata if present. A 409 must be reconciled, never blindly retried.

The Studio uses generated client methods through TanStack Query. Catalog reads
are cached; plan keys include project ID, confirmed revision and every request
parameter, forwarding cancellation. Format selections are local form drafts.
Enqueue uses the existing optimistic queue mutation with rollback on failure;
no playable asset or completed render is fabricated. Export is disabled while
project writes or matching source checks are pending. Deletion removes scoped
export-plan caches. OpenAPI and generated clients are maintained together.
