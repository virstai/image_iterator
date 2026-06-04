<template>
  <div id="workflow-editor">
    <hr>
    <h3>{{ workflowId ? `Edit: ${workflow?.label || workflowId}` : 'New workflow' }}</h3>

    <label>Name / label
      <input type="text" v-model="form.label" placeholder="Portrait 4x">
    </label>

    <!-- Steps -->
    <div v-for="(step, si) in form.steps" :key="si" class="step-block">
      <div class="step-header">
        <strong>Step {{ si + 1 }}: Generate</strong>
        <button v-if="form.steps.length > 1" class="small danger" @click="removeStep(si)">Remove</button>
      </div>

      <label>Model
        <select v-model="step.modelId">
          <option value="">— select model —</option>
          <option v-for="(m, id) in config.models" :key="id" :value="id">
            {{ m.label || id }} ({{ m.architecture || '?' }})
          </option>
        </select>
      </label>

      <!-- Params -->
      <div class="row">
        <label>Width  <input type="number" v-model.number="step.width"  step="64" :placeholder="archDefault(si, 'width')"></label>
        <label>Height <input type="number" v-model.number="step.height" step="64" :placeholder="archDefault(si, 'height')"></label>
        <label>Steps  <input type="number" v-model.number="step.steps"  min="1"   :placeholder="archDefault(si, 'steps')"></label>
      </div>
      <div class="row">
        <label v-if="showCfg(si)">CFG scale
          <input type="number" v-model.number="step.cfgScale" step="0.5" :placeholder="archDefault(si, 'cfgScale')">
        </label>
        <label v-if="showGuidance(si)">Guidance
          <input type="number" v-model.number="step.guidance" step="0.5" :placeholder="archDefault(si, 'guidance')">
        </label>
        <label>Sampler
          <select v-model="step.sampler">
            <option value="">arch default</option>
            <option>euler</option><option>euler_ancestral</option>
            <option>er_sde</option><option>dpmpp_2m</option>
            <option>dpmpp_2m_sde</option><option>dpmpp_3m_sde</option>
            <option>ddim</option><option>uni_pc</option>
          </select>
        </label>
        <label>Scheduler
          <select v-model="step.scheduler">
            <option value="">arch default</option>
            <option>normal</option><option>karras</option><option>exponential</option>
            <option>sgm_uniform</option><option>simple</option><option>beta</option>
          </select>
        </label>
      </div>

      <label v-if="showNegative(si)">Negative prompt <span class="hint">(leave blank for arch default)</span>
        <textarea v-model="step.negativePrompt" rows="2"></textarea>
      </label>

      <label v-if="stepArch(si) === 'sdxl'">Refiner switch at <span class="hint">(0–1, if model has refiner)</span>
        <input type="number" v-model.number="step.refinerSwitchAt" min="0" max="1" step="0.05" placeholder="0.8">
      </label>

      <!-- Review settings -->
      <div class="review-block">
        <strong>Review</strong>
        <div class="row">
          <label>Max iterations
            <input type="number" v-model.number="step.maxIterations" min="1" placeholder="3">
          </label>
          <label>Grace period (s)
            <input type="number" v-model.number="step.gracePeriod" min="0" placeholder="10">
          </label>
        </div>
        <label class="checkbox-label">
          <input type="checkbox" v-model="step.humanReview"> Require human review
        </label>
      </div>

      <!-- Reference strategy -->
      <div class="review-block">
        <strong>References</strong>
        <label class="checkbox-label">
          <input type="checkbox" v-model="step.visionNotes"> Pass all references to LLM for composition guidance
        </label>
        <div class="row" style="margin-top:6px">
          <label>When one reference
            <select v-model="step.refOneMode">
              <option value="txt2img">Ignore (txt2img)</option>
              <option value="init-image">Use as init image (img2img)</option>
            </select>
          </label>
          <label v-if="step.refOneMode === 'init-image'">Denoise strength
            <input type="number" v-model.number="step.refOneDenoise" min="0.01" max="1" step="0.05" placeholder="0.6">
          </label>
        </div>
        <div class="row">
          <label>When many references
            <select v-model="step.refManyMode">
              <option value="txt2img">Ignore (txt2img)</option>
              <option value="init-image">Use first as init image (img2img)</option>
              <option value="adapter" disabled>Adapter — Phase 5</option>
            </select>
          </label>
          <label v-if="step.refManyMode === 'init-image'">Denoise strength
            <input type="number" v-model.number="step.refManyDenoise" min="0.01" max="1" step="0.05" placeholder="0.6">
          </label>
        </div>
      </div>
    </div>

    <button class="secondary" style="margin-top:8px" @click="addStep">+ Add generate step</button>

    <!-- Skill section -->
    <div v-if="workflowId && skillData" class="skill-section">
      <hr>
      <h3>Workflow Skill</h3>
      <div v-if="skillData.skill" class="skill-text">{{ skillData.skill }}</div>
      <div v-else class="skill-text" style="color:var(--muted)">No skill synthesised yet — will be generated after the first session.</div>
      <div v-if="skillData.skillUpdatedAt" class="hint">Last updated {{ formatDate(skillData.skillUpdatedAt) }}</div>

      <div class="skill-correction">
        <textarea
          v-model="correctionNote"
          rows="3"
          placeholder="Describe what the agent got wrong or should change (optional)…"
          :disabled="refreshing"
        ></textarea>
        <button class="small primary" :disabled="refreshing" @click="doRefreshSkill">
          {{ refreshing ? 'Refreshing…' : 'Refresh skill' }}
        </button>
      </div>

      <template v-if="skillData.outcomes && (skillData.outcomes.accepts + skillData.outcomes.rejects) > 0">
        <h3 style="margin-top:14px">Outcomes</h3>
        <div class="ln-header">
          <span class="ln-rate">{{ skillData.outcomes.accepts }}/{{ skillData.outcomes.accepts + skillData.outcomes.rejects }} accepted</span>
          <div class="ln-bar"><div class="ln-fill" :style="{ width: outcomeRate + '%' }"></div></div>
          <span class="ln-pct">{{ outcomeRate }}%</span>
        </div>
      </template>
    </div>

    <!-- Notes section -->
    <div v-if="workflowId" class="skill-section">
      <hr>
      <h3>Notes</h3>
      <p v-if="!localNotes.length" class="hint">No notes yet — discoveries will appear here after sessions.</p>
      <div v-for="note in localNotes" :key="note.id" class="note-row">
        <label class="note-toggle">
          <input type="checkbox" :checked="note.enabled" @change="toggleNote(note.id)">
          <span v-if="note.type === 'enforce'" class="note-text">{{ note.text }}</span>
          <span v-else class="note-text"><strong>Blacklist:</strong> {{ (note.words ?? []).join(', ') }}</span>
        </label>
        <span v-if="note.auto" class="note-auto">auto</span>
        <button class="small danger" @click="deleteNote(note.id)">×</button>
      </div>
      <div class="note-add">
        <select v-model="addType" class="note-add-select">
          <option value="enforce">Style enforcement</option>
          <option value="blacklist">Blacklist words</option>
        </select>
        <input
          v-model="addText"
          class="note-add-input"
          :placeholder="addType === 'enforce' ? 'e.g. Adapt photorealistic requests to anime style' : 'comma-separated words'"
          @keydown.enter="addNote"
        >
        <button class="small primary" @click="addNote">Add</button>
      </div>
    </div>

    <div class="panel-actions">
      <button class="primary"               @click="save">Save workflow</button>
      <button class="secondary"             @click="$emit('cancel')">Cancel</button>
      <button v-if="workflowId" class="danger" @click="remove">Delete</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch, onMounted, ref } from 'vue';
