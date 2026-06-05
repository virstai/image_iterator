'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { build, defaults } = require('../../../src/workflows/wanvideo');

const BASE = {
  unetName:       'wan_model.safetensors',
  vaeName:        'wan_vae.safetensors',
  clipName:       'umt5.safetensors',
  positivePrompt: 'a red balloon floating',
};

const REF = { filename: 'ref.png', subfolder: '' };

function nodeTypes(workflow) {
  return Object.values(workflow).map(n => n.class_type);
}

test('wanvideo: contains all required wrapper node types', () => {
  const wf = build(BASE);
  const types = nodeTypes(wf);
  assert.ok(types.includes('WanVideoModelLoader'),        'WanVideoModelLoader');
  assert.ok(types.includes('WanVideoVAELoader'),          'WanVideoVAELoader');
  assert.ok(types.includes('CLIPLoader'),                 'CLIPLoader');
  assert.ok(types.includes('CLIPTextEncode'),             'CLIPTextEncode');
  assert.ok(types.includes('WanVideoTextEmbedBridge'),    'WanVideoTextEmbedBridge');
  assert.ok(types.includes('WanVideoSampler'),            'WanVideoSampler');
  assert.ok(types.includes('WanVideoDecode'),             'WanVideoDecode');
  assert.ok(types.includes('CreateVideo'),                'CreateVideo');
  assert.ok(types.includes('SaveVideo'),                  'SaveVideo');
});

test('wanvideo: no LoadImage without inputRef', () => {
  const wf = build(BASE);
  assert.ok(!nodeTypes(wf).includes('LoadImage'), 'no LoadImage without ref');
  assert.ok(!nodeTypes(wf).includes('WanVideoImageToVideoEncode'), 'no I2V encode without ref');
});

test('wanvideo I2V: includes LoadImage and WanVideoImageToVideoEncode', () => {
  const wf = build({ ...BASE, inputRef: REF, isI2V: true });
  const types = nodeTypes(wf);
  assert.ok(types.includes('LoadImage'),                    'LoadImage');
  assert.ok(types.includes('WanVideoImageToVideoEncode'),   'WanVideoImageToVideoEncode');
});

test('wanvideo: WanVideoVAELoader uses vaeName', () => {
  const wf = build(BASE);
  const vaeLoader = Object.values(wf).find(n => n.class_type === 'WanVideoVAELoader');
  assert.equal(vaeLoader.inputs.model_name, 'wan_vae.safetensors');
});

test('wanvideo: WanVideoModelLoader uses unetName (no vae)', () => {
  const wf = build(BASE);
  const loader = Object.values(wf).find(n => n.class_type === 'WanVideoModelLoader');
  assert.equal(loader.inputs.model, 'wan_model.safetensors');
  assert.equal(loader.inputs.vae, undefined, 'VAE not on model loader');
});

test('wanvideo: CLIPLoader uses clipName with type wan', () => {
  const wf = build(BASE);
  const cl = Object.values(wf).find(n => n.class_type === 'CLIPLoader');
  assert.equal(cl.inputs.clip_name, 'umt5.safetensors');
  assert.equal(cl.inputs.type, 'wan');
});

test('wanvideo: WanVideoSampler applies cfg and steps overrides', () => {
  const wf = build({ ...BASE, steps: 25, guidance: 4.5 });
  const sampler = Object.values(wf).find(n => n.class_type === 'WanVideoSampler');
  assert.equal(sampler.inputs.steps, 25);
  assert.equal(sampler.inputs.cfg,   4.5);
});

test('wanvideo: CreateVideo uses fps and SaveVideo is present', () => {
  const wf = build({ ...BASE, fps: 24 });
  const cv = Object.values(wf).find(n => n.class_type === 'CreateVideo');
  const sv = Object.values(wf).find(n => n.class_type === 'SaveVideo');
  assert.equal(cv.inputs.fps, 24, 'fps passed to CreateVideo');
  assert.ok(sv, 'SaveVideo present');
});

test('wanvideo MoE: two WanVideoModelLoaders and two WanVideoSamplers', () => {
  const wf = build({ ...BASE, unetName2: 'wan_low_noise.safetensors', inputRef: REF, isI2V: true });
  const loaders  = Object.values(wf).filter(n => n.class_type === 'WanVideoModelLoader');
  const samplers = Object.values(wf).filter(n => n.class_type === 'WanVideoSampler');
  assert.equal(loaders.length,  2, 'two model loaders for MoE');
  assert.equal(samplers.length, 2, 'two samplers for cascade');
});

test('wanvideo MoE: cascade sampler start/end steps are split correctly', () => {
  const steps = 20;
  const wf = build({ ...BASE, unetName2: 'wan_low_noise.safetensors', steps, inputRef: REF, isI2V: true });
  const samplers = Object.values(wf).filter(n => n.class_type === 'WanVideoSampler');
  const split = Math.ceil(steps / 2);
  const first  = samplers.find(s => s.inputs.start_step === 0);
  const second = samplers.find(s => s.inputs.start_step === split);
  assert.ok(first,  'first sampler starts at 0');
  assert.ok(second, 'second sampler starts at split');
  assert.equal(first.inputs.end_step,   split, 'first ends at split');
  assert.equal(second.inputs.end_step,  steps, 'second ends at total steps');
});
