# ComfyRefinery — Developer Notes

## What this is

ComfyRefinery is a workflow orchestration layer on top of ComfyUI. A prompt (and 0–N
reference images) flows through a saved, reusable **Workflow** — a linear chain of
model-agnostic steps (generate → upscale → …) — each step AI-reviewed and optionally
human-reviewed. It uses an abstracted LLM interface so any provider (Ollama, OpenAI,
etc.) can be swapped in via settings.

## Running

```bash
npm start              # production (serve public/)
npm run dev            # API --watch + Vite hot-reload UI
npm test               # all 65 tests
npm run ui:build       # compile Vue → public/
```

API on :3000, Vite dev on :5173. **Always stop the dev server on port 3000 after test runs.**

---

## Branch: `refactor/comfyrefinery`

This is an active refactor branch. **Do not merge to main until all phases are complete.**

### Phase status

| Phase | Status | Commit |
|-------|--------|--------|
| 1 — Rename + step registry + LLM abstraction | ✅ Done | `2bd2627` |
| 2 — Workflow entity | ✅ Done | `800e1d4` |
| 3 — Reference handling | ⏳ Next | see spec below |
| 4 — Upscale step | Pending | — |
| 5 — Reference adapters | Pending | — |
| 6 — Video step | Deferred | — |

---

## Architecture

### Two entities

**Model** (`cfg.models[id]`) — thin asset grouping, loader fields only.
```jsonc
{
  "id": "sdxl-base", "label": "SDXL Base", "architecture": "sdxl",
  "checkpoint": "sdXL_v10.safetensors", "vae": "sdxl_vae.safetensors"
  // split-load archs also: unetName, clipL, t5xxl, clipName, vaeName
  // sdxl: useRefiner, refinerCheckpoint
}
```

**Workflow** (`cfg.workflows[id]`) — the driver. Owns skill + notes, gen params,
reference strategy, ordered steps, per-step review. **Active-selected entity.**
```jsonc
{
  "id": "portrait-4x", "label": "Portrait → 4x",
  "steps": [
    {
      "type": "generate", "modelId": "sdxl-base",
      "params": { "width": 1024, "height": 1024, "steps": 30, "cfgScale": 7,
                  "sampler": "dpmpp_2m", "scheduler": "karras", "negativePrompt": "...",
                  "refinerSwitchAt": 0.8 },
      "referenceStrategy": {
        "visionNotes": true,
        "diffusion": {
          "none": "txt2img",
          "one":  { "mode": "init-image", "denoise": 0.6 },
          "many": { "mode": "adapter", "adapter": "ipadapter" }
        }
      },
      "review": { "maxIterations": 4, "humanReview": false, "gracePeriod": 10 }
    },
    {
      "type": "upscale", "upscaleModel": "4x-UltraSharp.pth", "factor": 2,
      "review": { "maxIterations": 1, "humanReview": true, "gracePeriod": 0 }
    }
  ]
}
```

Skill + notes live in `data/skills/<workflowId>.json`, keyed by workflow ID.

### Session data model (current, Phase 2)
```jsonc
{
  "id": "...", "prompt": "...",
  "workflowId": "portrait-4x", "workflowLabel": "Portrait → 4x",
  "references": [],
  "steps": [
    { "type": "generate", "label": "SDXL Base", "modelId": "sdxl-base",
      "iterations": [ { "prompt": "...", "imageUrl": "...", "verdict": "ACCEPT", "diagnosis": "..." } ],
      "outputImageUrl": "/api/image?..." }
  ],
  "status": "complete", "createdAt": "..."
}
```
`references` is always `[]` until Phase 3. Each entry will be `{ filename, subfolder, type }` — a ComfyUI image ref.

### SSE events (current)
All events carry `step` (0-indexed). Key events:
- `step` — `{ index, type, label, total }` — start of each step
- `phase`, `token`, `prompt`, `progress`, `image`, `review`, `human_review`,
  `human_verdict`, `accepted_pending`, `acceptance_refused`, `done`, `error`

`pendingReviews` / `pendingAcceptances` keyed by `"${sessionId}:${stepIndex}"`.

