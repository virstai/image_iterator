'use strict';

// Flux.1 workflow — uses FluxGuidance instead of CFG, dual text encoder (T5 + CLIP-L),
// SamplerCustomAdvanced pipeline. Supports both checkpoint and UNet/CLIP/VAE split loading.
const defaults = {
  width: 1024,
  height: 1024,
  steps: 20,
  guidance: 3.5,       // Flux uses guidance scale differently from CFG
  sampler: 'euler',
  scheduler: 'simple',
  negativePrompt: '',  // Flux doesn't use negative prompts effectively
  // For split loading (optional):
  // unetName, clipL, t5xxl, vaeName
};

function build(params) {
  const p = { ...defaults, ...params };
  const seed = p.seed ?? Math.floor(Math.random() * 2 ** 32);

  const nodes = {};

  if (p.unetName) {
    // Split loading: separate UNet, CLIP, VAE files
    nodes["1"]  = { class_type: "UNETLoader",  inputs: { unet_name: p.unetName, weight_dtype: "default" } };
    nodes["2"]  = { class_type: "DualCLIPLoader", inputs: { clip_name1: p.clipL, clip_name2: p.t5xxl, type: "flux" } };
    nodes["3"]  = { class_type: "VAELoader",   inputs: { vae_name: p.vaeName } };
    const modelRef = ["1", 0];
    const clipRef  = ["2", 0];
    const vaeRef   = ["3", 0];
    return _buildGraph(nodes, p, seed, modelRef, clipRef, vaeRef);
  } else {
    // Single checkpoint file
    nodes["1"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: p.checkpoint } };
    return _buildGraph(nodes, p, seed, ["1", 0], ["1", 1], ["1", 2]);
  }
}

function _buildGraph(nodes, p, seed, modelRef, clipRef, vaeRef) {
  const nextId = () => String(Object.keys(nodes).length + 1);

  const posId  = nextId(); nodes[posId]  = { class_type: "CLIPTextEncode", inputs: { text: p.positivePrompt, clip: clipRef } };
  const emptyId = nextId(); nodes[emptyId] = { class_type: "EmptyLatentImage", inputs: { width: p.width, height: p.height, batch_size: 1 } };

  // FluxGuidance conditions the positive embedding
  const guidId = nextId(); nodes[guidId] = { class_type: "FluxGuidance", inputs: { conditioning: [posId, 0], guidance: p.guidance } };

  // Noise + guider + sampler chain (SamplerCustomAdvanced)
  const noiseId  = nextId(); nodes[noiseId]  = { class_type: "RandomNoise",    inputs: { noise_seed: seed } };
  const basicId  = nextId(); nodes[basicId]  = { class_type: "BasicGuider",    inputs: { model: modelRef, conditioning: [guidId, 0] } };
  const splitId  = nextId(); nodes[splitId]  = { class_type: "BasicScheduler", inputs: { model: modelRef, scheduler: p.scheduler, steps: p.steps, denoise: 1.0 } };
  const samplId  = nextId(); nodes[samplId]  = { class_type: "KSamplerSelect", inputs: { sampler_name: p.sampler } };
  const advId    = nextId(); nodes[advId]    = { class_type: "SamplerCustomAdvanced", inputs: { noise: [noiseId, 0], guider: [basicId, 0], sampler: [samplId, 0], sigmas: [splitId, 0], latent_image: [emptyId, 0] } };
  const decodeId = nextId(); nodes[decodeId] = { class_type: "VAEDecode",   inputs: { samples: [advId, 0], vae: vaeRef } };
  const saveId   = nextId(); nodes[saveId]   = { class_type: "SaveImage",   inputs: { filename_prefix: "iterator", images: [decodeId, 0] } };

  return nodes;
}

module.exports = { build, defaults };
