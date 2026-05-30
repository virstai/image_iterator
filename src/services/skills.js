'use strict';

const fs   = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../../data/skills');
const MAX_NOTES  = 10;

function skillPath(modelId) {
  return path.join(SKILLS_DIR, `${modelId}.json`);
}

function ensureDir() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function load(modelId) {
  try { return JSON.parse(fs.readFileSync(skillPath(modelId), 'utf8')); } catch { return null; }
}

function save(data) {
  ensureDir();
  fs.writeFileSync(skillPath(data.modelId), JSON.stringify(data, null, 2));
}

// Record a single iteration outcome.
function record(modelId, modelLabel, architecture, format, verdict, diagnosis) {
  const existing = load(modelId) ?? { modelId, modelLabel, architecture, skill: null, skillUpdatedAt: null, formats: {} };

  if (!existing.formats[format]) existing.formats[format] = { accepts: 0, rejects: 0, notes: [] };

  const entry = existing.formats[format];
  if (verdict === 'ACCEPT') entry.accepts++;
  else                      entry.rejects++;

  entry.notes.push({ verdict, diagnosis });
  if (entry.notes.length > MAX_NOTES) entry.notes.shift();

  save(existing);
}

// Persist a freshly synthesised skill text.
function setSkill(modelId, skillText) {
  const existing = load(modelId);
  if (!existing) return;
  existing.skill            = skillText;
  existing.skillUpdatedAt   = new Date().toISOString();
  save(existing);
}

// Returns text for injection into prompts.
// Prefers the synthesised skill; falls back to raw stats if skill not yet written.
function getSummary(modelId) {
  const data = load(modelId);
  if (!data) return null;

  if (data.skill) {
    return `Prompt engineering notes for this model (learned from previous sessions):\n${data.skill}`;
  }

  // Fall back to raw stats until the first skill synthesis runs
  const entries = Object.entries(data.formats ?? {}).filter(([, s]) => s.accepts + s.rejects > 0);
  if (!entries.length) return null;

  const lines = ['Prompt format history for this model:'];
  for (const [format, stats] of entries) {
    const total = stats.accepts + stats.rejects;
    const rate  = Math.round((stats.accepts / total) * 100);
    let line    = `- ${format}: ${stats.accepts}/${total} accepted (${rate}%)`;
    const recent = stats.notes.slice(-3);
    if (recent.length) {
      line += ` | ${recent.map(n => `${n.verdict === 'ACCEPT' ? '✓' : '✗'} "${n.diagnosis}"`).join('; ')}`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// Returns full skill data for UI display, or null if none exists.
function get(modelId) {
  return load(modelId);
}

module.exports = { record, setSkill, getSummary, get };