### LLM abstraction (current)
All LLM calls through `src/services/llm.js`:
- `llm.chatStream(cfg, messages, onToken)` — streaming
- `llm.chat(cfg, messages)` — non-streaming (skill refresh)
- `llm.listModels(cfg)` — enumerate models

Provider set by `cfg.llmProvider` (default `'ollama'`). Provider modules in
`src/services/providers/<name>.js` — each implements `{ chat, chatStream, listModels }`.
Ollama provider reads `cfg.ollamaUrl` and `cfg.llmModel`.

### Step registry (current)
`src/steps/index.js` — `get(type)` → step module.
`src/steps/generate.js` — `{ label, prepare, buildComfyWorkflow, reviewMessages }`.

Step interface:
```js
label(stepDef, cfg)
prepare(stepDef, ctx, previousIterations, onToken)     // → { prompt, params }
buildComfyWorkflow(stepDef, prepareResult, ctx)        // → ComfyUI node graph
reviewMessages(stepDef, prepareResult, ctx, imageBase64, previousIterations)
```

`ctx` shape: `{ userPrompt, modelConfig, skillId, inputImage, references, cfg }`.
- `skillId` = `session.workflowId` (set in `runStep`)
- `inputImage` = previous step's output URL (step chaining)
- `references` = `[]` until Phase 3

### Orchestration (current)
`runPipeline(session, pipelineDef, cfg, res)` — iterates steps, threads `ctx.inputImage`.
`runStep(stepDef, stepIndex, session, ctx, cfg, res)` — per-step loop; per-step review
settings from `stepDef.review` override global `cfg.*`.

### Config shape (current)
```jsonc
{
  "ollamaUrl":             "http://127.0.0.1:11434",
  "comfyuiUrl":            "http://127.0.0.1:8188",
  "llmProvider":           "ollama",
  "llmModel":              "gemma4:31b",
  "activeWorkflow":        "portrait-4x",
  "maxIterations":         3,
  "humanReview":           false,
  "acceptanceGracePeriod": 10,
  "models": {
    "sdxl-base": { "id": "sdxl-base", "label": "SDXL Base", "architecture": "sdxl",
                   "checkpoint": "sdXL_v10.safetensors", "vae": "sdxl_vae.safetensors" }
  },
  "workflows": {
    "portrait-4x": { "id": "portrait-4x", "label": "Portrait → 4x", "steps": [ ... ] }
  }
}
```

---

## Key file map

```
src/
  routes/
    generate.js       — runPipeline + runStep, SSE, session CRUD
    sessions.js       — config/models/workflows/skills/assets API
    sdapi.js          — A1111 compat shim (calls /api/generate/run internally)
  services/
    config.js         — load/save, model + workflow CRUD, activeWorkflow()
    db.js             — session persistence (JSON files in data/sessions/)
    skills.js         — skill/notes read/write (data/skills/<workflowId>.json)
    skillRefresher.js — LLM-driven skill synthesis
    llm.js            — provider router
    comfyui.js        — ComfyUI HTTP + WebSocket client
    providers/
      ollama.js       — Ollama LLM driver
  steps/
    index.js          — step-type registry
    generate.js       — generate step implementation
  workflows/
    index.js          — buildWorkflow(modelConfig, params) + getDefaults(arch) + archMeta
    sd15.js / sdxl.js / flux.js / flux2.js / sd3.js / chroma.js / anima.js
  lib/
    parsers.js        — parsePromptResponse, parseReview
ui/src/
  stores/
    config.js         — configState, loadConfig, saveConfig, model/workflow CRUD
    generate.js       — genState, handleEvent, SSE stream helpers
  components/
    AppHeader.vue       — active workflow selector + panel buttons
    GenerateSection.vue — prompt input (Phase 3: + reference drop zone)
    RunSection.vue      — step group renderer
    IterationCard.vue   — single iteration thumbnail
    IterationModal.vue  — full detail + human review + refuse
    ModelsPanel.vue     — model building-blocks list
    ModelEditor.vue     — loader fields, data-driven from archMeta.fields
    WorkflowsPanel.vue  — workflow list + active selector
    WorkflowEditor.vue  — step builder (generate params + review + referenceStrategy)
    SettingsPanel.vue   — global settings
    HistoryPanel.vue    — past sessions list
data/
  config.json         — models, workflows, activeWorkflow, global settings
  sessions/*.json     — one file per session
  skills/*.json       — one file per workflow id
```

