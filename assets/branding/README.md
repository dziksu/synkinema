# Synkinema artwork

`logo.png` is the original RGBA artwork supplied by the user on 12 September 2026.
Keep its mark, colors and transparency. The studio applies its existing −7° tilt
with CSS; the browser and launcher icons use the upright artwork.

Generated static assets live in `apps/studio/public/brand/`, with a legacy icon at
`apps/studio/public/favicon.ico`. Regenerate on macOS using:

```sh
node apps/studio/scripts/generate-brand-assets.mjs
```

The generator only resizes/repackages the original artwork. It is not part of the
application build and introduces no production dependency. The 948 KB original is
retained here; the studio loads small PNG variants with a 2× density option.
The manifest declares app icon assets; it does not implement offline operation.
