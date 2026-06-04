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

| Phase | Status | Summary |
|-------|--------|---------|
| 1 — Rename + step registry + LLM abstraction | ✅ Done | Committed `2bd2627` |
| 2 — Workflow entity | ⏳ Next | See below |
| 3 — Reference handling | Pending | img2img, vision notes, drop zone |
| 4 — Upscale step | Pending | upscale.js, multi-step UI |
| 5 — Reference adapters | Pending | IPAdapter/Redux/Kontext |
| 6 — Video step | Deferred | — |

---

## Architecture

### Two entities

**Model** (`cfg.models[id]`) — thin asset grouping only. No skill, no sampling params.
```jsonc
{
  "id": "sdxl-base", "label": "SDXL Base", "architecture": "sdxl",
  "checkpoint": "sdXL_v10.safetensors", "vae": "sdxl_vae.safetensors"
  // also: unetName, clipL, t5xxl, clipName, vaeName (for split-load archs)
}
```

**Workflow** (`cfg.workflows[id]`) — the driver. Owns skill + notes, gen params,
reference strategy, ordered steps, per-step review. **This is the active-selected entity.**
```jsonc
{
  "id": "portrait-4x", "label": "Portrait → 4x",
  "steps": [
    {
      "type": "generate", "modelId": "sdxl-base",
      "params": { "width": 1024, "height": 1024, "steps": 30, "cfgScale": 7,
                  "sampler": "dpmpp_2m", "scheduler": "karras", "negativePrompt": "..." },
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

Skill + notes live in `data/skills/<workflowId>.json`, keyed by **workflow ID** (Phase 2
will re-key from the current modelId keying).

### Session data model (Phase 1 shape, already live)
```jsonc
{
  "id": "...", "prompt": "...", "modelId": "...", "modelLabel": "...",
  "workflowId": null,
  "steps": [
    { "type": "generate", "label": "SDXL Base", "modelId": "sdxl-base",
      "iterations": [ { "prompt": "...", "imageUrl": "...", "verdict": "ACCEPT", "diagnosis": "..." } ],
      "outputImageUrl": "/api/image?..." }
  ],
  "status": "complete", "createdAt": "..."
}
```

### SSE events (Phase 1 shape, already live)
All events carry a `step` field (0-indexed step index). New event:
- `step` — `{ index, type, label, total }` — emitted at the start of each step.

Existing events (`phase`, `token`, `prompt`, `progress`, `image`, `review`,
`human_review`, `human_verdict`, `accepted_pending`, `acceptance_refused`, `done`)
now include `{ step: N, ... }`.

`pendingReviews` / `pendingAcceptances` keys are `"${sessionId}:${stepIndex}"`.

### LLM abstraction (Phase 1, already live)
All LLM calls go through `src/services/llm.js`:
- `llm.chatStream(cfg, messages, onToken)` — streaming (prompt build + review)
- `llm.chat(cfg, messages)` — non-streaming (skill refresh)
- `llm.listModels(cfg)` — enumerate available models

Active provider set by `cfg.llmProvider` (default `'ollama'`). Provider modules live in
`src/services/providers/<name>.js` — each implements `{ chat, chatStream, listModels }`.
Currently only `ollama`. The Ollama provider reads `cfg.ollamaUrl` and `cfg.llmModel`.

Config rename: `ollamaModel` → `llmModel`. Back-compat shim in `config.load()` copies
`ollamaModel` → `llmModel` for existing configs.

### Step registry (Phase 1, already live)
`src/steps/index.js` — `get(type)` returns the step module.
`src/steps/generate.js` — implements `{ label, prepare, buildComfyWorkflow, reviewMessages }`.

Interface each step must implement:
```js
label(stepDef, cfg)                                    // display name
prepare(stepDef, ctx, previousIterations, onToken)     // → { prompt, params }
buildComfyWorkflow(stepDef, prepareResult, ctx)        // → ComfyUI node graph
reviewMessages(stepDef, prepareResult, ctx, imageBase64, previousIterations)  // → messages[]
```

`ctx` shape: `{ userPrompt, modelConfig, skillId, inputImage, references, cfg }`.

### Orchestration (Phase 1, already live)
`runPipeline(session, pipelineDef, cfg, res)` — iterates steps, threads `ctx.inputImage`.
`runStep(stepDef, stepIndex, session, ctx, cfg, res)` — per-step inner loop with per-step
review settings (`stepDef.review` overrides global `cfg.*`).

---

## Phase 2 — Workflow entity

**Goal:** Introduce `cfg.workflows` as the real config entity. The app header's active
selector becomes "active Workflow." Model is demoted to a loader-only building block.
Skill + notes move from `modelId` keying to `workflowId` keying.

### What to build

**`src/services/config.js`**
- Add `workflows: {}` + `activeWorkflow: null` to `GLOBAL_DEFAULTS`.
- Add `saveWorkflow(id, data)`, `deleteWorkflow(id)`, `activeWorkflow()` — mirror the
  existing `saveModel`/`deleteModel`/`activeModel` helpers.
- Trim `saveModel` to only persist loader fields (strip any sampling params that got
  saved before this refactor).
- No migration shim needed (user confirmed they'll clear old data).

**`src/services/skills.js` + `src/services/skillRefresher.js`**
- Currently keyed by `modelId`. Change the key to `workflowId` everywhere.
- `refreshSkill(workflowId, workflowLabel, arch, correctionNote)` — arch stays because
  the skill prompt references the arch name.
- `skills.getSummary(workflowId)`, `skills.record(workflowId, ...)`.
- The generate step (`src/steps/generate.js`) currently passes `stepDef.modelId` as
  `skillId` in ctx. After Phase 2, `ctx.skillId` = `session.workflowId`.

**`src/routes/sessions.js`**
- New workflow CRUD: `GET/POST /api/sessions/workflows`, `PUT/DELETE /api/sessions/workflows/:id`.
- Add active-workflow endpoint: `PATCH /api/sessions/config` already handles arbitrary
  keys, so `{ activeWorkflow: id }` just works — just wire up the UI.
- `GET /api/sessions/skills/:workflowId` — same route, just the ID changes semantics.
- `GET /api/sessions/architectures` — unchanged.
- `GET /api/sessions/assets` — unchanged (no upscalers yet, that's Phase 4).

**`src/routes/generate.js`**
- `POST /api/generate` — resolve `cfg.activeWorkflow` instead of `cfg.activeModel`.
  Build `pipelineDef` from `workflow.steps` instead of the current implicit
  single-generate-step. Pass `session.workflowId` into ctx so skill lookups use it.
- `POST /api/generate/run` — accept `workflowId` override.
- `POST /api/generate/continue/:id` — reconstruct pipelineDef from `session.workflowId`
  → `cfg.workflows[workflowId].steps`.
- Session creation: set `workflowId: workflow.id`.
- After pipeline: `refreshSkill(session.workflowId, workflow.label, arch)`.

**`src/steps/generate.js`**
- `prepare` currently does `skills.getSummary(ctx.skillId)` where `skillId = stepDef.modelId`.
  After Phase 2: `skillId = ctx.workflowId`. No other change needed.

**`ui/src/components/AppHeader.vue`**
- Active selector binds to `config.activeWorkflow` (workflows map) instead of
  `config.activeModel` (models map).
- Emit `set-active-workflow` instead of `set-active-model`.

**`ui/src/stores/config.js`**
- Add `saveWorkflow(id, data)`, `deleteWorkflow(id)`, `setActiveWorkflow(id)`.
- Keep `saveModel`, `deleteModel` for the trimmed Model building-block management.

**New: `ui/src/components/WorkflowsPanel.vue`**
- Lists workflows; "Use" sets active; "Edit" opens `WorkflowEditor`.
- "+ Add workflow" opens editor in create mode.

**New: `ui/src/components/WorkflowEditor.vue`**
- Per-step list builder:
  - **Generate step**: pick Model (from `cfg.models`), set `params` (width/height/steps/
    cfg/guidance/sampler/scheduler/negativePrompt — these fields move out of `ModelEditor`),
    set `referenceStrategy`, set `review` (maxIterations/humanReview/gracePeriod).
  - **Skill + notes** section (moved from `ModelEditor`), keyed by workflow id.
  - Future: upscale step (Phase 4).
- Save calls `POST /api/sessions/workflows` or `PUT /api/sessions/workflows/:id`.

**`ui/src/components/ModelEditor.vue`**
- **Remove** from the form: width, height, steps, cfgScale, guidance, sampler, scheduler,
  negativePrompt, refinerSwitchAt, skill section, notes section.
- **Keep**: label, architecture, checkpoint, unetName, clipL, t5xxl, clipName, vaeName,
  vae, splitLoad toggle, useRefiner + refinerCheckpoint (these are loader concerns).

**`ui/src/components/ModelsPanel.vue`**
- Remove the "Use" / active-model semantics. Models are now pure building blocks.
- Keep Edit / Delete.

---

## Key file map

```
src/
  routes/
    generate.js       — runPipeline + runStep, SSE, session CRUD
    sessions.js       — config/models/workflows/skills/assets API
    sdapi.js          — A1111 compat shim (calls /api/generate/run internally)
  services/
    config.js         — load/save, model + workflow CRUD helpers
    db.js             — session persistence (JSON files in data/sessions/)
    skills.js         — skill/notes read/write (data/skills/<id>.json)
    skillRefresher.js — LLM-driven skill synthesis; loads config internally
    llm.js            — provider router (chatStream / chat / listModels)
    comfyui.js        — ComfyUI HTTP + WebSocket client
    providers/
      ollama.js       — Ollama LLM driver
  steps/
    index.js          — step-type registry (get(type) → module)
    generate.js       — generate step (prepare / buildComfyWorkflow / reviewMessages)
  workflows/
    index.js          — buildWorkflow(modelConfig, params) + getDefaults(arch)
    sd15.js / sdxl.js / flux.js / flux2.js / sd3.js / chroma.js / anima.js
  lib/
    parsers.js        — parsePromptResponse, parseReview
