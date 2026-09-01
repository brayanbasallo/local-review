<script setup>
import { onMounted } from 'vue'
import { useReview } from './stores/review.js'
import TopBar from './components/TopBar.vue'
import SidebarTree from './components/SidebarTree.vue'
import DiffViewer from './components/DiffViewer.vue'

const review = useReview()
const { state, progress } = review

onMounted(review.loadRefs)
</script>

<template>
  <div v-if="state.closed" class="closed">
    <h1>Review closed</h1>
    <p>{{ progress.viewed }} of {{ progress.total }} files marked as viewed.</p>
    <p class="hint">The local server has stopped. You can close this tab.</p>
  </div>

  <div v-else class="app-shell">
    <TopBar />
    <div class="app-body">
      <SidebarTree />
      <DiffViewer />
    </div>
  </div>
</template>

<style scoped>
.closed {
  display: grid;
  place-content: center;
  gap: 6px;
  height: 100%;
  text-align: center;
}

.closed h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.closed p {
  margin: 0;
  color: var(--fg-muted);
}

.hint {
  font-size: 13px;
}
</style>
