import { reactive } from 'vue';
import { api } from '../api.js';

export const configState = reactive({
  config:   {},
  assets:   { llm: [], comfyui: { checkpoints: [], vaes: [], clips: [], unets: [] } },
  archMeta: {},
});

export async function loadConfig() {
  const [config, archMeta] = await Promise.all([
    api('GET', '/api/sessions/config'),
    api('GET', '/api/sessions/architectures'),
  ]);
  configState.config   = config;
  configState.archMeta = archMeta;
}

export async function saveConfig(updates) {
  configState.config = await api('PATCH', '/api/sessions/config', updates);
  return configState.config;
}

export async function loadAssets() {
  configState.assets = await api('GET', '/api/sessions/assets');
  return configState.assets;
}

export async function saveModel(id, data) {
  if (id) {
    await api('PUT', `/api/sessions/models/${id}`, data);
  } else {
    await api('POST', '/api/sessions/models', data);
  }
  configState.config = await api('GET', '/api/sessions/config');
}

export async function deleteModel(id) {
  await api('DELETE', `/api/sessions/models/${id}`);
  configState.config = await api('GET', '/api/sessions/config');
}

export async function setActiveModel(id) {
  configState.config = await api('PATCH', '/api/sessions/config', { activeModel: id || null });
}

export async function loadSkill(modelId) {
  return api('GET', `/api/sessions/skills/${encodeURIComponent(modelId)}`);
}

export async function saveNotes(modelId, notes) {
  return api('PATCH', `/api/sessions/skills/${encodeURIComponent(modelId)}/notes`, { notes });
}

export async function refreshSkill(modelId, note = '') {
  return api('POST', `/api/sessions/skills/${encodeURIComponent(modelId)}/refresh`, { note });
}
