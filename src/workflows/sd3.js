'use strict';

// SD3 / SD3.5 workflow — triple text encoders (CLIP-L, CLIP-G, T5), MMDiT architecture
const defaults = {
  width: 1024,
  height: 1024,
  steps: 28,
  cfgScale: 4.5,
  sampler: 'euler',
  scheduler: 'sgm_uniform',
  negativePrompt: '',
};

function build(params) {
  const p = { ...defaults, ...params };
  const seed = p.seed ?? Math.floor(Math.random() * 2 ** 32);

  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.checkpoint } },
    "2": { class_type: "CLIPTextEncodeSD3", inputs: { text: p.positivePrompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncodeSD3", inputs: { text: p.negativePrompt, clip: ["1", 1] } },
    "4": { class_type: "EmptySD3LatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed, steps: p.steps, cfg: p.cfgScale,
        sampler_name: p.sampler, scheduler: p.scheduler, denoise: 1.0,
        model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
      }
    },
    "6": { class_type: "VAEDecode",  inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage",  inputs: { filename_prefix: "iterator", images: ["6", 0] } },
  };
}

module.exports = { build, defaults };