import { saveWorkflow, deleteWorkflow, loadSkill, saveNotes, refreshSkill as apiRefreshSkill } from '../stores/config.js';

const props = defineProps({
  workflowId: { type: String, default: null },
  workflow:   { type: Object, default: null },
  config:     { type: Object, default: () => ({}) },
  archMeta:   { type: Object, default: () => ({}) },
  assets:     { type: Object, default: () => ({}) },
});
const emit = defineEmits(['saved', 'deleted', 'cancel']);

const skillData      = ref(null);
const localNotes     = ref([]);
const addType        = ref('enforce');
const addText        = ref('');
const correctionNote = ref('');
const refreshing     = ref(false);

function blankStep() {
  return {
    modelId: '', width: '', height: '', steps: '', cfgScale: '', guidance: '',
    sampler: '', scheduler: '', negativePrompt: '', refinerSwitchAt: '',
    maxIterations: '', humanReview: false, gracePeriod: '',
    visionNotes: false, refOneMode: 'txt2img', refOneDenoise: 0.6,
    refManyMode: 'txt2img', refManyDenoise: 0.6,
  };
}

const form = reactive({ label: '', steps: [blankStep()] });

watch(() => props.workflow, wf => {
  if (!wf) { form.label = ''; form.steps = [blankStep()]; return; }
  form.label = wf.label ?? '';
  form.steps = (wf.steps ?? []).map(s => ({
    modelId:        s.modelId         ?? '',
    width:          s.params?.width   ?? '',
    height:         s.params?.height  ?? '',
    steps:          s.params?.steps   ?? '',
    cfgScale:       s.params?.cfgScale      ?? '',
    guidance:       s.params?.guidance      ?? '',
    sampler:        s.params?.sampler       ?? '',
    scheduler:      s.params?.scheduler     ?? '',
    negativePrompt: s.params?.negativePrompt ?? '',
    refinerSwitchAt: s.params?.refinerSwitchAt ?? '',
    maxIterations:  s.review?.maxIterations  ?? '',
    humanReview:    s.review?.humanReview    ?? false,
    gracePeriod:    s.review?.gracePeriod    ?? '',
    visionNotes:    s.referenceStrategy?.visionNotes ?? false,
    refOneMode:     s.referenceStrategy?.diffusion?.one?.mode  ?? 'txt2img',
    refOneDenoise:  s.referenceStrategy?.diffusion?.one?.denoise ?? 0.6,
    refManyMode:    s.referenceStrategy?.diffusion?.many?.mode ?? 'txt2img',
    refManyDenoise: s.referenceStrategy?.diffusion?.many?.denoise ?? 0.6,
  }));
  if (!form.steps.length) form.steps = [blankStep()];
}, { immediate: true });

