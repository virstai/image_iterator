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
  };

  if (p.vae) {
    nodes["8"] = { class_type: "VAELoader", inputs: { vae_name: p.vae } };
  }
  const vaeRef = p.vae ? ["8", 0] : ["1", 2];

  let latentRef;
  let denoise;
  if (p.initImage) {
    const imgPath = p.initImage.subfolder
      ? `${p.initImage.subfolder}/${p.initImage.filename}`
      : p.initImage.filename;
    nodes["9"]  = { class_type: "LoadImage",  inputs: { image: imgPath } };
    nodes["10"] = { class_type: "VAEEncode",  inputs: { pixels: ["9", 0], vae: vaeRef } };
    latentRef = ["10", 0];
    denoise   = p.denoise ?? 0.6;
  } else {
    nodes["4"] = { class_type: "EmptyLatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } };
    latentRef = ["4", 0];
    denoise   = 1.0;
  }

  nodes["5"] = {
    class_type: "KSampler",
    inputs: {
      seed, steps: p.steps, cfg: p.cfgScale,
      sampler_name: p.sampler, scheduler: p.scheduler, denoise,
      model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: latentRef,
    },
  };
  nodes["6"] = { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: vaeRef } };
  nodes["7"] = { class_type: "SaveImage", inputs: { filename_prefix: "iterator", images: ["6", 0] } };
  return nodes;
}

module.exports = { build, defaults };
