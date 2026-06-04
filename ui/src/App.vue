<template>
  <div id="app">
    <AppHeader
      :config="configState.config"
      :arch-meta="configState.archMeta"
      :active-panel="activePanel"
      @open-panel="openPanel"
      @set-active-workflow="setActiveWorkflow"
    />

    <SettingsPanel
      v-if="activePanel === 'settings'"
      :config="configState.config"
      :assets="configState.assets"
      @saved="onSettingsSaved"
      @close="activePanel = null"
    />

    <WorkflowsPanel
      v-if="activePanel === 'workflows'"
      :config="configState.config"
      :assets="configState.assets"
      :arch-meta="configState.archMeta"
      @changed="onConfigChanged"
      @close="activePanel = null"
    />

    <ModelsPanel
      v-if="activePanel === 'models'"
      :config="configState.config"
      :assets="configState.assets"
      :arch-meta="configState.archMeta"
      @changed="onConfigChanged"
      @close="activePanel = null"
    />

    <HistoryPanel
      v-if="activePanel === 'history'"
      @load-session="onLoadSession"
      @close="activePanel = null"
    />

    <GenerateSection
      :running="genState.running"
      :session-id="genState.sessionId"
      :loaded-desc="genState.loadedDesc"
      :config="configState.config"
      @generate="onGenerate"
      @continue="onContinue"
      @clear="clearSession"
      @open-workflows="openPanel('workflows')"
      @open-settings="openPanel('settings')"
    />

    <RunSection
      v-if="genState.steps.length || genState.status"
      :steps="genState.steps"
      :status="genState.status"
      :iter-badge="genState.iterBadge"
      :session-id="genState.sessionId"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AppHeader      from './components/AppHeader.vue';
import SettingsPanel  from './components/SettingsPanel.vue';
import WorkflowsPanel from './components/WorkflowsPanel.vue';
import ModelsPanel    from './components/ModelsPanel.vue';
import HistoryPanel   from './components/HistoryPanel.vue';
import GenerateSection from './components/GenerateSection.vue';
import RunSection     from './components/RunSection.vue';

import { configState, loadConfig, loadAssets, setActiveWorkflow as storeSetActiveWorkflow } from './stores/config.js';
import { genState, startGeneration, continueSession, loadSession, clearSession, connectToBroadcast } from './stores/generate.js';

const activePanel = ref(null);

onMounted(async () => {
  connectToBroadcast();
  try {
    await loadConfig();
    await loadAssets();
  } catch (err) {
    console.error('Init error:', err);
  }
});

function openPanel(name) {
  activePanel.value = activePanel.value === name ? null : name;
}

async function setActiveWorkflow(id) {
  await storeSetActiveWorkflow(id);
}

async function onSettingsSaved() {
  activePanel.value = null;
  await loadAssets();
}

async function onConfigChanged() {
  // no-op — store already refreshed config
}

async function onGenerate(prompt) {
  activePanel.value = null;
  await startGeneration(prompt);
}

async function onContinue(sessionId) {
  activePanel.value = null;
  await continueSession(sessionId);
}

async function onLoadSession(sessionId) {
  activePanel.value = null;
  await loadSession(sessionId);
}
</script>
