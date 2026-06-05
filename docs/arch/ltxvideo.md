# LTX-Video

Lightricks' open-source video diffusion model. One of the fastest open video models; runs on consumer GPUs (~8–12 GB VRAM for short clips). Available in multiple versions (0.9.5 and newer LTX-2 variants). Supports text-to-video and image-to-video.

## Files needed in ComfyUI

### For LTX-Video 0.9.5

| Field | File | ComfyUI folder |
|---|---|---|
| Checkpoint | `ltx-video-2b-v0.9.5.safetensors` | `models/checkpoints/` |
| Text encoder | `t5xxl_fp16.safetensors` | `models/text_encoders/` |
| VAE | Included in checkpoint | — |

### For LTX-2 (latest)

| Field | File | ComfyUI folder |
|---|---|---|
| Checkpoint | e.g. `ltx-2-latest.safetensors` | `models/checkpoints/` |
| Text encoder | `gemma-3-12b-encoder.safetensors` | `models/text_encoders/` |
| (Optional) Audio encoder | `ltx-audio-encoder.safetensors` | `models/audio_encoders/` |
| (Optional) Upscale models | Various | `models/latent_upscale_models/` |

ComfyUI will attempt to download missing models automatically on first use. The official ComfyUI-LTXVideo nodes handle most setup automatically.

## Where to download

- **LTX-Video 0.9.5** — [Hugging Face Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video)
- **LTX-2 (latest)** — [Lightricks LTX-2 GitHub](https://github.com/Lightricks/LTX-Video-2)
- **Text encoders** — [Hugging Face comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders)

Manual download via CLI: `huggingface-cli download Lightricks/LTX-Video --include "ltx-video-2b-v0.9.5.safetensors" --local-dir ./models/checkpoints/`

## Required custom nodes

- **ComfyUI-LTXVideo** — [Lightricks/ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo)
- **Optional: ComfyUI-GGUF** — [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) for quantised variants

## Notes

One of the most VRAM-efficient open video models. Generates in ~90 seconds on a 4090, ~7 minutes on a 3060 12GB. LTX-2.3 adds audio synchronization (requires librosa, soundfile, torchaudio). No negative prompt support.
