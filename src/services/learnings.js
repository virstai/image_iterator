'use strict';

const fs   = require('fs');
const path = require('path');

const LEARNINGS_PATH = path.join(__dirname, '../../learnings.json');
const MAX_NOTES = 10; // rolling window of recent outcomes per format per model

function load() {
  try { return JSON.parse(fs.readFileSync(LEARNINGS_PATH, 'utf8')); } catch { return {}; }
}

function save(data) {
  fs.writeFileSync(LEARNINGS_PATH, JSON.stringify(data, null, 2));
}

// Record a single iteration outcome. verdict must be 'ACCEPT' or 'REJECT'.
function record(modelId, format, verdict, diagnosis) {
  const data = load();
  if (!data[modelId])         data[modelId] = {};
  if (!data[modelId][format]) data[modelId][format] = { accepts: 0, rejects: 0, notes: [] };

  const entry = data[modelId][format];
  if (verdict === 'ACCEPT') entry.accepts++;
  else                      entry.rejects++;

  entry.notes.push({ verdict, diagnosis });
  if (entry.notes.length > MAX_NOTES) entry.notes.shift();

  save(data);
}

// Returns a compact summary string for injection into prompts, or null if no data yet.
function getSummary(modelId) {
  const data      = load();
  const modelData = data[modelId];
  if (!modelData) return null;

  const entries = Object.entries(modelData).filter(([, s]) => s.accepts + s.rejects > 0);
  if (!entries.length) return null;

  const lines = ['Prompt format history for this model — use this to guide your format choice:'];

  for (const [format, stats] of entries) {
    const total = stats.accepts + stats.rejects;
    const rate  = Math.round((stats.accepts / total) * 100);
    let line = `- ${format}: ${stats.accepts}/${total} accepted (${rate}%)`;

    // Include the most recent 3 notes so the model can see why things failed or worked
    const recent = stats.notes.slice(-3);
    if (recent.length) {
      const noteStr = recent.map(n => `${n.verdict === 'ACCEPT' ? '✓' : '✗'} "${n.diagnosis}"`).join('; ');
      line += ` | recent: ${noteStr}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

// Returns the raw per-format data for a model, or null if none exists.
function get(modelId) {
  const data = load();
  return data[modelId] ?? null;
}

module.exports = { record, getSummary, get };
