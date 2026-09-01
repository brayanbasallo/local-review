<script setup>
import { computed } from 'vue'
import { useReview } from '../stores/review.js'
import FileRow from './FileRow.vue'

// Recursive: `<TreeNode>` in the template below resolves to this component via
// its filename. Importing itself would create a circular import warning.

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
})

const review = useReview()
const { state } = review

const expanded = computed(() => review.isExpanded(props.node.path))
const allViewed = computed(() => props.node.fileCount > 0 && props.node.viewedCount === props.node.fileCount)

// Indentation is a style concern but depends on data, so it is bound inline
// rather than duplicated as a class per level.
const indent = computed(() => ({ paddingLeft: `${8 + props.depth * 14}px` }))
</script>

<template>
  <FileRow
    v-if="node.type === 'file'"
    :file="node.file"
    :label="node.label"
    :depth="depth"
    :selected="node.path === state.selectedPath"
    :viewed="state.viewed.has(node.path)"
    @select="review.selectPath"
    @toggle-viewed="review.toggleViewed"
  />

  <li v-else class="dir">
    <button
      class="dir-row"
      :class="{ 'all-viewed': allViewed }"
      :style="indent"
      :aria-expanded="expanded"
      @click="review.toggleCollapsed(node.path)"
    >
      <!-- An SVG rather than a ▸ glyph: at this size the character's actual ink
           is a few pixels and it renders differently per platform font, which
           left the only affordance for "this folder folds" invisible. -->
      <svg class="chevron" :class="{ open: expanded }" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M4.25 2.5 L8.25 6 L4.25 9.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="label" :title="node.path">{{ node.label }}</span>
      <span class="counts mono">
        <span class="stat-added">+{{ node.added }}</span>
        <span class="stat-deleted">-{{ node.deleted }}</span>
      </span>
    </button>

    <ul v-if="expanded" class="children">
      <TreeNode v-for="child in node.children" :key="child.path" :node="child" :depth="depth + 1" />
    </ul>
  </li>
</template>

<style scoped>
.dir {
  list-style: none;
}

.dir-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 8px 4px 0;
  background: none;
  border: 0;
  border-radius: 6px;
  color: inherit;
  text-align: left;
}

.dir-row:hover {
  background: var(--bg-inset);
}

/* Same visual language as a viewed file: recede, but stay readable. */
.dir-row.all-viewed {
  opacity: 0.45;
}

.chevron {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--fg-muted);
  transition: transform 0.12s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.dir-row:hover .chevron {
  color: var(--fg);
}

.label {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
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

.children {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
