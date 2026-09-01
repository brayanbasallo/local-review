<script setup>
import { computed } from 'vue'

const props = defineProps({
  file: { type: Object, required: true },
  // The enclosing folder rows already carry the path, so the tree passes only
  // the leaf name plus how far in to sit.
  label: { type: String, required: true },
  depth: { type: Number, default: 0 },
  selected: { type: Boolean, default: false },
  viewed: { type: Boolean, default: false },
})

defineEmits(['select', 'toggle-viewed'])

const STATUS_LABELS = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied' }

const statusLabel = computed(() => STATUS_LABELS[props.file.status] ?? props.file.status)

// Aligns the status badge under the parent folder's label rather than its chevron.
const indent = computed(() => ({ paddingLeft: `${8 + props.depth * 14}px` }))
</script>

<template>
  <li class="row" :class="[{ selected, viewed }, `status-${file.status}`]">
    <button class="hit" :style="indent" @click="$emit('select', file.path)">
      <span class="status" :title="statusLabel">{{ file.status }}</span>

      <span class="name" :title="file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path">
        {{ label }}
      </span>

      <span v-if="file.isBinary" class="counts mono binary">bin</span>
      <span v-else class="counts mono">
        <span class="stat-added">+{{ file.added }}</span>
        <span class="stat-deleted">-{{ file.deleted }}</span>
      </span>
    </button>

    <label class="viewed-toggle" :title="viewed ? 'Mark as not viewed' : 'Mark as viewed'">
      <input type="checkbox" :checked="viewed" @change="$emit('toggle-viewed', file.path)" />
    </label>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
}

.row:hover {
  background: var(--bg-subtle);
}

.row.selected {
  background: var(--accent-subtle);
}

/* Reviewed files recede but stay reachable — hiding them loses the audit trail. */
.row.viewed .hit {
  opacity: 0.4;
}

.row.viewed .name {
  text-decoration: line-through;
}

.hit {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 5px 4px;
  background: none;
  border: 0;
  color: inherit;
  text-align: left;
}

.status {
  flex: none;
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  /* Not #fff. The status colours invert between themes — dark green/amber in
     light mode, light green/amber in dark mode — so a fixed white measured
     2.5:1 against them in the dark palette. `--bg` tracks the flip and lands
     above 7:1 in both. */
  color: var(--bg);
}

.status-A .status { background: var(--added); }
.status-M .status { background: var(--modified); }
.status-D .status { background: var(--deleted); }
.status-R .status,
.status-C .status { background: var(--moved); }

.name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  /* Plain right-side truncation now: the row holds a bare filename, so the
     left-truncation trick that protected the basename is no longer needed. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.counts {
  flex: none;
  display: flex;
  gap: 5px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.counts.binary {
  color: var(--fg-muted);
}

.viewed-toggle {
  display: grid;
  place-items: center;
  padding: 0 8px;
  cursor: pointer;
}

.viewed-toggle input {
  cursor: pointer;
  accent-color: var(--added);
}
</style>
