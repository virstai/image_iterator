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
      <span v-if="canToggleSplit" class="hint">Optional — leave blank if using split loading below</span>
    </div>

    <!-- Split-load toggle (split-or-checkpoint archs only) -->
    <div v-if="canToggleSplit">
      <label class="checkbox-label">
        <input type="checkbox" v-model="form.splitLoad"> Use split loading (separate UNet + CLIP + VAE files)
      </label>
    </div>

    <!-- UNet -->
    <label v-if="showSplitField && hasField('unetName')">UNet file
      <select v-model="form.unetName">
        <option value="">— select —</option>
        <option v-for="u in assets.comfyui?.unets" :key="u" :value="u">{{ u }}</option>
      </select>
    </label>

    <!-- CLIP-L (Flux / Anima) -->
    <label v-if="showSplitField && hasField('clipL')">CLIP-L file
      <select v-model="form.clipL">
        <option value="">— select —</option>
        <option v-for="c in assets.comfyui?.clips" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <!-- T5-XXL (Flux only) -->
    <label v-if="showSplitField && hasField('t5xxl')">T5-XXL file
      <select v-model="form.t5xxl">
        <option value="">— select —</option>
        <option v-for="c in assets.comfyui?.clips" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <!-- T5 encoder (Chroma only) -->
    <label v-if="showSplitField && hasField('clipName')">T5 text encoder file
      <select v-model="form.clipName">
        <option value="">— select —</option>
        <option v-for="c in assets.comfyui?.clips" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <!-- VAE (split archs) -->
    <label v-if="showSplitField && hasField('vaeName')">VAE file
      <select v-model="form.vaeName">
        <option value="">— select —</option>
        <option v-for="v in assets.comfyui?.vaes" :key="v" :value="v">{{ v }}</option>
      </select>
    </label>

    <!-- External VAE override (checkpoint archs) -->
    <label v-if="showCheckpoint && hasField('vae')">External VAE <span class="hint">(optional — overrides baked-in)</span>
      <select v-model="form.vae">
        <option value="">— use checkpoint VAE —</option>
        <option v-for="v in assets.comfyui?.vaes" :key="v" :value="v">{{ v }}</option>
      </select>
    </label>

    <!-- SDXL refiner -->
    <div v-if="hasField('refiner')">
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
      </div>
    </div>

    <div class="panel-actions">
      <button class="primary"               @click="save">Save model</button>
      <button class="secondary"             @click="$emit('cancel')">Cancel</button>
      <button v-if="modelId" class="danger" @click="remove">Delete</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue';
import { saveModel, deleteModel } from '../stores/config.js';

const props = defineProps({
  modelId:  { type: String, default: null },
  model:    { type: Object, default: null },
  archMeta: { type: Object, default: () => ({}) },
  assets:   { type: Object, default: () => ({}) },
});
const emit = defineEmits(['saved', 'deleted', 'cancel']);

const form = reactive({
  label: '', architecture: '', splitLoad: false,
  checkpoint: '', unetName: '', clipL: '', t5xxl: '', clipName: '', vaeName: '',
  vae: '', useRefiner: false, refinerCheckpoint: '',
});

watch(() => props.model, m => {
  if (!m) { Object.keys(form).forEach(k => { form[k] = k === 'splitLoad' || k === 'useRefiner' ? false : ''; }); return; }
  form.label             = m.label             ?? '';
  form.architecture      = m.architecture      ?? '';
  form.splitLoad         = !!(m.unetName || props.archMeta[m.architecture]?.loadingMode === 'split');
  form.checkpoint        = m.checkpoint        ?? '';
  form.unetName          = m.unetName          ?? '';
  form.clipL             = m.clipL             ?? '';
  form.t5xxl             = m.t5xxl             ?? '';
  form.clipName          = m.clipName          ?? '';
  form.vaeName           = m.vaeName           ?? '';
  form.vae               = m.vae               ?? '';
  form.useRefiner        = !!m.refinerCheckpoint;
  form.refinerCheckpoint = m.refinerCheckpoint ?? '';
}, { immediate: true });

const arch          = computed(() => form.architecture);
const loadingMode   = computed(() => props.archMeta[arch.value]?.loadingMode ?? '');
const isForcedSplit = computed(() => loadingMode.value === 'split');
const canToggleSplit= computed(() => loadingMode.value === 'split-or-checkpoint');
const isSplit       = computed(() => isForcedSplit.value || (canToggleSplit.value && form.splitLoad));
const showCheckpoint= computed(() => !isSplit.value && loadingMode.value !== '');
const showSplitField= computed(() => isSplit.value);
const archNotes     = computed(() => props.archMeta[arch.value]?.notes ?? null);

function hasField(name) {
  return !!(props.archMeta[arch.value]?.fields?.[name]);
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
