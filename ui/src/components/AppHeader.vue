<template>
  <header>
    <h1>ComfyRefinery</h1>
    <div class="header-right">
      <WorkflowSelect
        :model-value="config.activeWorkflow"
        :workflows="config.workflows ?? {}"
        @update:model-value="$emit('set-active-workflow', $event)"
      />
      <button class="icon-btn" title="Session history"  @click="$emit('open-panel', 'history')">&#9776;</button>
      <button class="icon-btn" title="Manage workflows" @click="$emit('open-panel', 'workflows')">&#9654;</button>
      <button class="icon-btn" title="Manage models"    @click="$emit('open-panel', 'models')">&#9635;</button>
      <button class="icon-btn" title="Global settings"  @click="$emit('open-panel', 'settings')">&#9881;</button>
    </div>
  </header>
</template>

<script setup>
import WorkflowSelect from './WorkflowSelect.vue';

defineProps({
  config:      { type: Object, default: () => ({}) },
  archMeta:    { type: Object, default: () => ({}) },
  activePanel: { type: String, default: null },
});
defineEmits(['open-panel', 'set-active-workflow']);
</script>
