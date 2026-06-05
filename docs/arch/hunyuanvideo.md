# HunyuanVideo

Tencent's open-source video generation model. HunyuanVideo-1.5 (released November 2025) supports both text-to-video and image-to-video with optimized inference. Uses a DiT (Diffusion Transformer) architecture with separate text and LLaVA encoders.

## Files needed in ComfyUI

### For Text-to-Video (T2V)

| Field | File | ComfyUI folder |
|---|---|---|
| Checkpoint | `hunyuan_video_t2v_720p_bf16.safetensors` | `models/checkpoints/` |
| CLIP text encoder | `clip_l.safetensors` | `models/text_encoders/` |
| LLaVA encoder | `llava_llama3_fp8_scaled.safetensors` | `models/text_encoders/` |
| VAE | `hunyuan_video_vae_bf16.safetensors` | `models/vae/` |

### For Image-to-Video (I2V)

| Field | File | ComfyUI folder |
|---|---|---|
| Checkpoint | `hunyuan_video_i2v_720p_bf16.safetensors` | `models/checkpoints/` |
| CLIP text encoder | `clip_l.safetensors` | `models/text_encoders/` |
| LLaVA encoder | `llava_llama3_fp8_scaled.safetensors` | `models/text_encoders/` |
| VAE | `hunyuan_video_vae_bf16.safetensors` | `models/vae/` |

HunyuanVideo-1.5 has native ComfyUI support in version 0.3.8+. Check the [official ComfyUI documentation](https://docs.comfy.org) for the latest native integration.

## Where to download

- **HunyuanVideo official (Tencent)** — [Hugging Face tencent/HunyuanVideo](https://huggingface.co/tencent/HunyuanVideo)
- **HunyuanVideo-1.5 (latest)** — [GitHub Tencent-Hunyuan/HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5)
- **ComfyUI repackaged versions** — [Hugging Face Comfy-Org/HunyuanVideo_repackaged](https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged) (native ComfyUI, no plugin required)

## Required custom nodes

- **ComfyUI-HunyuanVideoWrapper** *(if not using native ComfyUI integration)* — [kijai/ComfyUI-HunyuanVideoWrapper](https://github.com/kijai/ComfyUI-HunyuanVideoWrapper)
- **Comfy-Org native integration** — built-in to ComfyUI 0.3.8+

## Notes

Requires ~16 GB VRAM (24 GB recommended) for smooth inference. T2V and I2V use different checkpoint files. Output is 720p video. Latest updates favor native ComfyUI nodes over custom wrappers.
