'use strict';

const fs   = require('fs');
const path = require('path');

const dataDir    = () => process.env.DATA_DIR    || path.join(__dirname, '../../data');
const configPath = () => path.join(dataDir(), 'config.json');

const GLOBAL_DEFAULTS = {
  ollamaUrl:              'http://127.0.0.1:11434',
  comfyuiUrl:             'http://127.0.0.1:8188',
  ollamaModel:            '',
  activeModel:            null,
  maxIterations:          3,
  humanReview:            false,
  acceptanceGracePeriod:  10, // seconds; 0 = disabled
  models:                 {},
};

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { /* no file yet */ }

  return {
    ...GLOBAL_DEFAULTS,
    ...saved,
    ...(process.env.OLLAMA_URL    && { ollamaUrl:   process.env.OLLAMA_URL }),
    ...(process.env.COMFYUI_URL   && { comfyuiUrl:  process.env.COMFYUI_URL }),
    ...(process.env.OLLAMA_MODEL  && { ollamaModel: process.env.OLLAMA_MODEL }),
  };
}

function save(updates) {
  const next = { ...load(), ...updates };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

// Returns the active model config object, or throws if none is set / not found.
function activeModel() {
  const cfg = load();
  if (!cfg.activeModel) throw new Error('No active model selected. Configure one in Settings.');
  const model = cfg.models[cfg.activeModel];
  if (!model) throw new Error(`Active model "${cfg.activeModel}" not found in config.`);
  return model;
}

// Upsert a model entry. id is the key; if omitted a slug is generated from the label.
function saveModel(id, modelData) {
  const cfg = load();
  const resolvedId = id || slugify(modelData.label);
  cfg.models[resolvedId] = { ...modelData, id: resolvedId };
  save(cfg);
  return cfg.models[resolvedId];
}

function deleteModel(id) {
  const cfg = load();
  delete cfg.models[id];
  if (cfg.activeModel === id) cfg.activeModel = null;
  save(cfg);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now().toString();
}

module.exports = { load, save, activeModel, saveModel, deleteModel };
