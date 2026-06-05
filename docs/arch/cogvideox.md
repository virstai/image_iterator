# CogVideoX

Zhipu AI's open-source video generation model using an expert Transformer architecture. Available in 5B and 9B parameter sizes. Uses a 3D Causal VAE for efficient spatiotemporal compression. Supports text-to-video and image-to-video modes.

## Files needed in ComfyUI

### For CogVideoX-5B (Text-to-Video)

| Field | File | ComfyUI folder |
|---|---|---|
| Checkpoint | `CogVideoX-5b.safetensors` | `models/checkpoints/` |
| Text encoder | `t5xxl_fp8_e4m3fn.safetensors` | `models/text_encoders/` |
| VAE | `cogvideox-5b-vae.safetensors` | `models/vae/` |

### For CogVideoX-5B I2V (Image-to-Video)

| Field | File | ComfyUI folder |
|---|---|---|
| Checkpoint | `CogVideoX-5b-I2V.safetensors` | `models/checkpoints/` |
| Text encoder | `t5xxl_fp8_e4m3fn.safetensors` | `models/text_encoders/` |
| VAE | `cogvideox-5b-vae.safetensors` | `models/vae/` |
| CLIP Vision *(optional)* | `sigclip_vision_patch14_384.safetensors` | `models/clip_vision/` |

## Where to download

- **CogVideoX-5B** — [Hugging Face THUDM/CogVideoX-5b](https://huggingface.co/THUDM/CogVideoX-5b)
- **CogVideoX-5B I2V** — [Hugging Face THUDM/CogVideoX-5b-I2V](https://huggingface.co/THUDM/CogVideoX-5b-I2V)
- **CogVideoX-9B (higher quality)** — [Hugging Face THUDM/CogVideoX-9b](https://huggingface.co/THUDM/CogVideoX-9b)
- **T5 encoder** — [Hugging Face comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders)
- **Official toolchain** — [GitHub THUDM/CogVideo](https://github.com/THUDM/CogVideo)

## Notes

The 3D Causal VAE provides efficient spatiotemporal compression — unlike 2D VAEs that process each frame independently (causing flicker), CogVideoX uses 3D convolutions to capture motion. Typical CFG: 6. Requires a large machine for smooth inference (~24+ GB VRAM recommended). Community integration in ComfyUI varies; check the official CogVideo repository for the latest setup guidance.
