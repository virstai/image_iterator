<template>
  <section id="generate-section">
    <textarea
      id="description"
      v-model="description"
      placeholder="Describe the image you want..."
      rows="3"
    ></textarea>

    <div v-if="loadedDesc" id="session-bar">
      <span id="session-bar-label">{{ truncate(loadedDesc, 60) }}</span>
      <button class="secondary small" @click="clearAndReset">New session</button>
    </div>

    <div style="display:flex;gap:8px">
      <button
        id="btn-generate"
        class="primary"
        :disabled="running"
        @click="generate"
      >Generate</button>
      <button
        v-if="sessionId"
        id="btn-continue"
        class="secondary"
        :disabled="running"
        @click="$emit('continue', sessionId)"
      >Continue session</button>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  running:    { type: Boolean, default: false },
  sessionId:  { type: String,  default: null },
  loadedDesc: { type: String,  default: null },
  config:     { type: Object,  default: () => ({}) },
});
const emit = defineEmits(['generate', 'continue', 'clear', 'open-models', 'open-settings']);

const description = ref('');

watch(() => props.loadedDesc, val => { if (val) description.value = val; });

function generate() {
  const desc = description.value.trim();
  if (!desc) return alert('Enter a description first.');
  if (!props.config.activeModel) { emit('open-models'); return alert('Select an active model first.'); }
  if (!props.config.ollamaModel) { emit('open-settings'); return alert('Set an Ollama model in Settings first.'); }
  emit('generate', desc);
}

function clearAndReset() {
  description.value = '';
  emit('clear');
}

function truncate(s, n) {
  return s?.length > n ? s.slice(0, n) + '…' : s;
}
</script>
