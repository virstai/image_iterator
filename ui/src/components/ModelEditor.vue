<template>
  <div id="model-editor">
    <hr>
    <h3>{{ modelId ? `Edit: ${model?.label || modelId}` : 'New model' }}</h3>

    <label>Name / label
      <input type="text" v-model="form.label" placeholder="My Flux Dev">
    </label>

    <label>Architecture
      <select v-model="form.architecture">
        <option value="">— select —</option>
        <option v-for="(meta, key) in archMeta" :key="key" :value="key">{{ meta.label || key }}</option>
      </select>
    </label>
    <p v-if="archNotes" class="hint">{{ archNotes }}</p>

    <!-- Checkpoint (non-split) -->
    <div v-if="showCheckpoint">
      <label>Checkpoint
        <select v-model="form.checkpoint">
          <option value="">— select —</option>
          <optgroup v-if="assets.comfyui?.checkpoints?.length" label="Checkpoints">
            <option v-for="c in assets.comfyui.checkpoints" :key="c" :value="c">{{ c }}</option>
          </optgroup>
          <optgroup v-if="assets.comfyui?.unets?.length" label="UNet (diffusion_models)">
            <option v-for="u in assets.comfyui.unets" :key="u" :value="u">{{ u }}</option>
          </optgroup>
        </select>
      </label>
      <span v-if="isFlux" class="hint">Optional — leave blank if using split loading below</span>
    </div>

    <!-- Split-load toggle (flux/flux2 only) -->
    <div v-if="canToggleSplit">
      <label class="checkbox-label">
        <input type="checkbox" v-model="form.splitLoad"> Use split loading (separate UNet + CLIP + VAE files)
      </label>
    </div>

    <!-- UNet (split archs) -->
    <label v-if="showSplitFields && showUnet">{{ arch === 'anima' ? 'Text encoder (CLIP) file' : 'UNet file' }}
      <select v-model="form.unetName">
        <option value="">— select —</option>
        <option v-for="u in assets.comfyui?.unets" :key="u" :value="u">{{ u }}</option>
      </select>
    </label>

    <!-- CLIP-L -->
    <label v-if="showSplitFields && showClipL">{{ arch === 'anima' ? 'Text encoder (CLIP) file' : 'CLIP-L file' }}
      <select v-model="form.clipL">
        <option value="">— select —</option>
        <option v-for="c in assets.comfyui?.clips" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <!-- T5-XXL (flux/flux2 only) -->
    <label v-if="showSplitFields && showT5">T5-XXL file
      <select v-model="form.t5xxl">
        <option value="">— select —</option>
        <option v-for="c in assets.comfyui?.clips" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <!-- T5 encoder (chroma only) -->
    <label v-if="showSplitFields && showClipName">T5 text encoder file
      <select v-model="form.clipName">
        <option value="">— select —</option>
        <option v-for="c in assets.comfyui?.clips" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <!-- VAE (split) -->
    <label v-if="showSplitFields && showVaeSplit">VAE file
      <select v-model="form.vaeName">
        <option value="">— select —</option>
        <option v-for="v in assets.comfyui?.vaes" :key="v" :value="v">{{ v }}</option>
      </select>
    </label>

    <!-- External VAE override (checkpoint archs) -->
    <label v-if="showVaeExternal">External VAE <span class="hint">(optional — overrides baked-in)</span>
      <select v-model="form.vae">
        <option value="">— use checkpoint VAE —</option>
        <option v-for="v in assets.comfyui?.vaes" :key="v" :value="v">{{ v }}</option>
      </select>
    </label>

    <!-- SDXL refiner -->
    <div v-if="arch === 'sdxl'">
      <label class="checkbox-label">
        <input type="checkbox" v-model="form.useRefiner"> Use SDXL refiner
      </label>
      <div v-if="form.useRefiner" class="indent">
        <label>Refiner checkpoint
          <select v-model="form.refinerCheckpoint">
            <option value="">— select —</option>
            <optgroup v-if="assets.comfyui?.checkpoints?.length" label="Checkpoints">
              <option v-for="c in assets.comfyui.checkpoints" :key="c" :value="c">{{ c }}</option>
            </optgroup>
          </select>
        </label>
        <label>Switch at (0–1) <span class="hint">fraction of steps before handing off</span>
          <input type="number" v-model.number="form.refinerSwitchAt" min="0" max="1" step="0.05" placeholder="0.8">
        </label>
      </div>
    </div>

    <!-- Resolution + sampling -->
    <div class="row">
      <label>Width  <input type="number" v-model.number="form.width"  step="64" :placeholder="archDefaultVal('width')"></label>
      <label>Height <input type="number" v-model.number="form.height" step="64" :placeholder="archDefaultVal('height')"></label>
      <label>Steps  <input type="number" v-model.number="form.steps"  min="1"   :placeholder="archDefaultVal('steps')"></label>
    </div>
    <div class="row">
      <label v-if="showCfg">CFG scale
        <input type="number" v-model.number="form.cfgScale" step="0.5" :placeholder="archDefaultVal('cfgScale')">
      </label>
      <label v-if="showGuidance">Guidance
        <input type="number" v-model.number="form.guidance" step="0.5" :placeholder="archDefaultVal('guidance')">
      </label>
      <label>Sampler
        <select v-model="form.sampler">
          <option value="">arch default</option>
          <option>euler</option><option>euler_ancestral</option>
          <option>er_sde</option><option>dpmpp_2m</option>
          <option>dpmpp_2m_sde</option><option>dpmpp_3m_sde</option>
          <option>ddim</option><option>uni_pc</option>
        </select>
      </label>
      <label>Scheduler
        <select v-model="form.scheduler">
          <option value="">arch default</option>
          <option>normal</option><option>karras</option><option>exponential</option>
          <option>sgm_uniform</option><option>simple</option><option>beta</option>
        </select>
      </label>
    </div>

    <label v-if="showNegative">Negative prompt <span class="hint">(leave blank for arch default)</span>
      <textarea v-model="form.negativePrompt" rows="2"></textarea>
    </label>

    <!-- Skill section -->
    <div v-if="skillData" class="skill-section">
      <hr>
      <h3>Model Skill</h3>
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
    <div v-if="modelId" class="skill-section">
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
      <button class="primary"                 @click="save">Save model</button>
      <button class="secondary"               @click="$emit('cancel')">Cancel</button>
      <button v-if="modelId" class="danger"   @click="remove">Delete</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch, onMounted, ref } from 'vue';
