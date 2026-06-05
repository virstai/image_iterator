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

function nodeTypes(workflow) {
  return Object.values(workflow).map(n => n.class_type);
}

test('wanvideo T2V: contains all required node types', () => {
  const wf = build(BASE);
  const types = nodeTypes(wf);
  assert.ok(types.includes('WanVideoModelLoader'),  'WanVideoModelLoader');
  assert.ok(types.includes('CLIPLoader'),           'CLIPLoader');
  assert.ok(types.includes('WanVideoTextEncode'),   'WanVideoTextEncode');
  assert.ok(types.includes('EmptyWanLatentVideo'),  'EmptyWanLatentVideo');
  assert.ok(types.includes('KSampler'),             'KSampler');
  assert.ok(types.includes('WanVideoVAEDecode'),    'WanVideoVAEDecode');
  assert.ok(types.includes('VHS_VideoCombine'),     'VHS_VideoCombine');
});

test('wanvideo T2V: does not include LoadImage', () => {
  const wf = build(BASE);
  assert.ok(!nodeTypes(wf).includes('LoadImage'), 'no LoadImage in T2V mode');
});

test('wanvideo I2V: includes LoadImage and WanVideoImageToVideo', () => {
  const wf = build({ ...BASE, inputRef: { filename: 'ref.png', subfolder: '' }, isI2V: true });
  const types = nodeTypes(wf);
  assert.ok(types.includes('LoadImage'),             'LoadImage');
  assert.ok(types.includes('WanVideoImageToVideo'),  'WanVideoImageToVideo');
});

test('wanvideo T2V: applies default dimensions', () => {
  const wf = build(BASE);
  const latent = Object.values(wf).find(n => n.class_type === 'EmptyWanLatentVideo');
  assert.equal(latent.inputs.width,  defaults.width);
  assert.equal(latent.inputs.height, defaults.height);
  assert.equal(latent.inputs.length, defaults.frames);
});

test('wanvideo T2V: param overrides are applied', () => {
  const wf = build({ ...BASE, width: 1280, height: 720, frames: 25, guidance: 4.5 });
  const latent  = Object.values(wf).find(n => n.class_type === 'EmptyWanLatentVideo');
  const sampler = Object.values(wf).find(n => n.class_type === 'KSampler');
  assert.equal(latent.inputs.width,  1280);
  assert.equal(latent.inputs.height, 720);
  assert.equal(latent.inputs.length, 25);
  assert.equal(sampler.inputs.cfg,   4.5);
});

test('wanvideo T2V: VHS_VideoCombine uses fps and mp4 format', () => {
  const wf = build({ ...BASE, fps: 24 });
  const vhs = Object.values(wf).find(n => n.class_type === 'VHS_VideoCombine');
  assert.equal(vhs.inputs.frame_rate, 24);
  assert.ok(vhs.inputs.format.includes('mp4'), 'MP4 format');
});

test('wanvideo T2V: WanVideoModelLoader uses unetName and vaeName', () => {
  const wf = build(BASE);
  const loader = Object.values(wf).find(n => n.class_type === 'WanVideoModelLoader');
  assert.equal(loader.inputs.model, 'wan_model.safetensors');
  assert.equal(loader.inputs.vae,   'wan_vae.safetensors');
});

test('wanvideo T2V: CLIPLoader uses clipName with type wan', () => {
  const wf = build(BASE);
  const clip = Object.values(wf).find(n => n.class_type === 'CLIPLoader');
  assert.equal(clip.inputs.clip_name, 'umt5.safetensors');
  assert.equal(clip.inputs.type,      'wan');
});
