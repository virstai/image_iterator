<template>
  <section id="run-section">
    <div id="status-bar">
      <span id="status-text">{{ status }}</span>
      <span v-if="iterBadge" id="iteration-badge">{{ iterBadge }}</span>
    </div>

    <div
      v-for="step in steps"
      :key="step.index"
      class="step-group"
    >
      <div v-if="steps.length > 1" class="step-label">{{ step.label || step.type }}</div>
      <div class="iter-grid">
        <IterationCard
          v-for="it in step.iterations"
          :key="it.n"
          :iteration="it"
          @open="openModal(step.index, it.n)"
        />
      </div>
    </div>

    <IterationModal
      v-if="modalKey !== null && modalIteration"
      :iteration="modalIteration"
      :step-index="modalKey.stepIndex"
      :session-id="sessionId"
      @close="modalKey = null"
    />
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import IterationCard  from './IterationCard.vue';
import IterationModal from './IterationModal.vue';

const props = defineProps({
  steps:     { type: Array,  default: () => [] },
  status:    { type: String, default: '' },
  iterBadge: { type: String, default: '' },
  sessionId: { type: String, default: null },
});

const modalKey = ref(null); // { stepIndex, iterN }

function openModal(stepIndex, iterN) {
  modalKey.value = { stepIndex, iterN };
}

const modalIteration = computed(() => {
  if (!modalKey.value) return null;
  const step = props.steps[modalKey.value.stepIndex];
  return step?.iterations.find(it => it.n === modalKey.value.iterN) ?? null;
});

watch(() => props.sessionId, () => { modalKey.value = null; });

// Auto-open when an iteration needs human review
watch(
  () => {
    for (const step of props.steps) {
      const it = step.iterations.find(it => it.humanPending);
      if (it) return { stepIndex: step.index, iterN: it.n };
    }
    return null;
  },
  pending => { if (pending) modalKey.value = pending; },
);

// Auto-open when an iteration is in acceptance grace period
watch(
  () => {
    for (const step of props.steps) {
      const it = step.iterations.find(it => it.acceptedPending);
      if (it) return { stepIndex: step.index, iterN: it.n };
    }
    return null;
  },
  pending => { if (pending) modalKey.value = pending; },
);
</script>