---

## Testing

```bash
npm test               # all 65 tests
npm run test:unit      # unit tests only
npm run test:int       # integration tests only
```

Fake servers in `test/support/fakeServers.js` (Ollama + ComfyUI stubs).
Integration tests write to a tmpDir; set `DATA_DIR` / `SESSIONS_DIR` / `SKILLS_DIR`.

---

## Phase 3 — Reference handling

**Goal:** Allow 0–N reference images to be dropped in `GenerateSection`. References are
uploaded to ComfyUI upfront, then flow through the pipeline via `ctx.references`.
`referenceStrategy` on each generate step drives how they're used.

### Reference lifecycle

1. User drops files in the UI drop zone in `GenerateSection.vue`.
2. UI calls `POST /api/references/upload` with the files (multipart form).
3. Server uploads each image to ComfyUI's `POST /upload/image` endpoint.
4. Server returns `[{ filename, subfolder, type }]` — ComfyUI image refs.
5. UI stores the refs and shows thumbnails. Each generate call includes
   `references: [...]` in the request body.
6. Server stores refs on `session.references` and passes them into `ctx.references`.
7. Each generate step reads `ctx.references` + `stepDef.referenceStrategy`.

### What to build

**`src/services/comfyui.js`**
- Add `uploadImage(buffer, filename)` — `POST /upload/image` multipart to ComfyUI,
  returns `{ filename, subfolder, type }`.

**New: `src/routes/references.js`** (mount at `/api/references`)
- `POST /api/references/upload` — accepts multipart form data (`files` field, one or
  more images). For each file, calls `comfyui.uploadImage(buffer, originalname)`.
  Returns `[{ filename, subfolder, type }]`.
- Mount in `server.js` as `/api/references`.

**`src/routes/generate.js`**
- `POST /api/generate`: accept `references: [{ filename, subfolder, type }]` in body.
  Set `session.references = references ?? []`. Populate `ctx.references`.
- `POST /api/generate/run`: same.
- `POST /api/generate/continue/:id`: restore `ctx.references` from `session.references`.

**`src/steps/generate.js`**

`prepare()` — vision notes:
```js
// If visionNotes and references present, fetch each as base64 and prepend
// an extra user message with the images before the prompt-building message.
// Shape: { role: 'user', content: 'Reference images:', images: [base64, ...] }
```

`buildComfyWorkflow()` — diffusion strategy:
```js
const rs = stepDef.referenceStrategy?.diffusion;
const refCount = ctx.references?.length ?? 0;

if (refCount === 0 || !rs || rs.none === 'txt2img') {
  // current behavior — txt2img
} else if (refCount === 1 && rs.one?.mode === 'init-image') {
  // img2img: pass ctx.references[0] as init image, rs.one.denoise as denoise
} else if (refCount > 1 && rs.many?.mode === 'adapter') {
  // Phase 5 — not implemented yet, fall through to txt2img
}
```

**Workflow builders — img2img support**

Each architecture's `build(params)` needs to handle `params.initImage` (a ComfyUI
image ref `{ filename, subfolder, type }`) and `params.denoise` (0–1).

When `params.initImage` is set:
- Add a `LoadImage` node pointing to the init image
- Encode to latent via `VAEEncode`
- Use the encoded latent as `KSampler.latent_image` instead of `EmptyLatentImage`
- Set `KSampler.denoise = params.denoise ?? 0.6`

Architectures to update: `sd15.js`, `sdxl.js`, `flux.js`, `flux2.js`, `sd3.js`,
`chroma.js`, `anima.js`.

**`buildComfyWorkflow` in `src/steps/generate.js`**:
```js
function buildComfyWorkflow(stepDef, prepareResult, ctx) {
  const rs       = stepDef.referenceStrategy?.diffusion;
  const refs     = ctx.references ?? [];
  const initImage = refs.length === 1 && rs?.one?.mode === 'init-image'
    ? refs[0] : null;
  const denoise   = rs?.one?.denoise ?? 0.6;

  const { workflow } = buildArchWorkflow(ctx.modelConfig, {
    ...prepareResult.params,
    ...(initImage ? { initImage, denoise } : {}),
  });
  return workflow;
}
```

