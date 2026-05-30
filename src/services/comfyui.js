'use strict';

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const config = require('./config');

const baseUrl = () => config.load().comfyuiUrl;
const wsUrl   = () => baseUrl().replace(/^http/, 'ws');

// ── Generation ─────────────────────────────────────────────────────────────

async function generate(workflow, onProgress) {
  const clientId = uuidv4();
  const promptId = await queuePrompt(workflow, clientId);
  await waitForCompletion(promptId, clientId, onProgress);
  return getOutputImages(promptId);
}

async function queuePrompt(workflow, clientId) {
  const res = await fetch(`${baseUrl()}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`ComfyUI queue error ${res.status}: ${await res.text()}`);
  return (await res.json()).prompt_id;
}

function waitForCompletion(promptId, clientId, onProgress) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl()}/ws?clientId=${clientId}`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('ComfyUI timed out after 5 minutes')); }, 5 * 60 * 1000);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'progress' && msg.data?.prompt_id === promptId) {
          onProgress?.(Math.round((msg.data.value / msg.data.max) * 100));
        }
        if (msg.type === 'executing' && msg.data?.prompt_id === promptId && msg.data.node === null) {
          clearTimeout(timeout); ws.close(); resolve();
        }
      } catch { /* ignore non-JSON */ }
    });

    ws.on('error', (err) => { clearTimeout(timeout); reject(new Error(`ComfyUI WS error: ${err.message}`)); });
  });
}

async function getOutputImages(promptId) {
  const res = await fetch(`${baseUrl()}/history/${promptId}`);
  if (!res.ok) throw new Error(`ComfyUI history error ${res.status}`);
  const data = await res.json();
  const entry = data[promptId];
  if (!entry) throw new Error('No history entry for prompt');
  const images = [];
  for (const out of Object.values(entry.outputs || {})) {
    if (out.images) images.push(...out.images);
  }
  return { images };
}

// ── Model/asset lists ──────────────────────────────────────────────────────

async function fetchInputList(nodeType, inputName) {
  const res = await fetch(`${baseUrl()}/object_info/${nodeType}`);
  if (!res.ok) throw new Error(`ComfyUI object_info error ${res.status}`);
  const data = await res.json();
  return data?.[nodeType]?.input?.required?.[inputName]?.[0] ?? [];
}

async function getAssets() {
  const [checkpoints, vaes, clips, unets] = await Promise.allSettled([
    fetchInputList('CheckpointLoaderSimple', 'ckpt_name'),
    fetchInputList('VAELoader',              'vae_name'),
    fetchInputList('CLIPLoader',             'clip_name'),
    fetchInputList('UNETLoader',             'unet_name'),
  ]);

  return {
    checkpoints: checkpoints.status === 'fulfilled' ? checkpoints.value : [],
    vaes:        vaes.status        === 'fulfilled' ? vaes.value        : [],
    clips:       clips.status       === 'fulfilled' ? clips.value       : [],
    unets:       unets.status       === 'fulfilled' ? unets.value       : [],
    errors: [checkpoints, vaes, clips, unets]
      .filter(r => r.status === 'rejected')
      .map(r => r.reason.message),
  };
}

module.exports = { generate, getAssets };
