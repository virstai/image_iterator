'use strict';

// Shared fake HTTP servers and SSE helpers used by integration test suites.

const http = require('http');
const { WebSocketServer } = require('ws');

// 1×1 transparent PNG returned by fake /view so base64 encoding works.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// getVerdict is called per review request so callers can change it at any time.
function makeFakeOllama(getVerdict) {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/chat') {
      res.writeHead(404); return res.end();
    }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const { messages } = JSON.parse(body);
      const isReview = messages.some(m =>
        typeof m.content === 'string' && m.content.toLowerCase().includes('reviewing'),
      );
      const verdict = getVerdict();
      const text = isReview
        ? `Image assessed.\nVERDICT: ${verdict}\nDIAGNOSIS: ${verdict === 'ACCEPT' ? 'looks good' : 'subject not visible'}`
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

function makeFakeComfyUI() {
  const promptId = 'test-prompt-001';

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/prompt') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: promptId }));
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
    setImmediate(() => {
      ws.send(JSON.stringify({ type: 'progress', data: { prompt_id: promptId, value: 5,  max: 10 } }));
      ws.send(JSON.stringify({ type: 'progress', data: { prompt_id: promptId, value: 10, max: 10 } }));
      ws.send(JSON.stringify({ type: 'executing', data: { prompt_id: promptId, node: null } }));
    });
  });

  return httpServer;
}

// Sends a POST SSE request, collects all events until stream closes.
async function collectSSE(url, body) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const events  = [];
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop() ?? '';
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

module.exports = { TINY_PNG, makeFakeOllama, makeFakeComfyUI, collectSSE };