**`ui/src/components/GenerateSection.vue`**
- Add a reference drop zone below the textarea:
  - `<input type="file" multiple accept="image/*">` + drag-and-drop area
  - On file selection: call `POST /api/references/upload` with FormData
  - Store returned refs in a local `references` ref
  - Show thumbnails; allow removing individual refs
- Pass `references` along with the `generate` emit (or store in a shared state)
- `startGeneration(prompt, references)` in `stores/generate.js` includes refs in body

**`ui/src/stores/generate.js`**
- `startGeneration(prompt, references = [])` — include `references` in the POST body.
- `continueSession(sessionId, references = [])` — same for continue.

**`ui/src/components/WorkflowEditor.vue`**
- Add `referenceStrategy` section to each generate step:
  - **Vision notes** checkbox (`referenceStrategy.visionNotes`)
  - **When one reference**: dropdown: `txt2img` / `init-image` (with denoise slider)
  - **When many references**: dropdown: `txt2img` / `adapter (Phase 5 — disabled)`
- The `referenceStrategy` object is saved as part of the step in the workflow config.

**`GET /api/sessions/assets`**
- No change needed for Phase 3.

### Integration test additions

Add `test/integration/references.test.js`:
- `POST /api/references/upload` — multipart with a PNG, verify ComfyUI `/upload/image`
  was called, verify the response shape.
- `POST /api/generate` with `references: [...]` — verify `session.references` is stored,
  verify the `ctx.references` flows to the generate step (mock step can inspect ctx).

Add to `test/support/fakeServers.js`:
- Handle `POST /upload/image` in `makeFakeComfyUI` — return
  `{ name: "uploaded.png", subfolder: "", type: "input" }`.

---

## Phase 4 — Upscale step

**Goal:** Add a second step type `upscale` that takes the previous step's output image,
upscales it via ComfyUI's `UpscaleModelLoader` + `ImageUpscaleWithModel`, and feeds
it back into the pipeline.

### What to build

**`src/steps/upscale.js`** — new step module:
```js
label(stepDef, cfg)                     // → e.g. "4x-UltraSharp ×2"
prepare(stepDef, ctx, _, onToken)       // no-op prompt building; returns {}
buildComfyWorkflow(stepDef, _, ctx)     // UpscaleModelLoader + ImageUpscaleWithModel
                                        // + optional crop/scale-down to target size
reviewMessages(stepDef, _, ctx, imageBase64, previousIterations)
                                        // simple sharpness / artefact review
```

`stepDef` shape:
```jsonc
{ "type": "upscale", "upscaleModel": "4x-UltraSharp.pth", "factor": 2,
  "review": { "maxIterations": 1, "humanReview": true, "gracePeriod": 0 } }
```

`ctx.inputImage` is the URL of the previous step's output — upscale step fetches it
from ComfyUI, loads into the workflow as `LoadImageFromUrl` or via upload.

**`src/steps/index.js`** — register `upscale` type.

**`GET /api/sessions/assets`** — add `upscaleModels: []` to the response by calling
`fetchInputList('UpscaleModelLoader', 'model_name')` in `comfyui.getAssets()`.

**`ui/src/components/WorkflowEditor.vue`**
- "+ Add upscale step" button — appends an upscale step to the steps array.
- Upscale step form: model picker (from `assets.comfyui.upscaleModels`), factor
  (2× / 4× radio), review settings.

**`ui/src/components/AppHeader.vue`** — no change.

---

## Phase 5 — Reference adapters

**Goal:** When `referenceStrategy.diffusion.many.mode === 'adapter'`, use IPAdapter
(or Redux / Kontext for Flux) to condition generation on multiple reference images.

Deferred until Phase 3 is stable. Phase 5 will add:
- `IPAdapter` nodes to `sd15.js` / `sdxl.js` workflow builders
- Redux / Kontext nodes to `flux.js` / `flux2.js`
- The `many` branch in `buildComfyWorkflow` to activate these paths
- Asset discovery for IPAdapter model files
