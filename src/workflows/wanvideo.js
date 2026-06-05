'use strict';

// WanVideo workflow builder.
// Supports both Text-to-Video (T2V) and Image-to-Video (I2V) modes.
const defaults = {
  width:     832,
  height:    480,
  frames:    49,
  fps:       16,
  steps:     30,
  guidance:  6.0,
  sampler:   'euler',
  scheduler: 'simple',
};

function build(params) {
  const {
    unetName, vaeName, clipName,
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
    isI2V     = false,
  } = params;

  const imgPath = inputRef
    ? (inputRef.subfolder ? `${inputRef.subfolder}/${inputRef.filename}` : inputRef.filename)
    : null;

  const nodes = {
    "1": {
      class_type: "WanVideoModelLoader",
      inputs: { model: unetName, vae: vaeName, precision: "bf16", fp8_unet: false, load_device: "cpu" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: clipName, type: "wan" },
    },
    "3": {
      class_type: "WanVideoTextEncode",
      inputs: { clip: ["2", 0], positive_text: positivePrompt, negative_text: "", force_offload: true },
    },
    "4": {
      class_type: "EmptyWanLatentVideo",
      inputs: { batch_size: 1, width, height, length: frames },
    },
  };

  if (isI2V && imgPath) {
    nodes["5"] = {
      class_type: "LoadImage",
      inputs: { image: imgPath },
    };
    nodes["6"] = {
      class_type: "WanVideoImageToVideo",
      inputs: { pipeline: ["1", 0], clip_vision: ["2", 1], image: ["5", 0], width, height, length: frames },
    };
    nodes["7"] = {
      class_type: "KSampler",
      inputs: {
        model: ["6", 0], positive: ["3", 0], negative: ["3", 1],
        latent_image: ["4", 0], seed, steps, cfg: guidance,
        sampler_name: sampler, scheduler, denoise: 1.0,
      },
    };
    nodes["8"] = {
      class_type: "WanVideoVAEDecode",
      inputs: {
        vae: ["1", 1], samples: ["7", 0],
        enable_vae_tiling: true,
        tile_sample_min_height: 272, tile_sample_min_width: 272,
        tile_overlap_factor_height: 0.2, tile_overlap_factor_width: 0.2,
      },
    };
    nodes["9"] = {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["8", 0], frame_rate: fps, loop_count: 0,
        filename_prefix: "iterator_video", format: "video/h264-mp4",
        pingpong: false, save_output: true,
      },
    };
  } else {
    nodes["5"] = {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0], positive: ["3", 0], negative: ["3", 1],
        latent_image: ["4", 0], seed, steps, cfg: guidance,
        sampler_name: sampler, scheduler, denoise: 1.0,
      },
    };
    nodes["6"] = {
      class_type: "WanVideoVAEDecode",
      inputs: {
        vae: ["1", 1], samples: ["5", 0],
        enable_vae_tiling: true,
        tile_sample_min_height: 272, tile_sample_min_width: 272,
        tile_overlap_factor_height: 0.2, tile_overlap_factor_width: 0.2,
      },
    };
    nodes["7"] = {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["6", 0], frame_rate: fps, loop_count: 0,
        filename_prefix: "iterator_video", format: "video/h264-mp4",
        pingpong: false, save_output: true,
      },
    };
  }

  return nodes;
}

module.exports = { build, defaults };
