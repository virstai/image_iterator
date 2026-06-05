# WanVideo (Wan 2.2)

Alibaba's open-source video generation model with a Mixture-of-Experts (MoE) architecture. Two separate expert models handle the early and late denoising stages—high-noise expert for layout and structure, low-noise expert for detail refinement. Supports both text-to-video (T2V) and image-to-video (I2V).

## Files needed in ComfyUI

### For Text-to-Video (T2V)

| Field | File | ComfyUI folder |
|---|---|---|
| High-Noise Expert | `wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors` | `models/diffusion_models/` |
| Low-Noise Expert | `wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors` | `models/diffusion_models/` |
| Text encoder | `umt5-xxl-enc-bf16.safetensors` | `models/text_encoders/` |
| VAE | `wan_2.2_vae.safetensors` | `models/vae/` |

### For Image-to-Video (I2V)

| Field | File | ComfyUI folder |
|---|---|---|
| High-Noise Expert | `wan2.2_i2v_high_noise_14B_fp16.safetensors` | `models/diffusion_models/` |
| Low-Noise Expert | `wan2.2_i2v_low_noise_14B_fp16.safetensors` | `models/diffusion_models/` |
| Text encoder | `umt5-xxl-enc-bf16.safetensors` | `models/text_encoders/` |
| VAE | `wan_2.2_vae.safetensors` | `models/vae/` |
| (Optional) CLIP Vision | `sigclip_vision_patch14_384.safetensors` | `models/clip_vision/` |

Both high-noise and low-noise experts are required. The pipeline switches between them automatically at ~50% denoising progress.

## Where to download

- **Wan 2.2 official models** — [Hugging Face Wan-AI organization](https://huggingface.co/Wan-AI)
- **Optimised fp8 versions for ComfyUI** — [Hugging Face Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy)

Use the Hugging Face CLI: `huggingface-cli download Kijai/WanVideo_comfy --local-dir ./models`

## Required custom nodes

- **ComfyUI-WanVideoWrapper** — [kijai/ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper)

## Notes

A14B models require ~20 GB VRAM for full precision; fp8 versions reduce this to ~14 GB. Video output is 480p or 720p depending on the workflow. The automatic expert switching (MoE) is handled by the wrapper — no manual switching needed.
