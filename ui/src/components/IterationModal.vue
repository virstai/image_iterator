<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Iteration {{ iteration.n }}</span>
          <span
            v-if="iteration.verdict"
            class="verdict"
            :class="iteration.verdict.toLowerCase()"
          >{{ iteration.verdict }}</span>
          <span v-else-if="iteration.status" class="iter-status">{{ iteration.status }}</span>
          <button class="close-btn" @click="$emit('close')">&#x2715;</button>
        </div>

        <div v-if="showProgress" class="progress-bar">
          <div class="fill" :style="{ width: iteration.progress + '%' }"></div>
        </div>

        <div class="modal-body">
          <div class="modal-image">
            <img v-if="iteration.imageUrl" :src="iteration.imageUrl" :alt="`Iteration ${iteration.n}`">
            <div v-else class="image-placeholder">{{ iteration.status || 'Waiting…' }}</div>
          </div>
          <div class="modal-details">
            <div class="detail-block">
              <label>Prompt</label>
              <div class="value prompt-val">{{ displayPrompt }}</div>
            </div>
            <div class="detail-block">
              <label>Review</label>
              <div class="value review-val">{{ displayReview }}</div>
            </div>
            <div v-if="iteration.humanFeedback" class="detail-block">
              <label>Human feedback</label>
              <div class="value">{{ iteration.humanFeedback }}</div>
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
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { submitHumanReview } from '../stores/generate.js';

const props = defineProps({
  iteration: { type: Object, required: true },
  sessionId: { type: String, default: null },
});
const emit = defineEmits(['close']);

const feedback   = ref('');
const submitting = ref(false);

const showProgress  = computed(() => props.iteration.progress > 0 && props.iteration.progress < 100);
const displayPrompt = computed(() =>
  props.iteration.prompt ?? (props.iteration.streamingPrompt || '—')
);
const displayReview = computed(() =>
  props.iteration.fullReview ?? props.iteration.diagnosis ?? (props.iteration.streamingReview || '—')
);

async function submitReview(accept) {
  if (!props.sessionId) return;
  submitting.value = true;
  try {
    await submitHumanReview(props.sessionId, accept, feedback.value.trim());
    feedback.value = '';
    emit('close');
  } finally {
    submitting.value = false;
  }
}

function onKeydown(e) { if (e.key === 'Escape') emit('close'); }
onMounted(()   => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
