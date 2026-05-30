<template>
  <section id="run-section">
    <div id="status-bar">
      <span id="status-text">{{ status }}</span>
      <span v-if="iterBadge" id="iteration-badge">{{ iterBadge }}</span>
    </div>
    <div id="iterations-container">
      <IterationCard
        v-for="it in [...iterations].reverse()"
        :key="it.n"
        :iteration="it"
        :session-id="sessionId"
      />
    </div>
  </section>
</template>

<script setup>
import IterationCard from './IterationCard.vue';

defineProps({
  iterations: { type: Array,  default: () => [] },
  status:     { type: String, default: '' },
  iterBadge:  { type: String, default: '' },
  sessionId:  { type: String, default: null },
});
</script>
