'use strict';

const fs   = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../../data/sessions');

function ensureDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function saveSession(session) {
  ensureDir();
  const data = { ...session, updatedAt: new Date().toISOString() };
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(data, null, 2));
}

function loadSession(id) {
  try { return JSON.parse(fs.readFileSync(sessionPath(id), 'utf8')); } catch { return null; }
}

function listSessions(limit = 100) {
  ensureDir();
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''))
      .slice(0, limit);
  } catch { return []; }
}

function deleteSession(id) {
  try { fs.unlinkSync(sessionPath(id)); } catch { /* ignore if already gone */ }
}

module.exports = { saveSession, loadSession, listSessions, deleteSession };