import { saveModel, deleteModel, loadSkill, saveNotes, refreshSkill as apiRefreshSkill, configState } from '../stores/config.js';

const props = defineProps({
  modelId:  { type: String, default: null },
  model:    { type: Object, default: null },
  archMeta: { type: Object, default: () => ({}) },
  assets:   { type: Object, default: () => ({}) },
});
const emit = defineEmits(['saved', 'deleted', 'cancel']);

const skillData      = ref(null);
const localNotes     = ref([]);
const addType        = ref('enforce');
const addText        = ref('');
const correctionNote = ref('');
const refreshing     = ref(false);

const form = reactive({
  label: '', architecture: '', splitLoad: false,
  checkpoint: '', unetName: '', clipL: '', t5xxl: '', clipName: '', vaeName: '',
  vae: '', useRefiner: false, refinerCheckpoint: '', refinerSwitchAt: '',
  width: '', height: '', steps: '', cfgScale: '', guidance: '',
  sampler: '', scheduler: '', negativePrompt: '',
});

watch(() => props.model, m => {
  if (!m) { Object.keys(form).forEach(k => { form[k] = k === 'splitLoad' || k === 'useRefiner' ? false : ''; }); return; }
  form.label            = m.label            ?? '';
  form.architecture     = m.architecture     ?? '';
  form.splitLoad        = !!(m.unetName || props.archMeta[m.architecture]?.loadingMode === 'split');
  form.checkpoint       = m.checkpoint       ?? '';
  form.unetName         = m.unetName         ?? '';
  form.clipL            = m.clipL            ?? '';
  form.t5xxl            = m.t5xxl            ?? '';
  form.clipName         = m.clipName         ?? '';
  form.vaeName          = m.vaeName          ?? '';
  form.vae              = m.vae              ?? '';
  form.useRefiner       = !!m.refinerCheckpoint;
  form.refinerCheckpoint = m.refinerCheckpoint ?? '';
  form.refinerSwitchAt  = m.refinerSwitchAt  ?? '';
  form.width            = m.width            ?? '';
  form.height           = m.height           ?? '';
  form.steps            = m.steps            ?? '';
  form.cfgScale         = m.cfgScale         ?? '';
  form.guidance         = m.guidance         ?? '';
  form.sampler          = m.sampler          ?? '';
  form.scheduler        = m.scheduler        ?? '';
  form.negativePrompt   = m.negativePrompt   ?? '';
}, { immediate: true });

