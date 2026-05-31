# Image Iterator

An iterative image generation tool that uses **Ollama** to write and refine prompts and **ComfyUI** to generate images. Each generation runs a loop: build prompt → generate image → AI reviews result → optionally pause for human review → repeat until accepted or the iteration limit is reached.

## Prerequisites

- **Node.js** 18 or later
- **Ollama** running and reachable (needs a vision-capable model, e.g. `gemma4:31b`, `llava`, `llava:13b`)
- **ComfyUI** running and reachable with at least one model loaded

## Install

```bash
git clone https://github.com/virstai/image_iterator.git
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
2. Click the **Settings** gear icon → set your Ollama and ComfyUI URLs, choose an Ollama model, and optionally configure the acceptance grace period
3. Click the **Models** icon → create at least one model (choose an architecture and fill in the checkpoint/unet/VAE fields)
4. Select your model from the dropdown in the header
5. Type a prompt and click **Generate**

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
| `flux` | Flux.1 | Split (UNet + CLIP-L + T5-XXL + VAE) or checkpoint |
| `flux2` | Flux 2 | Same as Flux.1 |
| `sd3` | SD 3 / SD 3.5 | Checkpoint + VAE |
| `chroma` | ChromaHD | Split (UNet + T5 encoder + VAE); standard ComfyUI nodes only — no custom node pack required |
| `anima` | Anima | Requires Qwen-3 text encoder and Qwen Image VAE; uses `er_sde` sampler (available in recent ComfyUI builds or via RES4LYF nodes) |

## Settings

| Setting | Default | Description |
|---|---|---|
| Max iterations | 3 | Maximum number of generate-review cycles per run |
| Acceptance grace period | 10s | Seconds to wait after an acceptance before finalising. Set to 0 to disable. |
| Human review | off | Pause after every iteration for manual accept/reject |

### Acceptance grace period

When an iteration is accepted by the AI, the result is held for a configurable number of seconds before the session is marked complete. During this window a **Refuse** button appears in the iteration modal, letting you reject the result and continue iterating without restarting from scratch. After the timer expires the session completes normally.

You can also refuse an accepted iteration at any time after the session completes — open the iteration modal and click **Refuse acceptance**, then use **Continue session** to run more iterations.

## Native API

All endpoints are under `/api`.

### Generate (SSE stream)

**`POST /api/generate`** — start a new session

**`POST /api/generate/continue/:id`** — resume an existing session

Request body:
```json
{
  "prompt": "a cat sitting on a moon",
  "overrides": { "width": 1024, "height": 1024, "steps": 30 }
}
```

### Automation endpoint

**`POST /api/generate/run`** — trigger a generation with full per-request control

```json
{
  "prompt": "a cat sitting on a moon",
  "overrides": { "width": 1024, "height": 1024, "sampler": "euler", "steps": 28 },
  "humanReview": false,
  "acceptanceGracePeriod": 10,
  "modelId": "anima"
}
```

| Field | Required | Description |
|---|---|---|
| `prompt` | yes | The image prompt |
| `overrides` | no | Override any generation parameter (`width`, `height`, `steps`, `sampler`, `scheduler`, `cfgScale`, `guidance`, `negativePrompt`, `seed`) |
| `humanReview` | no | `true`/`false` to override the global human review setting |
| `acceptanceGracePeriod` | no | Seconds to wait after acceptance before returning `done`; `0` to disable; omit to use the global setting |
| `modelId` | no | Model ID to use; omit to use the active model |

All three SSE endpoints emit the following events:

| Event | Payload |
|---|---|
| `session` | `{ id, prompt }` — session ID and prompt (`resume: true` instead of `prompt` when resuming) |
| `phase` | `{ phase, iteration }` — current phase name |
| `token` | `{ iteration, phase, token }` — streaming token from Ollama |
| `prompt` | `{ iteration, prompt }` — finalised ComfyUI prompt |
| `progress` | `{ iteration, pct }` — ComfyUI generation progress (0–100) |
| `image` | `{ iteration, url }` — URL of the generated image |
| `review` | `{ iteration, verdict, diagnosis }` — AI review result |
| `human_review` | `{ iteration, aiVerdict, aiDiagnosis }` — waiting for human input |
| `human_verdict` | `{ iteration, accepted, feedback }` |
| `accepted_pending` | `{ iteration, gracePeriod, maxIterations? }` — grace period started; `maxIterations: true` when triggered at the end of a rejected batch |
| `acceptance_refused` | `{ iteration }` — acceptance refused; loop continues |
| `done` | `{ iterations, accepted, imageUrl, sessionId, prompt }` — final result |
| `error` | `{ message }` |

### Human review

**`POST /api/generate/human-review/:sessionId`**

```json
{ "accept": true, "feedback": "looks good but try warmer colours next time" }
```

### Refusing an accepted result

**`POST /api/generate/sessions/:id/refuse-accepted`**

Marks the most recent accepted iteration as refused. If called during an active grace period the timer is cancelled and the loop continues immediately. Safe to call on completed sessions (use **Continue session** afterwards to run more iterations).

No request body required.

### Broadcast event stream

**`GET /api/generate/events`** — server-sent event stream that broadcasts every generation event to all connected clients, regardless of whether the session was started from the UI or via the SDAPI. The browser UI subscribes to this on load to show live progress for externally-triggered sessions.

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

---

## Stable Diffusion WebUI API (`/sdapi/v1`)

The server exposes a partial [Automatic1111](https://github.com/AUTOMATIC1111/stable-diffusion-webui) compatible API, allowing existing SD tooling, scripts, and ComfyUI clients to use it as a drop-in backend.

| Endpoint | Method | Description |
|---|---|---|
| `/sdapi/v1/txt2img` | POST | Generate an image (blocking — waits for the full iteration loop including any grace period) |
| `/sdapi/v1/img2img` | POST | Accepted for compatibility; treated as txt2img — `init_images` and `denoising_strength` are ignored |
| `/sdapi/v1/progress` | GET | Poll generation progress during a running request |
| `/sdapi/v1/interrupt` | POST | Abort the current generation |
| `/sdapi/v1/sd-models` | GET | List configured models |
| `/sdapi/v1/options` | GET | Get active model as `sd_model_checkpoint` |
| `/sdapi/v1/options` | POST | Set active model via `sd_model_checkpoint` |
| `/sdapi/v1/samplers` | GET | List supported samplers |
| `/sdapi/v1/schedulers` | GET | List supported schedulers (ComfyUI scheduler names) |
| `/sdapi/v1/upscalers` | GET | Stub — returns `[{name:"None"}]`; upscaling not supported |
| `/sdapi/v1/latent-upscale-modes` | GET | Stub — returns `[]` |
| `/sdapi/v1/sd-vae` | GET | Stub — returns `[]`; VAE switching not supported |

### txt2img

`POST /sdapi/v1/txt2img` blocks until the full iteration loop completes and returns the result image as a base64-encoded PNG.

**Supported parameters:**

| Parameter | Description |
|---|---|
| `prompt` | Image prompt (required) |
| `negative_prompt` | Negative prompt |
| `steps` | Number of sampling steps |
| `cfg_scale` | Guidance / CFG scale |
| `width` / `height` | Image dimensions |
| `sampler_name` | Sampler (see `/sdapi/v1/samplers`; unrecognised names use the model's workflow default) |
| `scheduler` | Scheduler name (see `/sdapi/v1/schedulers`; omit or send `""` to use the model's workflow default) |
| `seed` | Seed (`-1` for random; incremented across `batch_size`) |
| `batch_size` | Images per batch |
| `n_iter` | Number of batches |
| `override_settings.sd_model_checkpoint` | Select a specific model for this request |

**Response:**
```json
{
  "images": ["<base64 PNG>", "..."],
  "parameters": { "...echoed request..." },
  "info": "{\"seed\": 42, \"prompt\": \"...\", \"steps\": 26, ...}"
}
```

**Python example:**

```python
import requests, base64

