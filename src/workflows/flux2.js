'use strict';

// Flux 2 workflow — uses the same SamplerCustomAdvanced pipeline as Flux 1 but
// with updated node defaults for the Flux 2 architecture. Adjust sampler/scheduler
// if BFL releases different recommendations.
// Supports both checkpoint and split (UNet + DualCLIP + VAE) loading.
const defaults = {
  width:     1024,
  height:    1024,
  steps:     25,
  guidance:  3.5,
  sampler:   'euler',
  scheduler: 'beta',   // Flux 2 works better with the beta scheduler
  negativePrompt: '',
};

function build(params) {
  const p = { ...defaults, ...params };
  const seed = p.seed ?? Math.floor(Math.random() * 2 ** 32);

  const nodes = {};

  if (p.unetName) {
    nodes["1"] = { class_type: "UNETLoader",      inputs: { unet_name: p.unetName, weight_dtype: "default" } };
    nodes["2"] = { class_type: "DualCLIPLoader",  inputs: { clip_name1: p.clipL, clip_name2: p.t5xxl, type: "flux" } };
    nodes["3"] = { class_type: "VAELoader",        inputs: { vae_name: p.vaeName } };
    return _buildGraph(nodes, p, seed, ["1", 0], ["2", 0], ["3", 0]);
  } else {
    nodes["1"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.checkpoint } };
    return _buildGraph(nodes, p, seed, ["1", 0], ["1", 1], ["1", 2]);
  }
}

function _buildGraph(nodes, p, seed, modelRef, clipRef, vaeRef) {
  const nextId = () => String(Object.keys(nodes).length + 1);

  const posId    = nextId(); nodes[posId]    = { class_type: "CLIPTextEncode",      inputs: { text: p.positivePrompt, clip: clipRef } };
  const emptyId  = nextId(); nodes[emptyId]  = { class_type: "EmptyLatentImage",    inputs: { width: p.width, height: p.height, batch_size: 1 } };
  const guidId   = nextId(); nodes[guidId]   = { class_type: "FluxGuidance",        inputs: { conditioning: [posId, 0], guidance: p.guidance } };
  const noiseId  = nextId(); nodes[noiseId]  = { class_type: "RandomNoise",         inputs: { noise_seed: seed } };
  const basicId  = nextId(); nodes[basicId]  = { class_type: "BasicGuider",         inputs: { model: modelRef, conditioning: [guidId, 0] } };
  const splitId  = nextId(); nodes[splitId]  = { class_type: "BasicScheduler",      inputs: { model: modelRef, scheduler: p.scheduler, steps: p.steps, denoise: 1.0 } };
  const samplId  = nextId(); nodes[samplId]  = { class_type: "KSamplerSelect",      inputs: { sampler_name: p.sampler } };
  const advId    = nextId(); nodes[advId]    = { class_type: "SamplerCustomAdvanced",inputs: { noise: [noiseId, 0], guider: [basicId, 0], sampler: [samplId, 0], sigmas: [splitId, 0], latent_image: [emptyId, 0] } };
  const decodeId = nextId(); nodes[decodeId] = { class_type: "VAEDecode",           inputs: { samples: [advId, 0], vae: vaeRef } };
  const saveId   = nextId(); nodes[saveId]   = { class_type: "SaveImage",           inputs: { filename_prefix: "iterator", images: [decodeId, 0] } };

  return nodes;
}

module.exports = { build, defaults };
