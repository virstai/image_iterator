'use strict';

const defaults = {
  width:          512,
  height:         512,
  steps:          20,
  cfgScale:       7,
  sampler:        'euler',
  scheduler:      'normal',
  negativePrompt: 'bad quality, blurry, watermark',
};

function build(params) {
  const p = { ...defaults, ...params };
  const seed = p.seed ?? Math.floor(Math.random() * 2 ** 32);

  const nodes = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.checkpoint } },
    "2": { class_type: "CLIPTextEncode",         inputs: { text: p.positivePrompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode",         inputs: { text: p.negativePrompt, clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage",        inputs: { width: p.width, height: p.height, batch_size: 1 } },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed, steps: p.steps, cfg: p.cfgScale,
        sampler_name: p.sampler, scheduler: p.scheduler, denoise: 1.0,
        model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
      },
    },
  };

  // External VAE overrides the one baked into the checkpoint
  if (p.vae) {
    nodes["8"] = { class_type: "VAELoader",  inputs: { vae_name: p.vae } };
    nodes["6"] = { class_type: "VAEDecode",  inputs: { samples: ["5", 0], vae: ["8", 0] } };
  } else {
    nodes["6"] = { class_type: "VAEDecode",  inputs: { samples: ["5", 0], vae: ["1", 2] } };
  }

  nodes["7"] = { class_type: "SaveImage", inputs: { filename_prefix: "iterator", images: ["6", 0] } };
  return nodes;
}

module.exports = { build, defaults };
