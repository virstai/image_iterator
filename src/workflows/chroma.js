'use strict';

// Chroma workflow — text-encoder-free diffusion model based on Flux architecture.
// Requires the ComfyUI-Chroma custom node pack (ChromaTextEncode, ChromaSampler nodes).
// Split loading only: unetName + vaeName.
const defaults = {
  width:     1024,
  height:    1024,
  steps:     30,
  guidance:  3.0,
  sampler:   'euler',
  scheduler: 'simple',
  negativePrompt: '',  // Chroma does not use negative prompts
};

function build(params) {
  const p = { ...defaults, ...params };
  const seed = p.seed ?? Math.floor(Math.random() * 2 ** 32);

  return {
    "1": { class_type: "UNETLoader",        inputs: { unet_name: p.unetName, weight_dtype: "default" } },
    "2": { class_type: "VAELoader",          inputs: { vae_name: p.vaeName } },
    "3": { class_type: "ChromaTextEncode",   inputs: { text: p.positivePrompt, steps: p.steps } },
    "4": { class_type: "EmptyLatentImage",   inputs: { width: p.width, height: p.height, batch_size: 1 } },
    "5": {
      class_type: "ChromaSampler",
      inputs: {
        seed, steps: p.steps, guidance: p.guidance,
        sampler_name: p.sampler, scheduler: p.scheduler,
        model: ["1", 0], conditioning: ["3", 0], latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode",  inputs: { samples: ["5", 0], vae: ["2", 0] } },
    "7": { class_type: "SaveImage",  inputs: { filename_prefix: "iterator", images: ["6", 0] } },
  };
}

module.exports = { build, defaults };
