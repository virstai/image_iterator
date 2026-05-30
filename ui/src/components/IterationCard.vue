<template>
  <div class="iteration">
    <div class="iteration-header">
      <span class="iter-num">Iteration {{ iteration.n }}</span>
      <span v-if="iteration.format" class="iter-format">{{ iteration.format }}</span>
      <span class="iter-status">{{ iteration.status }}</span>
      <span
        v-if="iteration.verdict"
        class="verdict"
        :class="iteration.verdict.toLowerCase()"
        style="margin-left:auto"
      >{{ iteration.verdict }}</span>
    </div>

    <div class="progress-bar">
      <div class="fill" :style="{ width: iteration.progress + '%' }"></div>
    </div>

    <div class="iteration-body">
      <div class="iteration-image">
        <img v-if="iteration.imageUrl" :src="iteration.imageUrl" :alt="`iteration ${iteration.n}`">
        <div v-else class="image-placeholder">Waiting…</div>
      </div>
      <div class="iteration-details">
        <div class="detail-block">
          <label>Prompt</label>
          <div class="value prompt-val">{{ displayPrompt }}</div>
        </div>
        <div class="detail-block">
          <label>Review</label>
          <div class="value review-val">{{ displayReview }}</div>
        </div>
      </div>
    </div>

    <div v-if="iteration.humanPending" class="human-review">
      <span class="hr-ai-note">AI: {{ iteration.aiVerdict }} — {{ iteration.aiDiagnosis }}</span>
      <textarea
        v-model="feedback"
        class="hr-feedback"
        placeholder="Optional feedback to guide the next iteration…"
        rows="2"
      ></textarea>
      <div class="hr-actions">
        <button class="primary"   :disabled="submitting" @click="submitReview(true)">Accept</button>
        <button class="secondary" :disabled="submitting" @click="submitReview(false)">Reject &amp; continue</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { submitHumanReview, genState } from '../stores/generate.js';

const props = defineProps({
  iteration: { type: Object, required: true },
  sessionId: { type: String, default: null },
});

const feedback   = ref('');
const submitting = ref(false);

const displayPrompt = computed(() =>
  props.iteration.prompt ?? (props.iteration.streamingPrompt || '—')
);

const displayReview = computed(() =>
  props.iteration.diagnosis ?? (props.iteration.streamingReview || '—')
);

async function submitReview(accept) {
  if (!props.sessionId) return;
  submitting.value = true;
  try {
    await submitHumanReview(props.sessionId, accept, feedback.value.trim());
    feedback.value = '';
  } finally {
    submitting.value = false;
  }
}
</script>
