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
  guidance:  5.0,
  sampler:   'dpm++_sde',
  scheduler: 'simple',
};

function build(params) {
  const {
    unetName, unetName2, vaeName, clipName,
    positivePrompt = '',
    width     = defaults.width,
    height    = defaults.height,
    frames    = defaults.frames,
    fps       = defaults.fps,
    steps     = defaults.steps,
    guidance  = defaults.guidance,
    sampler   = defaults.sampler,
    scheduler = defaults.scheduler,
    seed      = Math.floor(Math.random() * 2 ** 32),
    inputRef  = null,
    isI2V     = true,
  } = params;

  const imgPath = inputRef
    ? (inputRef.subfolder ? `${inputRef.subfolder}/${inputRef.filename}` : inputRef.filename)
    : null;

  const isMoE      = !!unetName2;
  const splitStep  = isMoE ? Math.ceil(steps / 2) : steps;

  const nodes = {};
  let n = 1;
  const id = () => String(n++);

  // ── Model loader(s) ──────────────────────────────────────────────────────────
  const highModelId = id();
  nodes[highModelId] = {
    class_type: 'WanVideoModelLoader',
    inputs: {
      model:          unetName,
      load_dtype:     'fp16_fast',
      quantization:   'fp8_e4m3fn_scaled',
      offload_device: 'offload_device',
      attention_mode: 'sageattn',
    },
  };

  let lowModelId = null;
  if (isMoE) {
    lowModelId = id();
    nodes[lowModelId] = {
      class_type: 'WanVideoModelLoader',
      inputs: {
        model:          unetName2,
        load_dtype:     'fp16_fast',
        quantization:   'fp8_e4m3fn_scaled',
        offload_device: 'offload_device',
        attention_mode: 'sageattn',
      },
    };
  }

  // ── VAE loader (separate from model loader in WanVideoWrapper) ────────────────
  const vaeId = id();
  nodes[vaeId] = {
    class_type: 'WanVideoVAELoader',
    inputs: { model: vaeName, dtype: 'bf16' },
  };

  // ── T5 text encoder ───────────────────────────────────────────────────────────
  const t5Id = id();
  nodes[t5Id] = {
    class_type: 'LoadWanVideoT5TextEncoder',
    inputs: {
      model:          clipName,
      dtype:          'bf16',
      offload_device: 'offload_device',
      quantization:   'disabled',
    },
  };

  // ── Text encode ───────────────────────────────────────────────────────────────
  const textEncId = id();
  nodes[textEncId] = {
    class_type: 'WanVideoTextEncode',
    inputs: {
      t5:             [t5Id, 0],
      positive_text:  positivePrompt,
      negative_text:  '',
      cfg_use:        true,
      encode_device:  'gpu',
    },
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
        vae:                  [vaeId, 0],
        start_image:          [loadImgId, 0],
        width,
        height,
        num_frames:           frames,
        end_image_strength:   0,
        batch_size:           1,
      },
    };
    imageEmbedsRef = [imgEncId, 0];
  }

  // ── Sampler(s) ────────────────────────────────────────────────────────────────
  const buildSamplerInputs = (modelRef, startStep, endStep, prevSamplesRef = null) => {
    const inp = {
      model:      modelRef,
      text_embeds:[textEncId, 0],
      steps,
      cfg:        guidance,
      seed,
      seed_mode:  'fixed',
      scheduler,
      start_step: startStep,
      end_step:   endStep,
    };
    if (imageEmbedsRef) inp.image_embeds = imageEmbedsRef;
    if (prevSamplesRef) inp.samples      = prevSamplesRef;
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
      tile_t:            144,
      overlap:           128,
    },
  };

  // ── Output ────────────────────────────────────────────────────────────────────
  const combineId = id();
  nodes[combineId] = {
    class_type: 'VHS_VideoCombine',
    inputs: {
      images:          [decodeId, 0],
      frame_rate:      fps,
      loop_count:      0,
      filename_prefix: 'iterator_video',
      format:          'video/h264-mp4',
      pingpong:        false,
      save_output:     true,
    },
  };

  return nodes;
}

module.exports = { build, defaults };
