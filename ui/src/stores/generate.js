import { reactive } from 'vue';
import { api } from '../api.js';

export const genState = reactive({
  status:        '',
  iterBadge:     '',
  sessionId:     null,
  loadedDesc:    null,   // set when a past session is loaded
  running:       false,
  iterations:    [],     // array of iteration objects
});

// True while the UI itself is consuming a direct SSE stream from POST /api/generate
// or POST /api/generate/continue. When set, broadcast events are skipped to avoid
// double-processing the same events.
let _hasDirectStream = false;

function blankIteration(n) {
  return {
    n,
    status:          '',
    streamingPrompt: '',
    prompt:          null,
    progress:        0,
    imageUrl:        null,
    streamingReview: '',
    fullReview:      null,
    diagnosis:       null,
    verdict:         null,
    humanPending:    false,
    aiVerdict:       null,
    aiDiagnosis:     null,
    humanFeedback:   null,
  };
}

function ensureIteration(n) {
  while (genState.iterations.length < n) {
    genState.iterations.push(blankIteration(genState.iterations.length + 1));
  }
  return genState.iterations[n - 1];
}

export function handleEvent(event, data) {
  const labels = { prompt_building: 'Building prompt…', generating: 'Generating…', reviewing: 'Reviewing…' };

  switch (event) {
    case 'session':
      genState.sessionId = data.id;
      genState.status    = data.resume ? 'Resuming session…' : 'Session started';
      if (!data.resume) genState.iterations = [];
      break;

    case 'history': {
      const it = ensureIteration(data.iteration);
      it.prompt    = data.prompt    ?? it.prompt;
      it.imageUrl  = data.imageUrl  ?? it.imageUrl;
      it.diagnosis = data.diagnosis ?? it.diagnosis;
      it.verdict   = data.verdict   ?? it.verdict;
      it.progress  = 100;
      it.status    = data.verdict ?? '';
      if (data.humanFeedback) it.humanFeedback = data.humanFeedback;
      break;
    }

    case 'phase': {
      const it  = ensureIteration(data.iteration);
      it.status = labels[data.phase] || data.phase;
      genState.iterBadge = `Iteration ${data.iteration}`;
      genState.status    = it.status;
      break;
    }

    case 'token': {
      const it = ensureIteration(data.iteration);
      if (data.phase === 'prompt') it.streamingPrompt += data.token;
      else                         it.streamingReview += data.token;
      break;
    }

    case 'prompt': {
      const it = ensureIteration(data.iteration);
      it.prompt          = data.prompt;
      it.streamingPrompt = '';
      break;
    }

    case 'progress': {
      const it = ensureIteration(data.iteration);
      it.progress = data.pct;
      it.status   = `Generating… ${data.pct}%`;
      break;
    }

    case 'image': {
      const it = ensureIteration(data.iteration);
      it.imageUrl = data.url;
      break;
    }

    case 'review': {
      const it = ensureIteration(data.iteration);
      it.fullReview      = it.streamingReview || null;
      it.diagnosis       = data.diagnosis;
      it.verdict         = data.verdict;
      it.streamingReview = '';
      it.status          = data.verdict;
      break;
    }

    case 'human_review': {
      const it       = ensureIteration(data.iteration);
      it.humanPending = true;
      it.aiVerdict    = data.aiVerdict;
      it.aiDiagnosis  = data.aiDiagnosis;
      it.status       = 'Awaiting your review…';
      genState.status = `Iteration ${data.iteration}: human review required`;
      break;
    }

    case 'human_verdict': {
      const it        = ensureIteration(data.iteration);
      it.humanPending  = false;
      it.humanFeedback = data.feedback || null;
      it.status        = data.accepted
        ? 'Accepted by you'
        : data.feedback ? `Rejected — "${data.feedback}"` : 'Rejected — continuing…';
      break;
    }

    case 'accepted_pending': {
      const it = ensureIteration(data.iteration);
      it.acceptedPending = true;
      it.gracePeriod     = data.gracePeriod;
      genState.status    = `Accepted — ${data.gracePeriod}s to refuse`;
      break;
    }

    case 'acceptance_refused': {
      const it = ensureIteration(data.iteration);
      it.verdict         = 'REFUSED';
      it.acceptedPending = false;
      it.status          = 'REFUSED';
      genState.status    = 'Acceptance refused — continuing…';
      break;
    }

    case 'done':
      genState.status    = data.accepted ? 'Accepted' : 'Done — max iterations reached';
      genState.iterBadge = '';
      genState.running   = false;
      // clear any lingering accepted_pending state
      genState.iterations.forEach(it => { it.acceptedPending = false; });
      if (data.accepted) {
        genState.loadedDesc = null;
      } else {
        genState.loadedDesc = data.prompt || '';
      }
      break;

    case 'error':
      genState.status    = `Error: ${data.message}`;
      genState.iterBadge = '';
      genState.running   = false;
      break;
  }
}

