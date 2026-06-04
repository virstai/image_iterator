'use strict';

// LLM provider router. All AI text generation goes through here.
// The active provider is read from cfg.llmProvider (defaults to 'ollama').
// To add a new provider: create src/services/providers/<name>.js implementing
// { chat(cfg, messages), chatStream(cfg, messages, onToken), listModels(cfg) }
// and add an entry to the registry below.

const registry = {
  ollama: require('./providers/ollama'),
};

function getProvider(cfg) {
  const name     = cfg.llmProvider ?? 'ollama';
  const provider = registry[name];
  if (!provider) throw new Error(`Unknown LLM provider "${name}". Valid: ${Object.keys(registry).join(', ')}`);
  return provider;
}

function chat(cfg, messages, options) {
  return getProvider(cfg).chat(cfg, messages, options);
}

function chatStream(cfg, messages, onToken, options) {
  return getProvider(cfg).chatStream(cfg, messages, onToken, options);
}

function listModels(cfg) {
  return getProvider(cfg).listModels(cfg);
}

module.exports = { chat, chatStream, listModels, providers: Object.keys(registry) };
