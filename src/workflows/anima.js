'use strict';

// Anima — 2B parameter anime/illustration model by CircleStone Labs.
// Split loading only: UNETLoader + CLIPLoader (Qwen-3) + VAELoader (Qwen-Image).
// er_sde is the recommended sampler; available in recent ComfyUI builds or via RES4LYF.
const defaults = {
  width:          1024,
  height:         1024,
  steps:          35,
  cfgScale:       5,
  sampler:        'er_sde',
  scheduler:      'simple',
  negativePrompt: '',
};

function build(params) {
  const p = { ...defaults, ...params };
  const seed = p.seed ?? Math.floor(Math.random() * 2 ** 32);

  return {
    "1": { class_type: "UNETLoader",      inputs: { unet_name: p.unetName, weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader",      inputs: { clip_name: p.clipL, type: "qwen_image" } },
    "3": { class_type: "VAELoader",       inputs: { vae_name: p.vaeName } },
    "4": { class_type: "CLIPTextEncode",  inputs: { text: p.positivePrompt, clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode",  inputs: { text: p.negativePrompt, clip: ["2", 0] } },
    "6": { class_type: "EmptyLatentImage",inputs: { width: p.width, height: p.height, batch_size: 1 } },
    "7": {
      class_type: "KSampler",
      inputs: {
        seed, steps: p.steps, cfg: p.cfgScale,
        sampler_name: p.sampler, scheduler: p.scheduler, denoise: 1.0,
        model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["6", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "iterator", images: ["8", 0] } },
  };
}

module.exports = { build, defaults };
