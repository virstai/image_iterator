'use strict';

const express = require('express');
const router  = express.Router();
const config    = require('../services/config');
const comfyui   = require('../services/comfyui');
const ollama    = require('../services/ollama');
const skills    = require('../services/skills');
const { refreshSkill } = require('../services/skillRefresher');
const { architectures, archMeta, getDefaults } = require('../workflows');

// GET /api/sessions/config
router.get('/config', (req, res) => res.json(config.load()));

// PATCH /api/sessions/config — update global settings (urls, ollamaModel, activeModel, maxIterations)
router.patch('/config', (req, res) => {
  try {
    // Strip model configs from here — use the /models endpoints instead
    const { models: _ignored, ...updates } = req.body;
    res.json(config.save(updates));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Model registry ─────────────────────────────────────────────────────────

// GET /api/sessions/models/list — all configured models
router.get('/models/list', (req, res) => {
  const { models, activeModel } = config.load();
  res.json({ models, activeModel });
});

// PUT /api/sessions/models/:id — create or replace a model config
router.put('/models/:id', (req, res) => {
  try {
    const saved = config.saveModel(req.params.id, req.body);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/sessions/models — create a new model (id derived from label)
router.post('/models', (req, res) => {
  try {
    const saved = config.saveModel(null, req.body);
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/sessions/models/:id
router.delete('/models/:id', (req, res) => {
  config.deleteModel(req.params.id);
  res.status(204).end();
});

// GET /api/sessions/skills/:modelId
router.get('/skills/:modelId', (req, res) => {
  res.json(skills.get(req.params.modelId) ?? {});
});

// POST /api/sessions/skills/:modelId/refresh — manually trigger a skill refresh with an optional correction note
router.post('/skills/:modelId/refresh', async (req, res) => {
  const { note = '' } = req.body;
  const cfg = config.load();
  const modelConfig = cfg.models?.[req.params.modelId];
  if (!modelConfig) return res.status(404).json({ error: 'Model not found' });
  if (!cfg.ollamaModel) return res.status(400).json({ error: 'No Ollama model configured' });

  try {
    await refreshSkill(req.params.modelId, modelConfig.label, modelConfig.architecture, cfg.ollamaModel, note.trim());
    res.json(skills.get(req.params.modelId) ?? {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sessions/skills/:modelId/notes
router.patch('/skills/:modelId/notes', (req, res) => {
  try {
    skills.saveNotes(req.params.modelId, req.body.notes ?? []);
    res.json(skills.get(req.params.modelId) ?? {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Architecture metadata ──────────────────────────────────────────────────

// GET /api/sessions/architectures
router.get('/architectures', (req, res) => {
  const result = {};
  for (const arch of architectures) {
    result[arch] = { ...archMeta[arch], defaults: getDefaults(arch) };
  }
  res.json(result);
});

// ── Available assets from ComfyUI + Ollama ────────────────────────────────

// GET /api/sessions/assets — checkpoints, vaes, clips, unets + ollama models
router.get('/assets', async (req, res) => {
  const [comfyAssets, ollamaModels] = await Promise.allSettled([
    comfyui.getAssets(),
    ollama.listModels(),
  ]);

  const comfy  = comfyAssets.status  === 'fulfilled' ? comfyAssets.value  : { checkpoints: [], vaes: [], clips: [], unets: [], errors: [comfyAssets.reason.message] };
  const oModels = ollamaModels.status === 'fulfilled' ? ollamaModels.value : [];

  res.json({
    ollama:  oModels.map(m => m.name),
    comfyui: comfy,
    errors:  [...(comfy.errors || []), ...(ollamaModels.status === 'rejected' ? [ollamaModels.reason.message] : [])],
  });
});

module.exports = router;
