<template>
  <aside class="panel">
    <div class="panel-header">
      <h2>Workflows</h2>
      <button class="close-btn" @click="$emit('close')">&#x2715;</button>
    </div>

    <div v-if="!editingId && !isAdding" id="workflow-list-section">
      <ul id="workflow-list">
        <li v-if="!Object.keys(config.workflows ?? {}).length" style="color:var(--muted);font-size:13px;padding:8px 0">
          No workflows configured yet.
        </li>
        <li
          v-for="(wf, id) in config.workflows"
          :key="id"
          :class="{ active: id === config.activeWorkflow }"
        >
          <div class="model-info">
            <span class="model-label">{{ wf.label || id }}</span>
            <span class="model-arch">{{ wf.steps?.length ?? 0 }} step{{ wf.steps?.length !== 1 ? 's' : '' }}</span>
          </div>
          <div class="model-actions">
            <button class="small secondary" @click="setActive(id)">Use</button>
            <button class="small secondary" @click="openEditor(id)">Edit</button>
          </div>
        </li>
      </ul>
      <button class="primary" @click="openEditor(null)">+ Add workflow</button>
    </div>

    <WorkflowEditor
      v-else
      :workflow-id="editingId"
      :workflow="editingId ? config.workflows[editingId] : null"
      :config="config"
      :arch-meta="archMeta"
      :assets="assets"
      @saved="onSaved"
      @deleted="onDeleted"
      @cancel="closeEditor"
    />
  </aside>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import WorkflowEditor from './WorkflowEditor.vue';
import { setActiveWorkflow, loadAssets } from '../stores/config.js';

const props = defineProps({
  config:   { type: Object, default: () => ({}) },
  assets:   { type: Object, default: () => ({}) },
  archMeta: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['changed', 'close']);

const editingId = ref(null);
const isAdding  = ref(false);

onMounted(() => { loadAssets().catch(() => {}); });

async function setActive(id) {
  await setActiveWorkflow(id);
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
