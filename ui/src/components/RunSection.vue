<template>
  <div id="run-section" style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
    <!-- Status bar -->
    <div id="status-bar">
      <span id="status-text">{{ status }}</span>
      <span v-if="iterBadge" id="iteration-badge">{{ iterBadge }}</span>
    </div>

    <div class="pipeline-area">
      <!-- Left: step grids -->
      <div class="pipeline-grids">
        <div
          v-for="step in steps"
          :key="step.index"
          class="step-group"
        >
          <div :class="['step-label', `type-${step.type}`]">
            <span class="step-type-badge">{{ step.type }}</span>
            {{ step.label || step.type }}
          </div>
          <div v-if="!step.iterations.length" style="font-size:11px;color:var(--muted);padding:4px 0">
            Waiting…
          </div>
          <div v-else class="iter-grid">
            <IterationCard
              v-for="it in step.iterations"
              :key="it.n"
              :iteration="it"
              :selected="isPinned(step.index, it.n)"
              @open="onCardClick(step.index, it.n)"
            />
          </div>
        </div>
      </div>

      <!-- Right: detail pane -->
      <DetailPane
        ref="detailPane"
        :steps="steps"
        :running="running"
        :session-id="sessionId"
        @unpinned="onDetailUnpinned"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import IterationCard from './IterationCard.vue';
import DetailPane   from './DetailPane.vue';

const props = defineProps({
  steps:     { type: Array,   default: () => [] },
  status:    { type: String,  default: '' },
  iterBadge: { type: String,  default: '' },
  sessionId: { type: String,  default: null },
  running:   { type: Boolean, default: false },
});

const detailPane = ref(null);
const pinnedKey  = ref(null); // { stepIndex, iterN } or null

function isPinned(stepIndex, iterN) {
  return pinnedKey.value?.stepIndex === stepIndex && pinnedKey.value?.iterN === iterN;
}

function onCardClick(stepIndex, iterN) {
  if (isPinned(stepIndex, iterN)) {
    // Clicking the already-pinned card → unpin (return to Active)
    pinnedKey.value = null;
    detailPane.value?.unpin();
  } else {
    pinnedKey.value = { stepIndex, iterN };
    detailPane.value?.pin(stepIndex, iterN);
  }
}

// Clear pin when session changes
watch(() => props.sessionId, () => {
  pinnedKey.value = null;
  detailPane.value?.unpin();
});

function onDetailUnpinned() {
  pinnedKey.value = null;
}

// Auto-pin to human-pending or accepted-pending iteration when not already pinned
watch(
  () => {
    for (const step of props.steps) {
      const it = step.iterations.find(it => it.humanPending || it.acceptedPending);
      if (it) return { stepIndex: step.index, iterN: it.n };
    }
    return null;
  },
  pending => {
    if (pending && !pinnedKey.value) {
      pinnedKey.value = pending;
      detailPane.value?.pin(pending.stepIndex, pending.iterN);
    }
  },
  { immediate: true }
);

// Clear stale pinnedKey when the pinned iteration no longer exists in steps
watch(
  () => props.steps,
  () => {
    if (!pinnedKey.value) return;
    const step = props.steps[pinnedKey.value.stepIndex];
    const iterExists = step?.iterations.some(it => it.n === pinnedKey.value.iterN);
    if (!iterExists) {
      pinnedKey.value = null;
      detailPane.value?.unpin();
    }
  },
  { deep: true }
);
</script>
