<template>
  <header>
    <h1>ComfyRefinery</h1>
    <div class="header-right">
      <select
        :value="config.activeModel ?? ''"
        title="Active model"
        id="active-model-select"
        @change="$emit('set-active-model', $event.target.value)"
      >
        <option value="">— no model —</option>
        <option
          v-for="(m, id) in config.models"
          :key="id"
          :value="id"
          :selected="id === config.activeModel"
        >{{ m.label || id }}</option>
      </select>
      <button class="icon-btn" title="Session history"  @click="$emit('open-panel', 'history')">&#9776;</button>
      <button class="icon-btn" title="Manage models"    @click="$emit('open-panel', 'models')">&#9635;</button>
      <button class="icon-btn" title="Global settings"  @click="$emit('open-panel', 'settings')">&#9881;</button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  config:     { type: Object, default: () => ({}) },
  archMeta:   { type: Object, default: () => ({}) },
  activePanel:{ type: String, default: null },
});
defineEmits(['open-panel', 'set-active-model']);
</script>
