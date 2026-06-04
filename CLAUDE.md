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
npm test               # all 74 tests
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
| 4 — Upscale step | ✅ Done | see below |
| 5 — Reference adapters | ⏳ Next | see spec below |
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
      "type": "upscale", "upscaleType": "model",
      "upscaleModel": "4x-UltraSharp.pth", "factor": 4,
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
      "outputImageUrl": "/api/image?..." },
    { "type": "upscale", "label": "4x-UltraSharp.pth ×4",
      "iterations": [ { "imageUrl": "...", "verdict": "ACCEPT", "diagnosis": "..." } ],
      "outputImageUrl": "/api/image?..." }
  ],
  "status": "complete", "createdAt": "..."
}
```

### SSE events (current)
All events carry `step` (0-indexed). Key events:
- `step` — `{ index, type, label, total }` — start of each step
- `phase`, `token`, `prompt`, `progress`, `preview`, `image`, `review`, `human_review`,
  `human_verdict`, `accepted_pending`, `acceptance_refused`, `step_complete`, `done`, `error`

New in Phase 4:
- `preview` — `{ step, iteration, url }` — base64 data URL from ComfyUI WS binary frame during generation
- `step_complete` — `{ step, imageUrl, accepted }` — emitted after each step finishes; pipeline stops early if `!accepted` and more steps remain
- `accepted_pending` now includes `humanReview: bool` — client only auto-opens modal when true

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
`src/steps/generate.js` — generate step: LLM prompt build, vision notes, img2img routing, review.
`src/steps/upscale.js` — upscale step: model upscaler (ESRGAN) or hires fix (re-diffusion).

Step interface:
```js
label(stepDef, cfg)
prepare(stepDef, ctx, previousIterations, onToken)     // → { prompt?, params?, inputRef?, ... }
buildComfyWorkflow(stepDef, prepareResult, ctx)        // → ComfyUI node graph
reviewMessages(stepDef, prepareResult, ctx, imageBase64, previousIterations)
```

`ctx` shape: `{ userPrompt, modelConfig, skillId, inputImage, chainedInputRef, references, cfg }`.
- `skillId` = `session.workflowId` (set in `runStep`)
- `inputImage` = previous step's output URL (step chaining)
- `chainedInputRef` = re-uploaded ComfyUI input ref of `inputImage`, set by `runStep` for generate steps that aren't first in the pipeline; used as init-image at denoise 0.5 (`stepDef.params.chainDenoise` to override)
- `references` = `[{ filename, subfolder, type }]` (user-uploaded refs)

### Upscale step shapes
```jsonc
// Model upscaler (ESRGAN / RealESRGAN)
{ "type": "upscale", "upscaleType": "model",
  "upscaleModel": "4x-UltraSharp.pth", "factor": 4,
  "review": { "maxIterations": 1, "humanReview": true } }

// Hires fix (re-diffusion via any configured model)
{ "type": "upscale", "upscaleType": "hires",
  "modelId": "sdxl-base", "scale": 2, "denoise": 0.35,
  "steps": 20, "cfgScale": 7, "sampler": "dpmpp_2m",
  "review": { "maxIterations": 1, "humanReview": true } }
