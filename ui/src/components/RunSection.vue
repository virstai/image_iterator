<template>
  <section id="run-section">
    <div id="status-bar">
      <span id="status-text">{{ status }}</span>
      <span v-if="iterBadge" id="iteration-badge">{{ iterBadge }}</span>
    </div>
    <div class="iter-grid">
      <IterationCard
        v-for="it in iterations"
        :key="it.n"
        :iteration="it"
        @open="modalN = it.n"
      />
    </div>
    <IterationModal
      v-if="modalN !== null && modalIteration"
      :iteration="modalIteration"
      :session-id="sessionId"
      @close="modalN = null"
    />
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import IterationCard  from './IterationCard.vue';
import IterationModal from './IterationModal.vue';

const props = defineProps({
  iterations: { type: Array,  default: () => [] },
  status:     { type: String, default: '' },
  iterBadge:  { type: String, default: '' },
  sessionId:  { type: String, default: null },
});

const modalN = ref(null);

const modalIteration = computed(() =>
  modalN.value !== null ? props.iterations.find(it => it.n === modalN.value) ?? null : null
);

// Reset modal when the session changes so a stale modalN can't match a new iteration
watch(() => props.sessionId, () => { modalN.value = null; });

// Auto-open when an iteration needs human review or is in acceptance grace period
watch(
  () => props.iterations.find(it => it.humanPending),
  (pending) => { if (pending) modalN.value = pending.n; }
);
watch(
  () => props.iterations.find(it => it.acceptedPending),
  (pending) => { if (pending) modalN.value = pending.n; }
);
</script>
