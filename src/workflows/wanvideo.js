'use strict';

// WanVideo 2.2 workflow builder — requires kijai/ComfyUI-WanVideoWrapper.
//
// 14B MoE: pass both unetName (high-noise expert) and unetName2 (low-noise expert).
//   Generates a two-sampler cascade: high-noise model runs first half of steps,
//   low-noise model runs second half, sharing the same I2V image conditioning.
//
// 5B TI2V: pass only unetName. Single sampler, full steps.
//
// Primary mode is I2V (image-to-video) — animates inputRef from a previous step.

const defaults = {
  width:     832,
  height:    480,
  frames:    81,
  fps:       16,
  steps:     20,
  guidance:  6.0,
  shift:     5.0,
  scheduler: 'unipc',
};

function build(params) {
  const {
    unetName, unetName2, vaeName, clipName,
    modelQuantization = 'disabled',
    vaePrecision      = 'bf16',
    positivePrompt = '',
    width     = defaults.width,
    height    = defaults.height,
    frames    = defaults.frames,
    fps       = defaults.fps,
    steps     = defaults.steps,
    guidance  = defaults.guidance,
    shift     = defaults.shift,
    scheduler = defaults.scheduler,
    seed      = Math.floor(Math.random() * 2 ** 32),
    inputRef  = null,
    isI2V     = true,
  } = params;

  const imgPath = inputRef
    ? (inputRef.subfolder ? `${inputRef.subfolder}/${inputRef.filename}` : inputRef.filename)
    : null;

  const isMoE     = !!unetName2;
  const splitStep = isMoE ? Math.ceil(steps / 2) : steps;

  const nodes = {};
  let n = 1;
  const id = () => String(n++);

  // ── Model loader(s) ──────────────────────────────────────────────────────────
  const highModelId = id();
  nodes[highModelId] = {
    class_type: 'WanVideoModelLoader',
    inputs: {
      model:          unetName,
      base_precision: 'bf16',
      quantization:   modelQuantization || 'disabled',
      load_device:    'offload_device',
    },
  };

  let lowModelId = null;
  if (isMoE) {
    lowModelId = id();
    nodes[lowModelId] = {
      class_type: 'WanVideoModelLoader',
      inputs: {
        model:          unetName2,
        base_precision: 'bf16',
        quantization:   'disabled',
        load_device:    'offload_device',
      },
    };
  }

  // ── VAE loader ────────────────────────────────────────────────────────────────
  const vaeId = id();
  nodes[vaeId] = {
    class_type: 'WanVideoVAELoader',
    inputs: { model_name: vaeName, precision: vaePrecision || 'bf16' },
  };

  // ── T5 encoder via native CLIPLoader (supports fp8_e4m3fn_scaled) ────────────
  // WanVideoTextEmbedBridge bridges CLIPTextEncode CONDITIONING → WANVIDEOTEXTEMBEDS,
  // bypassing LoadWanVideoT5TextEncoder which hard-rejects fp8_scaled files.
  const clipLoaderId = id();
  nodes[clipLoaderId] = {
    class_type: 'CLIPLoader',
    inputs: { clip_name: clipName, type: 'wan' },
  };

  const posEncId = id();
  nodes[posEncId] = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: [clipLoaderId, 0], text: positivePrompt },
  };

  const negEncId = id();
  nodes[negEncId] = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: [clipLoaderId, 0], text: '' },
  };

  const textEncId = id();
  nodes[textEncId] = {
    class_type: 'WanVideoTextEmbedBridge',
    inputs: { positive: [posEncId, 0], negative: [negEncId, 0] },
  };

  // ── Image conditioning (I2V) ──────────────────────────────────────────────────
  let imageEmbedsRef = null;
  if (isI2V && imgPath) {
    const loadImgId = id();
    nodes[loadImgId] = {
      class_type: 'LoadImage',
      inputs: { image: imgPath },
    };

    const imgEncId = id();
    nodes[imgEncId] = {
      class_type: 'WanVideoImageToVideoEncode',
      inputs: {
        width,
        height,
        num_frames:           frames,
        noise_aug_strength:   0.0,
        start_latent_strength:1.0,
        end_latent_strength:  1.0,
        force_offload:        true,
        vae:                  [vaeId, 0],
        start_image:          [loadImgId, 0],
      },
    };
    imageEmbedsRef = [imgEncId, 0];
  }

  // ── Sampler(s) ────────────────────────────────────────────────────────────────
  const buildSamplerInputs = (modelRef, startStep, endStep, prevSamplesRef = null) => {
    const inp = {
      model:            modelRef,
      steps,
      cfg:              guidance,
      shift,
      seed,
      force_offload:    true,
      scheduler,
      riflex_freq_index:0,
      text_embeds:      [textEncId, 0],
    };
    if (imageEmbedsRef) inp.image_embeds = imageEmbedsRef;
    if (prevSamplesRef) inp.samples      = prevSamplesRef;
    if (isMoE) {
      inp.start_step = startStep;
      inp.end_step   = endStep;
    }
    return inp;
  };

  let finalSamplesRef;

  if (isMoE) {
    const highSamplerId = id();
    nodes[highSamplerId] = {
      class_type: 'WanVideoSampler',
      inputs: buildSamplerInputs([highModelId, 0], 0, splitStep),
    };

    const lowSamplerId = id();
    nodes[lowSamplerId] = {
      class_type: 'WanVideoSampler',
      inputs: buildSamplerInputs([lowModelId, 0], splitStep, steps, [highSamplerId, 0]),
    };
    finalSamplesRef = [lowSamplerId, 0];
  } else {
    const samplerId = id();
    nodes[samplerId] = {
      class_type: 'WanVideoSampler',
      inputs: buildSamplerInputs([highModelId, 0], 0, steps),
    };
    finalSamplesRef = [samplerId, 0];
  }

  // ── Decode ────────────────────────────────────────────────────────────────────
  const decodeId = id();
  nodes[decodeId] = {
    class_type: 'WanVideoDecode',
    inputs: {
      vae:               [vaeId, 0],
      samples:           finalSamplesRef,
      enable_vae_tiling: false,
      tile_x:            272,
      tile_y:            272,
      tile_stride_x:     144,
      tile_stride_y:     128,
    },
  };

  // ── Output ────────────────────────────────────────────────────────────────────
  const createVideoId = id();
  nodes[createVideoId] = {
    class_type: 'CreateVideo',
    inputs: { images: [decodeId, 0], fps },
  };

  const saveVideoId = id();
  nodes[saveVideoId] = {
    class_type: 'SaveVideo',
    inputs: { video: [createVideoId, 0], filename_prefix: 'iterator_video', format: 'auto', codec: 'auto' },
  };

  return nodes;
}

module.exports = { build, defaults };