ui/src/
  stores/
    config.js         — configState, loadConfig, saveConfig, model/workflow CRUD
    generate.js       — genState (steps[]), handleEvent, SSE stream helpers
  components/
    AppHeader.vue     — active workflow selector, panel buttons
    GenerateSection.vue — prompt input + (future) reference image drop zone
    RunSection.vue    — renders step groups with IterationCard grids
    IterationCard.vue — thumbnail for one iteration
    IterationModal.vue — full iteration detail + human review + refuse
    ModelsPanel.vue   — model list (building blocks only after Phase 2)
    ModelEditor.vue   — loader fields only after Phase 2
    SettingsPanel.vue — global settings (ollamaUrl, comfyuiUrl, llmModel, etc.)
    HistoryPanel.vue  — past sessions list
    WorkflowsPanel.vue — (Phase 2) workflow list + active selector
    WorkflowEditor.vue — (Phase 2) workflow step builder + skill/notes
data/
  config.json         — models, workflows, activeWorkflow, global settings
  sessions/*.json     — one file per session
  skills/*.json       — one file per model/workflow id
```

## Config shape (target after Phase 2)

```jsonc
{
  "ollamaUrl":            "http://127.0.0.1:11434",
  "comfyuiUrl":           "http://127.0.0.1:8188",
  "llmProvider":          "ollama",
  "llmModel":             "gemma4:31b",
  "activeWorkflow":       "portrait-4x",
  "maxIterations":        3,
  "humanReview":          false,
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

## Testing

```bash
npm test               # runs all: unit/db, unit/parsers, unit/skillRefresher, unit/skills,
                       # integration/generate, integration/sdapi
npm run test:unit      # unit tests only
npm run test:int       # integration tests only
```

Fake servers are in `test/support/fakeServers.js` (Ollama + ComfyUI stubs).
Integration tests write to a tmpDir and set `DATA_DIR` / `SESSIONS_DIR` / `SKILLS_DIR`.
