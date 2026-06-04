# ComfyRefinery — Developer Notes

## What this is

ComfyRefinery is a workflow orchestration layer on top of ComfyUI. A prompt (and 0–N
reference images) flows through a saved, reusable **Workflow** — a linear chain of
model-agnostic steps (generate → upscale → …) — each step AI-reviewed and optionally
human-reviewed. It uses an OpenAI-compatible LLM interface so any provider (Ollama,
OpenAI, LM Studio, etc.) can be pointed at via `llmBaseUrl` in settings.

## Running

```bash
npm start              # production (serve public/)
npm run dev            # API --watch + Vite hot-reload UI
npm test               # all 70 tests
npm run ui:build       # compile Vue → public/
```

API on :3000, Vite dev on :5173. **Always stop the dev server on port 3000 after test runs.**

---

## Branch: `refactor/comfyrefinery`

This is an active refactor branch. **Do not merge to main until all phases are complete.**

### Phase status

| Phase | Status | Commit |
|-------|--------|--------|
| 1 — Rename + step registry + LLM abstraction | ✅ Done | `2129995` |
| 2 — Workflow entity | ✅ Done | `538f3a8` |
| LLM refactor — OpenAI-compat provider | ✅ Done | `d77467d` |
| 3 — Reference handling | ✅ Done | `d91b763` |
| 4 — Upscale step | ⏳ Next | see spec below |
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
          "many": { "mode": "init-image", "denoise": 0.6 }
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

`referenceStrategy.diffusion` keys:
- `none` — always `"txt2img"` (no refs)
- `one` — `{ mode: "txt2img" | "init-image", denoise }` — when exactly 1 ref
- `many` — `{ mode: "txt2img" | "init-image" | "adapter", denoise }` — when >1 refs
  - `"init-image"` uses refs[0] only; `"adapter"` is Phase 5 (falls through to txt2img)

Skill + notes live in `data/skills/<workflowId>.json`, keyed by workflow ID.

### Session data model (current)
```jsonc
{
  "id": "...", "prompt": "...",
  "workflowId": "portrait-4x", "workflowLabel": "Portrait → 4x",
  "references": [{ "filename": "ref.png", "subfolder": "", "type": "input" }],
  "steps": [
    { "type": "generate", "label": "SDXL Base", "modelId": "sdxl-base",
      "iterations": [ { "prompt": "...", "imageUrl": "...", "verdict": "ACCEPT", "diagnosis": "..." } ],
      "outputImageUrl": "/api/image?..." }
  ],
  "status": "complete", "createdAt": "..."
}
```

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
- `llm.listModels(cfg)` → `string[]` — enumerate model IDs

Single provider `'openai'` in `src/services/providers/openai.js` — speaks the
OpenAI `/v1/chat/completions` API. Works with Ollama (`llmBaseUrl` pointing to its
`/v1` endpoint), real OpenAI, LM Studio, vLLM, etc.

Messages with `images: [base64, ...]` are converted to OpenAI content-array format
(each image becomes `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }`).

Back-compat: existing configs with `ollamaUrl` are migrated automatically — `/v1` is
appended to derive `llmBaseUrl`.

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
- `references` = `[{ filename, subfolder, type }]` (live since Phase 3)

### Orchestration (current)
`runPipeline(session, pipelineDef, cfg, res)` — iterates steps, threads `ctx.inputImage`.
`runStep(stepDef, stepIndex, session, ctx, cfg, res)` — per-step loop; per-step review
settings from `stepDef.review` override global `cfg.*`.

### Config shape (current)
```jsonc
{
  "llmBaseUrl":            "http://127.0.0.1:11434/v1",
  "llmApiKey":             "",
  "comfyuiUrl":            "http://127.0.0.1:8188",
  "llmProvider":           "openai",
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
    references.js     — POST /api/references/upload (base64 JSON → ComfyUI)
    sessions.js       — config/models/workflows/skills/assets API
    sdapi.js          — A1111 compat shim (calls /api/generate/run internally)
  services/
    config.js         — load/save, model + workflow CRUD, activeWorkflow()
    db.js             — session persistence (JSON files in data/sessions/)
    skills.js         — skill/notes read/write (data/skills/<workflowId>.json)
    skillRefresher.js — LLM-driven skill synthesis
    llm.js            — provider router
    comfyui.js        — ComfyUI HTTP + WebSocket client + uploadImage()
    providers/
      openai.js       — OpenAI-compat LLM driver (Ollama /v1, OpenAI, LM Studio…)
  steps/
    index.js          — step-type registry
    generate.js       — generate step: vision notes, img2img routing, review
  workflows/
    index.js          — buildWorkflow(modelConfig, params) + getDefaults(arch) + archMeta
    sd15.js / sdxl.js / flux.js / flux2.js / sd3.js / chroma.js / anima.js
                      — all support params.initImage + params.denoise for img2img
  lib/
    parsers.js        — parsePromptResponse, parseReview
ui/src/
  stores/
    config.js         — configState, loadConfig, saveConfig, model/workflow CRUD
    generate.js       — genState, handleEvent, SSE stream helpers
  components/
    AppHeader.vue       — WorkflowSelect + panel buttons
    WorkflowSelect.vue  — custom dropdown for active workflow (replaces native <select>)
    GenerateSection.vue — prompt input + reference drop zone (composes RefGrid)
    RefGrid.vue         — presentational reference image grid + drop zone shell
    RefImage.vue        — single reference image tile (thumbnail + remove button)
    RunSection.vue      — step group renderer
    IterationCard.vue   — single iteration thumbnail
    IterationModal.vue  — full detail + human review + refuse
    ModelsPanel.vue     — model building-blocks list
    ModelEditor.vue     — loader fields, data-driven from archMeta.fields
    WorkflowsPanel.vue  — workflow list + active selector
    WorkflowEditor.vue  — step builder (generate params + review + referenceStrategy)
    SettingsPanel.vue   — global settings (llmBaseUrl, llmApiKey, comfyuiUrl, llmModel)
    HistoryPanel.vue    — past sessions list
data/
  config.json         — models, workflows, activeWorkflow, global settings
  sessions/*.json     — one file per session
  skills/*.json       — one file per workflow id
```

