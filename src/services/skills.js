'use strict';

const fs   = require('fs');
const path = require('path');

const skillsDir = () => process.env.SKILLS_DIR || path.join(__dirname, '../../data/skills');
const MAX_NOTES = 10;

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
  return { modelId, modelLabel, architecture, skill: null, skillUpdatedAt: null, outcomes: { accepts: 0, rejects: 0, notes: [] } };
}

// Record a single iteration outcome.
function record(modelId, modelLabel, architecture, verdict, diagnosis) {
  const existing = load(modelId) ?? blankData(modelId, modelLabel, architecture);

  if (!existing.outcomes) existing.outcomes = { accepts: 0, rejects: 0, notes: [] };
  const o = existing.outcomes;

  if (verdict === 'ACCEPT') o.accepts++;
  else                      o.rejects++;

  o.notes.push({ verdict, diagnosis });
  if (o.notes.length > MAX_NOTES) o.notes.shift();

  save(existing);
}

function setSkill(modelId, skillText) {
  const existing = load(modelId);
  if (!existing) return;
  existing.skill          = skillText;
  existing.skillUpdatedAt = new Date().toISOString();
  save(existing);
}

function getSummary(modelId) {
  const data = load(modelId);
  if (!data) return null;

  if (data.skill) {
    return `Prompt engineering notes for this model (learned from previous sessions):\n${data.skill}`;
  }

  const o = data.outcomes;
  if (!o || (o.accepts + o.rejects) === 0) return null;

  const total  = o.accepts + o.rejects;
  const rate   = Math.round((o.accepts / total) * 100);
  const recent = (o.notes ?? []).slice(-3);
  let summary  = `Outcome history for this model: ${o.accepts}/${total} accepted (${rate}%)`;
  if (recent.length) {
    summary += `\nRecent: ${recent.map(n => `${n.verdict === 'ACCEPT' ? '✓' : '✗'} "${n.diagnosis}"`).join('; ')}`;
  }
  return summary;
}

function get(modelId) {
  return load(modelId);
}

module.exports = { record, setSkill, getSummary, get };
