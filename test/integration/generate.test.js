'use strict';

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const http    = require('http');
const fs      = require('fs');
const os      = require('os');
const path    = require('path');
const { WebSocketServer } = require('ws');

// 1x1 transparent PNG — returned by the fake /view endpoint so base64 encoding works
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// ── State shared between fake servers and tests ───────────────────────────────
let lastPromptId   = 'test-prompt-001';
let reviewVerdict  = 'ACCEPT'; // tests can change this

// ── Fake Ollama ───────────────────────────────────────────────────────────────
function makeFakeOllama() {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/chat') {
      res.writeHead(404); return res.end();
    }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const { messages } = JSON.parse(body);

      // Review requests mention "reviewing" in the system prompt
      const isReview = messages.some(m =>
        typeof m.content === 'string' && m.content.toLowerCase().includes('reviewing'),
      );

      const text = isReview
        ? `This image has been assessed.\nVERDICT: ${reviewVerdict}\nDIAGNOSIS: ${reviewVerdict === 'ACCEPT' ? 'looks good' : 'subject not visible'}`
        : 'a detailed landscape with mountains, high quality, sharp focus';

      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      for (const word of text.split(' ')) {
        res.write(JSON.stringify({ message: { role: 'assistant', content: word + ' ' }, done: false }) + '\n');
      }
      res.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
      res.end();
    });
  });
}

// ── Fake ComfyUI (HTTP + WebSocket) ───────────────────────────────────────────
function makeFakeComfyUI() {
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/prompt') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: lastPromptId }));
      });
      return;
    }

    if (req.url.startsWith('/history/')) {
      const pid = req.url.split('/').pop();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        [pid]: { outputs: { '7': { images: [{ filename: 'fake_00001_.png', subfolder: '', type: 'output' }] } } },
      }));
      return;
    }

    if (req.url.startsWith('/view')) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(TINY_PNG);
      return;
    }

    if (req.url.startsWith('/object_info/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }

    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', ws => {
    const pid = lastPromptId;
    setImmediate(() => {
      ws.send(JSON.stringify({ type: 'progress', data: { prompt_id: pid, value: 5,  max: 10 } }));
      ws.send(JSON.stringify({ type: 'progress', data: { prompt_id: pid, value: 10, max: 10 } }));
      ws.send(JSON.stringify({ type: 'executing', data: { prompt_id: pid, node: null } }));
    });
  });

  return httpServer;
}

// ── SSE helper ────────────────────────────────────────────────────────────────
async function collectSSE(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const events = [];
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop();
    for (const block of blocks) {
      const eMatch = block.match(/^event: (.+)$/m);
      const dMatch = block.match(/^data: (.+)$/m);
      if (eMatch && dMatch) {
        try { events.push({ event: eMatch[1].trim(), data: JSON.parse(dMatch[1]) }); } catch {}
      }
    }
  }
  return events;
}

// ── Test lifecycle ────────────────────────────────────────────────────────────
let appPort;
let ollamaServer, comfyServer, appServer;
let tmpDir;

before(async () => {
  // Temp data directory with a test model config
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ii-int-test-'));
  process.env.DATA_DIR     = tmpDir;
  process.env.SESSIONS_DIR = path.join(tmpDir, 'sessions');
  process.env.SKILLS_DIR   = path.join(tmpDir, 'skills');

  // Start fake Ollama and ComfyUI on OS-assigned ports
  ollamaServer = makeFakeOllama();
  comfyServer  = makeFakeComfyUI();
  await Promise.all([
    new Promise(r => ollamaServer.listen(0, r)),
    new Promise(r => comfyServer.listen(0, r)),
  ]);
  const ollamaPort = ollamaServer.address().port;
  const comfyPort  = comfyServer.address().port;

  // Override URLs via env (config.js respects these)
  process.env.OLLAMA_URL  = `http://127.0.0.1:${ollamaPort}`;
  process.env.COMFYUI_URL = `http://127.0.0.1:${comfyPort}`;

  // Write minimal config with a test model (sd15 needs only a checkpoint name)
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
    ollamaUrl:     `http://127.0.0.1:${ollamaPort}`,
    comfyuiUrl:    `http://127.0.0.1:${comfyPort}`,
    ollamaModel:   'test-model',
    activeModel:   'test-sd15',
    maxIterations: 3,
    humanReview:   false,
    models: {
      'test-sd15': {
        id: 'test-sd15', label: 'Test SD1.5', architecture: 'sd15',
        checkpoint: 'test.safetensors',
      },
    },
  }));

  // Start the app server (require AFTER env vars are set)
  const { server } = require('../../server');
  appServer = server;
  await new Promise(r => appServer.listen(0, r));
  appPort = appServer.address().port;
});

