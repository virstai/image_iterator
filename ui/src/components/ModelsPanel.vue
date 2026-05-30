<template>
  <aside class="panel">
    <div class="panel-header">
      <h2>Models</h2>
      <button class="close-btn" @click="$emit('close')">&#x2715;</button>
    </div>

    <div v-if="!editingId && !isAdding" id="model-list-section">
      <ul id="model-list">
        <li v-if="!Object.keys(config.models ?? {}).length" style="color:var(--muted);font-size:13px;padding:8px 0">
          No models configured yet.
        </li>
        <li
          v-for="(m, id) in config.models"
          :key="id"
          :class="{ active: id === config.activeModel }"
        >
          <div class="model-info">
            <span class="model-label">{{ m.label || id }}</span>
            <span class="model-arch">{{ archMeta[m.architecture]?.label || m.architecture || '—' }}</span>
          </div>
          <div class="model-actions">
            <button class="small secondary" @click="setActive(id)">Use</button>
            <button class="small secondary" @click="openEditor(id)">Edit</button>
          </div>
        </li>
      </ul>
      <button class="primary" @click="openEditor(null)">+ Add model</button>
    </div>

    <ModelEditor
      v-else
      :model-id="editingId"
      :model="editingId ? config.models[editingId] : null"
      :arch-meta="archMeta"
      :assets="assets"
      @saved="onSaved"
      @deleted="onDeleted"
      @cancel="closeEditor"
    />
  </aside>
</template>

<script setup>
import { ref } from 'vue';
import ModelEditor from './ModelEditor.vue';
import { setActiveModel, saveModel, deleteModel, configState } from '../stores/config.js';

const props = defineProps({
  config:   { type: Object, default: () => ({}) },
  assets:   { type: Object, default: () => ({}) },
  archMeta: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['changed', 'close']);

const editingId = ref(null);
const isAdding  = ref(false);

async function setActive(id) {
  await setActiveModel(id);
  emit('changed');
}

function openEditor(id) {
  editingId.value = id;
  isAdding.value  = !id;
}

function closeEditor() {
  editingId.value = null;
  isAdding.value  = false;
}

async function onSaved() {
  closeEditor();
  emit('changed');
}

async function onDeleted() {
  closeEditor();
  emit('changed');
}
</script>
