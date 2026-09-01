<script setup>
import { useReview } from '../stores/review.js'
import TreeNode from './TreeNode.vue'

const review = useReview()
const { state, visibleFiles, files, fileTree } = review
</script>

<template>
  <aside class="sidebar">
    <div class="search">
      <input
        :value="state.filter"
        type="search"
        placeholder="Filter by name or extension"
        spellcheck="false"
        @input="review.setFilter($event.target.value)"
      />
    </div>

    <p v-if="state.filter && visibleFiles.length !== files.length" class="filter-note">
      {{ visibleFiles.length }} of {{ files.length }} files
    </p>

    <ul v-if="visibleFiles.length" class="files">
      <TreeNode v-for="node in fileTree" :key="node.path" :node="node" :depth="0" />
    </ul>

    <p v-else class="empty">
      {{ state.filter ? 'No files match this filter.' : 'No differences between these refs.' }}
    </p>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--bg-subtle);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.search {
  padding: 10px;
  border-bottom: 1px solid var(--border);
}

.search input {
  width: 100%;
  padding: 5px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.search input:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
  border-color: transparent;
}

.filter-note {
  margin: 0;
  padding: 6px 12px 0;
  font-size: 11px;
  color: var(--fg-muted);
}

.files {
  flex: 1;
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
}

.empty {
  padding: 24px 16px;
  color: var(--fg-muted);
  font-size: 13px;
  text-align: center;
}
</style>
