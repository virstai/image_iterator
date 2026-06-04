'use strict';

const profiles = {
  sd15:   require('./sd15'),
  sdxl:   require('./sdxl'),
  flux:   require('./flux'),
  flux2:  require('./flux2'),
  sd3:    require('./sd3'),
  chroma: require('./chroma'),
  anima:  require('./anima'),
};

const ARCH_META = {
  sd15: {
    label:       'SD 1.5 / SD 2.x',
    loadingMode: 'checkpoint',
    fields:      { checkpoint: true, vae: true, cfgScale: true, negativePrompt: true, adapterModel: 'ipa', clipVisionModel: true, adapterWeight: true },
  },
  sdxl: {
    label:       'SDXL',
    loadingMode: 'checkpoint',
    fields:      { checkpoint: true, vae: true, cfgScale: true, negativePrompt: true, refiner: true, adapterModel: 'ipa', clipVisionModel: true, adapterWeight: true },
  },
  flux: {
    label:       'Flux.1',
    loadingMode: 'split-or-checkpoint',
    fields:      { checkpoint: true, unetName: true, clipL: true, t5xxl: true, vaeName: true, guidance: true, adapterModel: 'redux', clipVisionModel: true },
  },
  flux2: {
    label:       'Flux 2 (Dev / Klein)',
    loadingMode: 'split',
    fields:      { unetName: true, clipName: true, vaeName: true, guidance: true },
  },
  sd3: {
    label:       'SD 3 / SD 3.5',
    loadingMode: 'checkpoint',
    fields:      { checkpoint: true, vae: true, cfgScale: true, negativePrompt: true },
  },
  chroma: {
    label:       'ChromaHD',
    loadingMode: 'split',
    fields:      { unetName: true, clipName: true, vaeName: true, guidance: true, negativePrompt: true },
    notes:       'No custom nodes required. Needs a T5 encoder (e.g. t5xxl_flan_latest_float8_e4m3fn_scaled_stochastic.safetensors) in the text_encoders folder.',
  },
  anima: {
    label:       'Anima',
    loadingMode: 'split',
    fields:      { unetName: true, clipL: true, vaeName: true, cfgScale: true },
    notes:       'Requires Qwen-3 text encoder (qwen_3_06b_base.safetensors) and Qwen-Image VAE. The er_sde sampler is available in recent ComfyUI builds or via the RES4LYF custom node pack.',
  },
};

function buildWorkflow(modelConfig, generationParams) {
  const { architecture } = modelConfig;
  if (!architecture) throw new Error('Model config is missing architecture.');
  const profile = profiles[architecture];
  if (!profile) throw new Error(`Unknown architecture "${architecture}". Valid: ${Object.keys(profiles).join(', ')}`);
  // Strip null/undefined so each profile's defaults fill in properly
  const merged = { ...modelConfig, ...generationParams };
  const params = Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null));
  return { workflow: profile.build(params), architecture };
}

function getDefaults(architecture) {
  const profile = profiles[architecture];
  if (!profile) throw new Error(`Unknown architecture: ${architecture}`);
  return { ...profile.defaults };
}

module.exports = {
  buildWorkflow,
  getDefaults,
  architectures: Object.keys(profiles),
  archMeta: ARCH_META,
};
