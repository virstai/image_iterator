<template>
  <section id="generate-section">
    <textarea
      id="description"
      v-model="description"
      placeholder="Describe the image you want..."
      rows="3"
    ></textarea>

    <!-- Reference image drop zone -->
    <div
      id="ref-drop-zone"
      :class="{ 'dragging': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
      @click="$refs.fileInput.click()"
    >
      <span v-if="!references.length" class="ref-hint">
        Drop reference images here or click to browse
      </span>
      <div v-else class="ref-thumbs">
        <div
          v-for="(ref, i) in references"
          :key="ref.filename"
          class="ref-thumb"
        >
          <img :src="`/api/image?filename=${encodeURIComponent(ref.filename)}&subfolder=${encodeURIComponent(ref.subfolder)}&type=${ref.type}`" :alt="`ref ${i + 1}`">
          <button class="ref-remove" @click.stop="removeRef(i)">×</button>
        </div>
        <span class="ref-add-more" @click.stop="$refs.fileInput.click()">+ add</span>
      </div>
      <span v-if="uploading" class="ref-uploading">Uploading…</span>
    </div>
    <input ref="fileInput" type="file" multiple accept="image/*" style="display:none" @change="onFileInput">

    <div v-if="loadedDesc" id="session-bar">
      <span id="session-bar-label">{{ truncate(loadedDesc, 60) }}</span>
      <button class="secondary small" @click="clearAndReset">New session</button>
    </div>

    <div style="display:flex;gap:8px">
      <button
        id="btn-generate"
        class="primary"
        :disabled="running || uploading"
        @click="generate"
      >Generate</button>
      <button
        v-if="sessionId"
        id="btn-continue"
        class="secondary"
        :disabled="running || uploading"
        @click="$emit('continue', sessionId, references)"
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
const emit = defineEmits(['generate', 'continue', 'clear', 'open-workflows', 'open-settings']);

const description = ref('');
const references  = ref([]);
const dragging    = ref(false);
const uploading   = ref(false);

watch(() => props.loadedDesc, val => { if (val) description.value = val; });

async function uploadFiles(files) {
  if (!files.length) return;
  uploading.value = true;
  try {
    const encoded = await Promise.all(Array.from(files).map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ name: file.name, data: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));

    const res = await fetch('/api/references/upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ files: encoded }),
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    const refs = await res.json();
    references.value.push(...refs);
  } catch (err) {
    alert(`Reference upload failed: ${err.message}`);
  } finally {
    uploading.value = false;
  }
}

function onDrop(e) {
  dragging.value = false;
  uploadFiles(e.dataTransfer.files);
}

function onFileInput(e) {
  uploadFiles(e.target.files);
  e.target.value = '';
}

function removeRef(i) {
  references.value.splice(i, 1);
}

function generate() {
  const desc = description.value.trim();
  if (!desc) return alert('Enter a description first.');
  if (!props.config.activeWorkflow) { emit('open-workflows'); return alert('Select an active workflow first.'); }
  if (!props.config.llmModel) { emit('open-settings'); return alert('Set an LLM model in Settings first.'); }
  emit('generate', desc, references.value);
}

function clearAndReset() {
  description.value = '';
  references.value  = [];
  emit('clear');
}

function truncate(s, n) {
  return s?.length > n ? s.slice(0, n) + '…' : s;
}
</script>