watch(() => props.workflowId, async id => {
  skillData.value  = null;
  localNotes.value = [];
  if (id) {
    skillData.value  = await loadSkill(id).catch(() => null);
    localNotes.value = (skillData.value?.notes ?? []).map(n => ({ ...n }));
  }
}, { immediate: true });

function stepArch(si) {
  const modelId = form.steps[si]?.modelId;
  return modelId ? (props.config.models?.[modelId]?.architecture ?? '') : '';
}

function archDefault(si, key) {
  const arch = stepArch(si);
  const d = arch ? props.archMeta[arch]?.defaults : null;
  return d?.[key] != null ? String(d[key]) : 'default';
}

function showCfg(si)      { return ['sd15','sdxl','sd3','anima'].includes(stepArch(si)); }
function showGuidance(si) { return ['flux','flux2','chroma'].includes(stepArch(si)); }
function showNegative(si) { return ['sd15','sdxl','sd3','anima','chroma'].includes(stepArch(si)); }

function addStep() { form.steps.push(blankStep()); }
function removeStep(si) { form.steps.splice(si, 1); }

const outcomeRate = computed(() => {
  const o = skillData.value?.outcomes;
  if (!o) return 0;
  const total = o.accepts + o.rejects;
  return total ? Math.round((o.accepts / total) * 100) : 0;
});

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function doRefreshSkill() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const data = await apiRefreshSkill(props.workflowId, correctionNote.value.trim());
    skillData.value  = data;
    localNotes.value = (data.notes ?? []).map(n => ({ ...n }));
    correctionNote.value = '';
  } catch (err) {
    alert(`Skill refresh failed: ${err.message}`);
  } finally {
    refreshing.value = false;
  }
}

async function persistNotes() {
  const data = await saveNotes(props.workflowId, localNotes.value);
  skillData.value = data;
}

async function toggleNote(id) {
  const note = localNotes.value.find(n => n.id === id);
  if (note) { note.enabled = !note.enabled; await persistNotes(); }
}

async function deleteNote(id) {
  localNotes.value = localNotes.value.filter(n => n.id !== id);
  await persistNotes();
}

async function addNote() {
  const text = addText.value.trim();
  if (!text) return;
  if (addType.value === 'enforce') {
    localNotes.value.push({ id: genId(), type: 'enforce', enabled: false, auto: false, text });
  } else {
    for (const word of text.split(',').map(w => w.trim()).filter(Boolean)) {
      localNotes.value.push({ id: genId(), type: 'blacklist', words: [word], enabled: false, auto: false });
    }
  }
  addText.value = '';
  await persistNotes();
}

async function save() {
  if (!form.label.trim()) return alert('Enter a name for this workflow.');
  if (!form.steps.length) return alert('Add at least one step.');
  if (form.steps.some(s => !s.modelId)) return alert('Select a model for every step.');

  const steps = form.steps.map(s => ({
    type:    'generate',
    modelId: s.modelId,
    params: {
      ...(s.width          !== '' && { width:          Number(s.width) }),
      ...(s.height         !== '' && { height:         Number(s.height) }),
      ...(s.steps          !== '' && { steps:          Number(s.steps) }),
      ...(s.cfgScale       !== '' && { cfgScale:       Number(s.cfgScale) }),
      ...(s.guidance       !== '' && { guidance:       Number(s.guidance) }),
      ...(s.sampler              && { sampler:         s.sampler }),
      ...(s.scheduler            && { scheduler:       s.scheduler }),
      ...(s.negativePrompt       && { negativePrompt:  s.negativePrompt }),
      ...(s.refinerSwitchAt !== '' && { refinerSwitchAt: Number(s.refinerSwitchAt) }),
    },
    review: {
      ...(s.maxIterations !== '' && { maxIterations: Number(s.maxIterations) }),
      ...(s.gracePeriod   !== '' && { gracePeriod:   Number(s.gracePeriod) }),
      humanReview: s.humanReview,
    },
    referenceStrategy: {
      visionNotes: s.visionNotes,
      diffusion: {
        none: 'txt2img',
        one:  s.refOneMode === 'init-image'
          ? { mode: 'init-image', denoise: Number(s.refOneDenoise) || 0.6 }
          : { mode: 'txt2img' },
        many: s.refManyMode === 'init-image'
          ? { mode: 'init-image', denoise: Number(s.refManyDenoise) || 0.6 }
          : { mode: s.refManyMode },
      },
    },
  }));

  await saveWorkflow(props.workflowId, { label: form.label.trim(), steps });
  emit('saved');
}

async function remove() {
  if (!confirm(`Delete "${props.workflow?.label}"?`)) return;
  await deleteWorkflow(props.workflowId);
  emit('deleted');
}
</script>