```
`model` type: `UpscaleModelLoader → ImageUpscaleWithModel → (ImageScaleBy if factor < native) → SaveImage`.
`hires` type: calls arch workflow builder with `initImage`, then injects `LatentUpscaleBy` between VAEEncode and KSampler.

### ComfyUI asset discovery
`comfyui.fetchInputList(nodeType, inputName)` — handles both old (`[array, {}]`) and new (`["COMBO", { options: [...] }]`) ComfyUI `object_info` formats.
`comfyui.getAssets()` → `{ checkpoints, vaes, clips, unets, upscaleModels, errors }`.

### Skill / notes system
`data/skills/<workflowId>.json` — per-workflow knowledge base.

Notes have `auto: bool` and `enabled: bool`:
- **User notes** (`auto: false`) — created manually; never touched by AI.
- **AI notes** (`auto: true, enabled: false`) — AI suggestions; disabled by default; user must enable.
- **Locked notes** (`auto: true, enabled: true`) — user-approved; AI cannot remove or overwrite.

`skillRefresher.js` runs after each session and on manual refresh:
- Updates the SKILL text freely.
- Adds/replaces disabled auto notes from ENFORCE / BLACKLIST sections.
- Locked (enabled) notes are always preserved verbatim; AI is told not to re-suggest them.
- New suggestions always start `enabled: false`.

### Orchestration (current)
`runPipeline(session, pipelineDef, cfg, res)` — iterates steps, threads `ctx.inputImage`.
- Emits `step_complete` after each step.
- Stops early (skips remaining steps) if a step finishes without acceptance.

`runStep(stepDef, stepIndex, session, ctx, cfg, res)` — per-step loop:
- Per-step review settings (`stepDef.review`) override global `cfg.*`.
- For generate steps with a previous step output: pre-uploads `ctx.inputImage` and adds `chainedInputRef` to ctx.
- Forwards ComfyUI binary WebSocket preview frames as `preview` SSE events.
- `accepted_pending` event includes `humanReview` so client only opens the modal when relevant.

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
    skillRefresher.js — LLM-driven skill synthesis; locked notes preserved
    llm.js            — provider router
    comfyui.js        — ComfyUI HTTP + WebSocket client; preview frame handling
    providers/
      openai.js       — OpenAI-compat LLM driver (Ollama /v1, OpenAI, LM Studio…)
  steps/
    index.js          — step-type registry (generate, upscale)
    generate.js       — generate step: vision notes, img2img routing, chain input, review
    upscale.js        — upscale step: model (ESRGAN) + hires (re-diffusion) types
  workflows/
    index.js          — buildWorkflow(modelConfig, params) + getDefaults(arch) + archMeta
    sd15.js / sdxl.js / flux.js / flux2.js / sd3.js / chroma.js / anima.js
                      — all support params.initImage + params.denoise for img2img
  lib/
    parsers.js        — parsePromptResponse, parseReview
ui/src/
  stores/
    config.js         — configState, loadConfig, saveConfig, model/workflow CRUD
    generate.js       — genState (loadedRefs), handleEvent, SSE stream helpers
  components/
    AppHeader.vue       — WorkflowSelect + panel buttons
    WorkflowSelect.vue  — custom dropdown for active workflow
    GenerateSection.vue — prompt input + reference drop zone; restores refs on session load
    RefGrid.vue         — presentational reference image grid + drop zone shell
    RefImage.vue        — single reference image tile (thumbnail + remove button)
    RunSection.vue      — step group renderer; type-badged headers; preview during generation
    IterationCard.vue   — single iteration thumbnail; live preview via data URL
    IterationModal.vue  — full detail + human review + refuse
    ModelsPanel.vue     — model building-blocks list
    ModelEditor.vue     — loader fields, data-driven from archMeta.fields
    WorkflowsPanel.vue  — workflow list + active selector
    WorkflowEditor.vue  — step builder: generate + upscale (model/hires) types
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
npm test               # all 74 tests
npm run test:unit      # unit tests only
npm run test:int       # integration tests only
```

Fake servers in `test/support/fakeServers.js`:
- `makeFakeOllama(getVerdict)` — speaks OpenAI `/v1/chat/completions` SSE format.
  `getVerdict` called per review so tests can change it mid-run.
- `makeFakeComfyUI()` — returns an http.Server with `.uploads[]` and `.prompts[]` arrays
  populated each time `POST /upload/image` or `POST /prompt` is called.

Integration tests write to a tmpDir; set `DATA_DIR` / `SESSIONS_DIR` / `SKILLS_DIR`.

---

## Phase 5 — Reference adapters

**Goal:** When `referenceStrategy.diffusion.many.mode === 'adapter'`, use IPAdapter
(SD1.5 / SDXL) or Redux / Kontext (Flux) to condition generation on multiple reference images simultaneously, rather than using only refs[0] as an init-image.

### What to build

**`src/workflows/sd15.js` + `sdxl.js`** — add IPAdapter branch:
```js
// When params.ipAdapterImages is set (array of { filename, subfolder, type } refs):
// LoadImage × N → IPAdapter (model + clip_vision) → model pipe
```
Requires `IPAdapterModelLoader` and `CLIPVisionLoader` nodes (standard IPAdapter custom nodes).

**`src/workflows/flux.js` + `flux2.js`** — add Redux / Kontext branch:
```js
// Redux: ReduxImageEncoder × N → FluxGuidance conditioning
// Kontext: KontextImageEncoder feeds into the Flux sampler
```

**`src/steps/generate.js`** — `buildComfyWorkflow`:
- When `refs.length > 1 && rs?.many?.mode === 'adapter'`, pass `refs` as `ipAdapterImages` (or redux/kontext images) to the arch workflow builder.
- Architecture-specific: sd15/sdxl use IPAdapter, flux/flux2 use Redux or Kontext.

**`src/services/comfyui.js`** — extend `getAssets()`:
- `ipAdapterModels` via `fetchInputList('IPAdapterModelLoader', 'model_name')`
- `clipVisionModels` via `fetchInputList('CLIPVisionLoader', 'model_name')`

**`src/routes/sessions.js`** — expose `ipAdapterModels` + `clipVisionModels` via `/api/sessions/assets`.

**`ui/src/components/WorkflowEditor.vue`** — in the generate step's reference strategy section:
- Enable the `adapter` option in the "When many references" select.
- When `adapter` is selected, show model pickers for IPAdapter model + CLIP vision model (for sd15/sdxl), or note that Flux uses Redux/Kontext automatically.

### Architecture routing

| Architecture | Adapter approach | Key nodes |
|---|---|---|
| `sd15` / `sdxl` | IPAdapter | `IPAdapterModelLoader`, `CLIPVisionLoader`, `IPAdapter` |
| `flux` / `flux2` | Redux or Kontext | `ReduxImageEncoder` / `KontextImageEncoder` |
| Others | Falls through to txt2img | — |

The `many.mode === 'adapter'` branch in `buildComfyWorkflow` currently falls through to txt2img (Phase 5 stub). Phase 5 replaces that fallthrough with real adapter conditioning.