after(async () => {
  await Promise.all([
    new Promise(r => appServer.close(r)),
    new Promise(r => ollamaServer.close(r)),
    new Promise(r => comfyServer.close(r)),
  ]);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.SESSIONS_DIR;
  delete process.env.SKILLS_DIR;
  delete process.env.OLLAMA_URL;
  delete process.env.COMFYUI_URL;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST /api/generate streams events and accepts on first iteration', async () => {
  reviewVerdict = 'ACCEPT';
  const events = await collectSSE(`http://127.0.0.1:${appPort}/api/generate`, {
    description: 'a happy cat',
  });

  const types = events.map(e => e.event);
  assert.ok(types.includes('session'),  'missing session event');
  assert.ok(types.includes('phase'),    'missing phase event');
  assert.ok(types.includes('prompt'),   'missing prompt event');
  assert.ok(types.includes('progress'), 'missing progress event');
  assert.ok(types.includes('image'),    'missing image event');
  assert.ok(types.includes('review'),   'missing review event');
  assert.ok(types.includes('done'),     'missing done event');

  const done = events.find(e => e.event === 'done').data;
  assert.ok(done.accepted,      'should be accepted');
  assert.equal(done.iterations, 1);
  assert.ok(done.imageUrl,      'done event should include imageUrl');
  assert.equal(done.description, 'a happy cat', 'done event should include original description');
});

test('done event includes description so frontend can show continue bar correctly', async () => {
  reviewVerdict = 'REJECT';
  const events = await collectSSE(`http://127.0.0.1:${appPort}/api/generate`, {
    description: 'a mountain landscape',
    overrides: { maxIterations: 1 },
  });

  const done = events.find(e => e.event === 'done').data;
  assert.equal(done.accepted,    false);
  assert.equal(done.description, 'a mountain landscape');
  assert.ok(done.imageUrl, 'imageUrl should be set even on reject');
});

test('runs up to maxIterations when always rejecting', async () => {
  reviewVerdict = 'REJECT';
  const events = await collectSSE(`http://127.0.0.1:${appPort}/api/generate`, {
    description: 'abstract art',
    overrides: { maxIterations: 2 },
  });

  const promptEvents = events.filter(e => e.event === 'prompt');
  assert.equal(promptEvents.length, 2, 'should have run exactly 2 prompt iterations');

  const done = events.find(e => e.event === 'done').data;
  assert.equal(done.accepted,    false);
  assert.equal(done.iterations,  2);
});

test('POST /api/generate/run accepts humanReview and modelId overrides', async () => {
  reviewVerdict = 'ACCEPT';
  const events = await collectSSE(`http://127.0.0.1:${appPort}/api/generate/run`, {
    description:  'a sunset over the ocean',
    humanReview:  false,
    modelId:      'test-sd15',
    overrides:    { width: 768, height: 512 },
  });

  const done = events.find(e => e.event === 'done').data;
  assert.ok(done.accepted);
  assert.ok(done.sessionId);
  assert.ok(done.imageUrl);
});

test('session is persisted to disk after generation', async () => {
  reviewVerdict = 'ACCEPT';
  const events = await collectSSE(`http://127.0.0.1:${appPort}/api/generate`, {
    description: 'a forest path',
  });

  const sessionId = events.find(e => e.event === 'session').data.id;

  // Verify via the sessions API
  const res  = await fetch(`http://127.0.0.1:${appPort}/api/generate/sessions/${sessionId}`);
  const data = await res.json();
  assert.equal(data.id,          sessionId);
  assert.equal(data.description, 'a forest path');
  assert.equal(data.status,      'complete');
  assert.ok(data.iterations.length > 0);
  assert.ok(data.iterations[0].prompt);
  assert.ok(!('format' in data.iterations[0]), 'iterations should not have a format field');
});

test('DELETE /api/generate/sessions/:id removes the session', async () => {
  reviewVerdict = 'ACCEPT';
  const events = await collectSSE(`http://127.0.0.1:${appPort}/api/generate`, {
    description: 'delete me',
  });
  const sessionId = events.find(e => e.event === 'session').data.id;

  const del = await fetch(`http://127.0.0.1:${appPort}/api/generate/sessions/${sessionId}`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  const get = await fetch(`http://127.0.0.1:${appPort}/api/generate/sessions/${sessionId}`);
  assert.equal(get.status, 404);
});

test('POST /api/generate/run returns 400 for missing description', async () => {
  const res = await fetch(`http://127.0.0.1:${appPort}/api/generate/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'description is required');
});

test('POST /api/generate/run returns 400 for unknown modelId', async () => {
  const res = await fetch(`http://127.0.0.1:${appPort}/api/generate/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'test', modelId: 'ghost-model' }),
  });
  assert.equal(res.status, 400);
});