export function readSSEStream(response, onDone) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';

  function processBuffer() {
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop();
    for (const block of blocks) {
      const eMatch = block.match(/^event: (.+)$/m);
      const dMatch = block.match(/^data: (.+)$/m);
      if (!eMatch || !dMatch) continue;
      try { handleEvent(eMatch[1].trim(), JSON.parse(dMatch[1])); } catch { /* ignore */ }
    }
  }

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
    } finally {
      onDone?.();
    }
  })();
}

export async function startGeneration(prompt) {
  _hasDirectStream    = true;
  genState.running    = true;
  genState.iterations = [];
  genState.loadedDesc = null;
  genState.status     = 'Starting…';
  genState.iterBadge  = '';

  const response = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    genState.status  = `Error: ${err.error}`;
    genState.running = false;
    _hasDirectStream = false;
    return;
  }
  readSSEStream(response, () => { genState.running = false; _hasDirectStream = false; });
}

export async function continueSession(sessionId) {
  _hasDirectStream   = true;
  genState.running   = true;
  genState.status    = 'Continuing session…';
  genState.iterBadge = '';

  const response = await fetch(`/api/generate/continue/${sessionId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    genState.status  = `Error: ${err.error}`;
    genState.running = false;
    _hasDirectStream = false;
    return;
  }
  readSSEStream(response, () => { genState.running = false; _hasDirectStream = false; });
}

export async function loadSession(sessionId) {
  genState.status    = 'Loading session…';
  genState.iterBadge = '';
  genState.iterations = [];

  const session = await api('GET', `/api/generate/sessions/${sessionId}`);
  genState.sessionId  = session.id;
  genState.loadedDesc = session.prompt;

  for (let i = 0; i < session.iterations.length; i++) {
    handleEvent('history', { ...session.iterations[i], iteration: i + 1 });
  }

  const count    = session.iterations.length;
  const accepted = session.iterations.some(it => it.verdict === 'ACCEPT');
  genState.status = `Loaded — ${count} iteration${count !== 1 ? 's' : ''} (${accepted ? 'accepted' : 'not accepted'})`;
  return session;
}

export async function submitHumanReview(sessionId, accept, feedback) {
  await api('POST', `/api/generate/human-review/${sessionId}`, { accept, feedback });
}

export async function refuseAccepted(sessionId, iterationN) {
  await api('POST', `/api/generate/sessions/${sessionId}/refuse-accepted`, { iterationN });
  // Update local state immediately; the SSE event also updates it when the stream is live.
  const it = genState.iterations.find(it => it.n === iterationN);
  if (it && it.verdict === 'ACCEPT') {
    it.verdict         = 'REFUSED';
    it.acceptedPending = false;
    it.status          = 'REFUSED';
  }
}

export function clearSession() {
  genState.sessionId  = null;
  genState.loadedDesc = null;
  genState.iterations = [];
  genState.status     = '';
  genState.iterBadge  = '';
}

// Subscribe to the server-side broadcast SSE stream so that sessions triggered
// externally (e.g. via sdapi from SillyTavern) are shown in the UI in real time.
// Skipped while a UI-triggered direct stream is active to prevent double-processing.
// Automatically reconnects on connection loss.
export function connectToBroadcast() {
  async function connect() {
    try {
      const response = await fetch('/api/generate/events');
      if (!response.ok) { setTimeout(connect, 3000); return; }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop();
        for (const block of blocks) {
          if (_hasDirectStream) continue; // direct stream owns the state right now
          const eMatch = block.match(/^event: (.+)$/m);
          const dMatch = block.match(/^data: (.+)$/m);
          if (!eMatch || !dMatch) continue;
          try {
            const event = eMatch[1].trim();
            const data  = JSON.parse(dMatch[1]);
            // For new (non-resume) sessions from sdapi, activate the running state.
            if (event === 'session' && !data.resume) {
              genState.running    = true;
              genState.iterations = [];
              genState.iterBadge  = '';
              genState.loadedDesc = null;
            }
            handleEvent(event, data);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch { /* connection lost */ }
    setTimeout(connect, 3000);
  }
  connect();
}