r = requests.post('http://localhost:3000/sdapi/v1/txt2img', json={
    'prompt': 'a tiger in golden light, photorealistic',
    'negative_prompt': 'blurry, low quality',
    'steps': 26,
    'cfg_scale': 3.8,
    'width': 1152,
    'height': 1152,
    'sampler_name': 'Euler',
})

data = r.json()
with open('output.png', 'wb') as f:
    f.write(base64.b64decode(data['images'][0]))
```

**Selecting a model per-request:**

```python
r = requests.post('http://localhost:3000/sdapi/v1/txt2img', json={
    'prompt': 'a fox in a forest',
    'override_settings': { 'sd_model_checkpoint': 'ChromaHD [chroma]' },
})
```

The `sd_model_checkpoint` value accepts a model label (`ChromaHD`), ID (`chroma`), or the combined `Label [id]` format.

### Notes

- The acceptance grace period applies to SDAPI requests just as it does to UI-triggered sessions. While the grace period is active the browser UI (connected via `GET /api/generate/events`) shows the result and a **Refuse & continue** button. The SDAPI response is not returned until the grace period expires or the user refuses.
- Unrecognised `sd_model_checkpoint` values (e.g. when a client sends back the backend name rather than a model ID) fall back to the active model.
- `cfg_scale` is forwarded as both `guidance` and `cfgScale`; each architecture uses whichever applies.
- `POST /sdapi/v1/img2img` is accepted (clients such as Marinara's illustrator use it when a reference image is provided) but is treated identically to `txt2img` — `init_images` and `denoising_strength` are ignored and the request runs the normal iteration loop.
- PNG info, interrogate, and training endpoints are not implemented.

---

## Data

All persistent data lives in the `data/` directory:

```
data/
  config.json          global settings and model registry
  sessions/            one JSON file per session
  skills/              per-model prompt engineering notes (auto-updated)
```
