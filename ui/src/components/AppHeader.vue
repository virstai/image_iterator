<template>
  <header>
    <h1>ComfyRefinery</h1>
    <div class="header-right">
      <select
        :value="config.activeWorkflow ?? ''"
        title="Active workflow"
        id="active-workflow-select"
        @change="$emit('set-active-workflow', $event.target.value)"
      >
        <option value="">— no workflow —</option>
        <option
          v-for="(wf, id) in config.workflows"
          :key="id"
          :value="id"
          :selected="id === config.activeWorkflow"
        >{{ wf.label || id }}</option>
      </select>
      <button class="icon-btn" title="Session history"   @click="$emit('open-panel', 'history')">&#9776;</button>
      <button class="icon-btn" title="Manage workflows"  @click="$emit('open-panel', 'workflows')">&#9654;</button>
      <button class="icon-btn" title="Manage models"     @click="$emit('open-panel', 'models')">&#9635;</button>
      <button class="icon-btn" title="Global settings"   @click="$emit('open-panel', 'settings')">&#9881;</button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  config:     { type: Object, default: () => ({}) },
  archMeta:   { type: Object, default: () => ({}) },
  activePanel:{ type: String, default: null },
});
defineEmits(['open-panel', 'set-active-workflow']);
</script>
