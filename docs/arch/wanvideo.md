# WanVideo (Wan 2.2)

Alibaba's open-source video generation model. Wan 2.2 uses a Mixture-of-Experts (MoE) architecture — the 14B models require two separate diffusion model files (high-noise expert for layout/structure, low-noise expert for detail refinement). The 5B TI2V variant uses a single UNet. Supports text-to-video (T2V) and image-to-video (I2V).

## Files needed in ComfyUI

### Text-to-Video (T2V) — 14B

| Field | File | ComfyUI folder |
|---|---|---|
| High-noise UNet | `wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors` | `models/diffusion_models/` |
| Low-noise UNet | `wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors` | `models/diffusion_models/` |
| Text encoder | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` |
| VAE | `wan_2.1_vae.safetensors` | `models/vae/` |

### Image-to-Video (I2V) — 14B

| Field | File | ComfyUI folder |
|---|---|---|
| High-noise UNet | `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` | `models/diffusion_models/` |
| Low-noise UNet | `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors` | `models/diffusion_models/` |
| Text encoder | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` |
| VAE | `wan_2.1_vae.safetensors` | `models/vae/` |
| CLIP Vision *(optional)* | `sigclip_vision_patch14_384.safetensors` | `models/clip_vision/` |

### Text+Image-to-Video (TI2V) — 5B (single UNet)

| Field | File | ComfyUI folder |
|---|---|---|
| UNet | `wan2.2_ti2v_5B_fp16.safetensors` | `models/diffusion_models/` |
| Text encoder | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` |
| VAE | `wan2.2_vae.safetensors` | `models/vae/` |

Both high-noise and low-noise UNets are required for 14B models. The MoE switching (~50% denoising) is handled automatically by the wrapper.

## Where to download

- **Wan 2.2 ComfyUI repackaged (recommended)** — [Hugging Face Comfy-Org/Wan_2.2_ComfyUI_Repackaged](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/)
- **Official Wan-AI organisation** — [Hugging Face Wan-AI](https://huggingface.co/Wan-AI)
- **Optimised fp8 versions** — [Hugging Face Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy)

## Required custom nodes

- **ComfyUI-WanVideoWrapper** *(required — must be installed on the ComfyUI server)* — [kijai/ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper)

ComfyRefinery's WanVideo workflow uses nodes from this package (`WanVideoMoEModelLoader`, `WanVideoModelLoader`, `WanVideoTextEncode`, `WanVideoVAEDecode`). The wrapper must be present on your ComfyUI server before using this architecture.

## Notes

Primary use is **image-to-video (I2V)** — animates the output image from a previous workflow step. 14B models require ~20 GB VRAM at fp8. Video output is 480p or 720p depending on the workflow. The 5B TI2V model accepts both text and image input with a single UNet and runs on ~12 GB VRAM.
