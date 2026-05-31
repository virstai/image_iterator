'use strict';

const fs   = require('fs');
const path = require('path');

const skillsDir = () => process.env.SKILLS_DIR || path.join(__dirname, '../../data/skills');

function skillPath(modelId) {
  return path.join(skillsDir(), `${modelId}.json`);
}

function ensureDir() {
  fs.mkdirSync(skillsDir(), { recursive: true });
}

function load(modelId) {
  try { return JSON.parse(fs.readFileSync(skillPath(modelId), 'utf8')); } catch { return null; }
}

function save(data) {
  ensureDir();
  fs.writeFileSync(skillPath(data.modelId), JSON.stringify(data, null, 2));
}

function blankData(modelId, modelLabel, architecture) {
  return { modelId, modelLabel, architecture, skill: null, skillUpdatedAt: null, outcomes: { accepts: 0, rejects: 0 }, notes: [] };
}

function record(modelId, modelLabel, architecture, verdict) {
  const existing = load(modelId) ?? blankData(modelId, modelLabel, architecture);
  if (!existing.outcomes) existing.outcomes = { accepts: 0, rejects: 0 };
  const o = existing.outcomes;
  if (verdict === 'ACCEPT') o.accepts++;
  else                      o.rejects++;
  save(existing);
}

function setSkill(modelId, skillText) {
  const existing = load(modelId);
  if (!existing) return;
  existing.skill          = skillText;
  existing.skillUpdatedAt = new Date().toISOString();
  save(existing);
}

function saveNotes(modelId, notes) {
  const existing = load(modelId);
  if (!existing) return;
  existing.notes = notes;
  save(existing);
}

// Returns skill text + any enabled enforce/blacklist notes for injection into LLM prompts.
function getSummary(modelId) {
  const data = load(modelId);
  if (!data) return null;

  const parts = [];

  if (data.skill) {
    parts.push(`Prompt engineering notes for this model (learned from previous sessions):\n${data.skill}`);
  }

  const enabledNotes = (data.notes ?? []).filter(n => n.enabled);

  const enforced = enabledNotes.filter(n => n.type === 'enforce');
  if (enforced.length) {
    parts.push(`Active style enforcements (MUST apply to every prompt):\n${enforced.map(n => `- ${n.text}`).join('\n')}`);
  }

  const blacklistWords = enabledNotes.filter(n => n.type === 'blacklist').flatMap(n => n.words ?? []);
  if (blacklistWords.length) {
    parts.push(`Words to avoid in all prompts (blacklisted): ${blacklistWords.join(', ')}`);
  }

  if (parts.length) return parts.join('\n\n');

  // Fallback: raw outcome counts if no skill yet
  const o = data.outcomes;
  if (!o || (o.accepts + o.rejects) === 0) return null;
  const total = o.accepts + o.rejects;
  const rate  = Math.round((o.accepts / total) * 100);
  return `Outcome history for this model: ${o.accepts}/${total} accepted (${rate}%)`;
}

// Returns enabled blacklist words for hard post-processing of generated prompts.
function getBlacklist(modelId) {
  const data = load(modelId);
  if (!data) return [];
  return (data.notes ?? [])
    .filter(n => n.enabled && n.type === 'blacklist')
    .flatMap(n => n.words ?? []);
}

function get(modelId) {
  return load(modelId);
}

module.exports = { record, setSkill, saveNotes, getSummary, getBlacklist, get };
