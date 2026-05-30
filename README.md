# Image Iterator

An iterative image generation tool that uses **Ollama** to write and refine prompts and **ComfyUI** to generate images. Each generation runs a loop: build prompt → generate image → AI reviews result → optionally pause for human review → repeat until accepted or the iteration limit is reached.

## Prerequisites

- **Node.js** 18 or later
- **Ollama** running and reachable (needs a vision-capable model, e.g. `gemma4:31b`, `llava`, `llava:13b`)
- **ComfyUI** running and reachable with at least one model loaded

## Install

```bash
git clone <repo-url>
cd image_iterator
npm install
```

## Build the UI

The frontend must be compiled before starting the server:

```bash
npm run ui:build
```

This outputs the built app into `public/`.

## Run

```bash
npm start
```

The server starts on **http://localhost:3000** by default. Open that URL in your browser.

To override the port:

```bash
PORT=8080 npm start
```

## First-time setup

1. Open **http://localhost:3000**
2. Click the **Settings** gear icon → set your Ollama and ComfyUI URLs, then choose an Ollama model
3. Click the **Models** icon → create at least one model (choose an architecture and fill in the checkpoint/unet/VAE fields)
4. Select your model from the dropdown in the header
5. Type a description and click **Generate**

### Environment variable overrides

These take precedence over the values stored in `data/config.json`:

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL |
| `COMFYUI_URL` | `http://127.0.0.1:8188` | ComfyUI base URL |
| `OLLAMA_MODEL` | _(from config)_ | Ollama model name |

## Development mode

Runs the Express API with `--watch` (auto-restart on changes) and the Vite dev server in parallel:

```bash
npm run dev
```

- API: **http://localhost:3000**
- Vite dev server (hot-reload UI): **http://localhost:5173**

## Supported architectures

| Key | Name | Notes |
|---|---|---|
| `sd15` | SD 1.5 / SD 2.x | Checkpoint + VAE |
| `sdxl` | SDXL | Checkpoint + VAE, optional refiner |
| `flux` | Flux.1 | Split (unet + CLIP-L + T5-XXL + VAE) or checkpoint |
| `flux2` | Flux 2 | Same as Flux.1 |
| `sd3` | SD 3 / SD 3.5 | Checkpoint + VAE |
| `chroma` | Chroma | Requires [ComfyUI-Chroma](https://github.com/lodestone-rock/ComfyUI_FluxMod) custom nodes |
| `anima` | Anima | Requires Qwen-3 text encoder and Qwen Image VAE; `er_sde` sampler via RES4LYF nodes |

## API

All endpoints are under `/api`.

### Generate (SSE stream)

**`POST /api/generate`** — start a new session

**`POST /api/generate/continue/:id`** — resume an existing session

Request body:
```json
{
  "description": "a cat sitting on a moon",
  "overrides": { "width": 1024, "height": 1024, "steps": 30 }
}
```

### Middleware / automation endpoint

**`POST /api/generate/run`** — trigger a generation with full per-request control

```json
{
  "description": "a cat sitting on a moon",
  "overrides": { "width": 1024, "height": 1024, "sampler": "euler", "steps": 28 },
  "humanReview": false,
  "modelId": "anima"
}
```

| Field | Required | Description |
|---|---|---|
| `description` | yes | The image description |
| `overrides` | no | Override any generation parameter (width, height, steps, sampler, scheduler, cfgScale, guidance, negativePrompt) |
| `humanReview` | no | `true` to pause for human review each iteration; `false` to run fully automated; omit to use the global setting |
| `modelId` | no | Model ID to use; omit to use the active model |

All three endpoints respond with a **Server-Sent Events** stream. Events:

| Event | Payload |
|---|---|
| `session` | `{ id }` — session ID |
| `phase` | `{ phase, iteration }` — current phase name |
| `token` | `{ iteration, phase, token }` — streaming token from Ollama |
| `prompt` | `{ iteration, format, prompt }` — finalised prompt |
| `progress` | `{ iteration, pct }` — ComfyUI generation progress |
| `image` | `{ iteration, url }` — URL of the generated image |
| `review` | `{ iteration, verdict, diagnosis }` — AI review result |
| `human_review` | `{ iteration, aiVerdict, aiDiagnosis }` — waiting for human input |
| `human_verdict` | `{ iteration, accepted, feedback }` |
| `done` | `{ iterations, accepted, imageUrl, sessionId }` — final result |
| `error` | `{ message }` |

### Human review

**`POST /api/generate/human-review/:sessionId`**

```json
{ "accept": true, "feedback": "looks good but try warmer colours next time" }
```

### Sessions

```
GET    /api/generate/sessions        — list all sessions
GET    /api/generate/sessions/:id    — full session data
DELETE /api/generate/sessions/:id    — delete a session
```

### Config & models

```
GET    /api/sessions/config
PATCH  /api/sessions/config

GET    /api/sessions/models/list
POST   /api/sessions/models
PUT    /api/sessions/models/:id
DELETE /api/sessions/models/:id

GET    /api/sessions/architectures
GET    /api/sessions/assets
```

## Data

All persistent data lives in the `data/` directory:

```
data/
  config.json          global settings and model registry
  sessions/            one JSON file per session
  skills/              per-model prompt engineering notes (auto-updated)
```