watch(() => props.modelId, async id => {
  skillData.value = null;
  localNotes.value = [];
  if (id) {
    skillData.value = await loadSkill(id).catch(() => null);
    localNotes.value = (skillData.value?.notes ?? []).map(n => ({ ...n }));
  }
}, { immediate: true });

const arch = computed(() => form.architecture);
const isFlux = computed(() => arch.value === 'flux' || arch.value === 'flux2');
const isForcedSplit = computed(() => props.archMeta[arch.value]?.loadingMode === 'split');
const isSplit = computed(() => isForcedSplit.value || form.splitLoad);
const canToggleSplit = computed(() => isFlux.value);
const showSplitFields = computed(() => isSplit.value && arch.value);
const showCheckpoint  = computed(() => ['sd15','sdxl','sd3','flux','flux2'].includes(arch.value) && !isSplit.value);
const showUnet        = computed(() => ['flux','flux2','chroma','anima'].includes(arch.value));
const showClipL       = computed(() => ['flux','flux2','anima'].includes(arch.value));
const showT5          = computed(() => isFlux.value);
const showClipName    = computed(() => arch.value === 'chroma');
const showVaeSplit    = computed(() => ['flux','flux2','chroma','anima'].includes(arch.value));
const showVaeExternal = computed(() => ['sd15','sdxl','sd3'].includes(arch.value));
const showCfg         = computed(() => ['sd15','sdxl','sd3','anima'].includes(arch.value));
const showGuidance    = computed(() => ['flux','flux2','chroma'].includes(arch.value));
const showNegative    = computed(() => ['sd15','sdxl','sd3','anima','chroma'].includes(arch.value));
const archNotes       = computed(() => props.archMeta[arch.value]?.notes ?? null);
const outcomeRate = computed(() => {
  const o = skillData.value?.outcomes;
  if (!o) return 0;
  const total = o.accepts + o.rejects;
  return total ? Math.round((o.accepts / total) * 100) : 0;
});

function archDefaultVal(key) {
  const d = props.archMeta[arch.value]?.defaults;
  return d?.[key] != null ? String(d[key]) : 'default';
}

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
    const data = await apiRefreshSkill(props.modelId, correctionNote.value.trim());
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
  const data = await saveNotes(props.modelId, localNotes.value);
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
  const note = { id: genId(), type: addType.value, enabled: false, auto: false };
  if (addType.value === 'enforce') {
    note.text = text;
  } else {
    note.words = text.split(',').map(w => w.trim()).filter(Boolean);
  }
  localNotes.value.push(note);
  addText.value = '';
  await persistNotes();
}

async function save() {
  if (!form.label.trim()) return alert('Enter a name for this model.');
  if (!form.architecture)  return alert('Select an architecture.');

  const data = {
    label:             form.label.trim(),
    architecture:      form.architecture,
    checkpoint:        (!isSplit.value && form.checkpoint)  ? form.checkpoint  : null,
    unetName:          (isSplit.value  && form.unetName)    ? form.unetName    : null,
    vaeName:           (isSplit.value  && form.vaeName)     ? form.vaeName     : null,
    clipL:             (isSplit.value  && form.clipL)       ? form.clipL       : null,
    t5xxl:             (isSplit.value  && form.t5xxl)       ? form.t5xxl       : null,
    clipName:          (isSplit.value  && form.clipName)    ? form.clipName    : null,
    vae:               form.vae              || null,
    refinerCheckpoint: (form.useRefiner && form.refinerCheckpoint) ? form.refinerCheckpoint : null,
    refinerSwitchAt:   (form.useRefiner && form.refinerSwitchAt)   ? parseFloat(form.refinerSwitchAt) : null,
    width:     form.width     !== '' ? Number(form.width)     : null,
    height:    form.height    !== '' ? Number(form.height)    : null,
    steps:     form.steps     !== '' ? Number(form.steps)     : null,
    cfgScale:  form.cfgScale  !== '' ? Number(form.cfgScale)  : null,
    guidance:  form.guidance  !== '' ? Number(form.guidance)  : null,
    sampler:   form.sampler   || null,
    scheduler: form.scheduler || null,
    negativePrompt: form.negativePrompt || null,
  };

  await saveModel(props.modelId, data);
  emit('saved');
}

async function remove() {
  if (!confirm(`Delete "${props.model?.label}"?`)) return;
  await deleteModel(props.modelId);
  emit('deleted');
}
</script>