---

## Testing

```bash
npm test               # all 70 tests
npm run test:unit      # unit tests only
npm run test:int       # integration tests only
```

Fake servers in `test/support/fakeServers.js`:
- `makeFakeOllama(getVerdict)` — speaks OpenAI `/v1/chat/completions` SSE format.
  `getVerdict` called per review so tests can change it mid-run.
- `makeFakeComfyUI()` — returns an http.Server with `.uploads[]` array populated
  each time `POST /upload/image` is called.

Integration tests write to a tmpDir; set `DATA_DIR` / `SESSIONS_DIR` / `SKILLS_DIR`.

---

## Phase 4 — Upscale step

**Goal:** Add a second step type `upscale` that takes the previous step's output image,
upscales it via ComfyUI's `UpscaleModelLoader` + `ImageUpscaleWithModel`, and feeds
it back into the pipeline.

### What to build

**`src/steps/upscale.js`** — new step module:
```js
label(stepDef, cfg)                     // → e.g. "4x-UltraSharp ×2"
prepare(stepDef, ctx, _, onToken)       // no LLM call; returns {}
buildComfyWorkflow(stepDef, _, ctx)     // UpscaleModelLoader + ImageUpscaleWithModel
reviewMessages(stepDef, _, ctx, imageBase64, previousIterations)
                                        // sharpness / artefact review prompt
```

`stepDef` shape:
```jsonc
{ "type": "upscale", "upscaleModel": "4x-UltraSharp.pth", "factor": 2,
  "review": { "maxIterations": 1, "humanReview": true, "gracePeriod": 0 } }
```

**Input image loading**: `ctx.inputImage` is a `/api/image?...` URL (our proxy for
ComfyUI output). The upscale step must fetch it and re-upload via `comfyui.uploadImage()`
to get a ComfyUI input ref, then wire a `LoadImage` node pointing to that ref.

**ComfyUI workflow shape**:
```
LoadImage → ImageUpscaleWithModel ← UpscaleModelLoader
                ↓
          SaveImage
```
`factor` controls expected output size but ComfyUI's upscale node doesn't take a factor
directly — the model determines its own scale (4x-UltraSharp = 4×). If `factor < model
native`, add a `ImageScale` node to downsample after upscaling.

**`src/steps/index.js`** — register `'upscale'` type.

**`src/services/comfyui.js`** — `getAssets()` already exists; add `upscaleModels` to
the response by calling `fetchInputList('UpscaleModelLoader', 'model_name')`.

**`src/routes/sessions.js`** — `GET /api/sessions/assets` returns comfyui assets;
add `upscaleModels` field from `comfyui.getAssets()`.

**`ui/src/components/WorkflowEditor.vue`**
- Each step block currently shows `Step N: Generate`. Add support for `type: 'upscale'`:
  - "+ Add upscale step" button appends `{ type: 'upscale', upscaleModel: '', factor: 2, review: {} }`
  - Upscale step form: model picker (from `assets.comfyui.upscaleModels`), factor
    (2× / 4× / 8× select), review settings (same fields as generate).
- Step header label should reflect the type: "Step N: Generate" or "Step N: Upscale".

**`ui/src/components/RunSection.vue`** — verify upscale steps render correctly.
The upscale step has no `prompt` phase; iterations will go straight to `generating`.

### Integration test additions

Add `test/integration/upscale.test.js`:
- Workflow with a generate + upscale step; verify both `step` events fire in order.
- Verify the upscale step calls `POST /upload/image` (re-upload of previous output)
  and sends a ComfyUI `/prompt` containing `UpscaleModelLoader`.
- Verify session has two `steps[]` entries after completion.

Extend `test/support/fakeServers.js` `makeFakeComfyUI` if needed to handle the
`UpscaleModelLoader` object_info query.

---

## Phase 5 — Reference adapters

**Goal:** When `referenceStrategy.diffusion.many.mode === 'adapter'`, use IPAdapter
(or Redux / Kontext for Flux) to condition generation on multiple reference images.

Deferred until Phase 4 is stable. Phase 5 will add:
- `IPAdapter` nodes to `sd15.js` / `sdxl.js` workflow builders
- Redux / Kontext nodes to `flux.js` / `flux2.js`
- The `many.mode === 'adapter'` branch in `buildComfyWorkflow` to activate these paths
- Asset discovery for IPAdapter model files in `comfyui.getAssets()`
