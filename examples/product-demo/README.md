# Synkinema product videos

Two editable demo formats live here. `storyboard.json` and `record.mjs` preserve the original long tour. `storyboard-promo.json` and `record-promo.mjs` make a fast English open-source product promo. Its opening leads with the shared editing workflow: a person and an agent perform the same edits in one project, so the agent can automate a first cut and the person can change anything. Two clean shots jump from MCP setup to the ready editor without showing the navigation load. The promo cuts each recorded chapter to its measured narration, removes leading and trailing voice silence through Synkinema MCP, uses brief lower thirds, and adds a pulse score. All assembly and rendering happen in a separate Synkinema project; the Playwright recording is the visual source.

The default clip selectors in the recording scripts target the existing “SpawnBrief — 3 unusual mechanics in new games” project **read-only**. For another project, set `SYNKINEMA_VIDEO_CLIP_BUTTON` and `SYNKINEMA_CAPTION_CLIP_BUTTON` to the accessible names of its video and caption clip buttons. `SYNKINEMA_ORIGIN` overrides the default `http://127.0.0.1:43817`.

## Fast English promo

Requires the running Studio, Chrome, Node.js, the repository Python environment, and the installed local Supertonic 3 voice model. Run from the repository root:

```sh
npm --prefix examples/product-demo ci
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py prepare
SYNKINEMA_SOURCE_PROJECT_ID=<id> npm --prefix examples/product-demo run record:promo
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py start-score
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py upload
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py status
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py compose
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py render
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py render-status
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py verify
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py verification-status
SYNKINEMA_DEMO_VARIANT=promo ./.venv/bin/python examples/product-demo/produce.py download
```

Wait for narration before `start-score`, for music before `compose`, and for the final render before `verify` and `download`. Run `rerender` after a completed render when changing the renderer or revising an export; it retains the previous job ID in `production.json` and starts a new render of the same project revision. The current promo is v3 and writes its recording, screenshots, production state, and final MP4 to ignored `out-promo-v3/`. The earlier promo v2 remains in `out-promo/`; set `SYNKINEMA_DEMO_VERSION=v2` and `SYNKINEMA_DEMO_OUT=examples/product-demo/out-promo` only to inspect its production state. Set `SYNKINEMA_DEMO_OUT` to a new directory for another take, so prior projects and outputs remain intact. The original long-tour commands use the same workflow without `SYNKINEMA_DEMO_VARIANT=promo` and write to `out/`.

`produce.py` uses Synkinema MCP for project creation, narration, score, silence analysis, the revision-guarded edit, rendering, and verification. Only the large local screen recording uses multipart asset upload. Before public release, review rights to content visible in the example project and retain the on-screen AI voice disclosure.
