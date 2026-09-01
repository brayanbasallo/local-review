<script setup>
import { onMounted } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
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

    <!-- `auto-save-id` persists the layout to localStorage. Panel width is a
         workspace preference like a window size, so unlike the tree's collapse
         state it should survive a reload. -->
    <SplitterGroup class="app-body" direction="horizontal" auto-save-id="llm-review:panels">
      <!-- Percentages, stated as percentages. `size-unit="px"` looks tempting
           for a sidebar but only converts to a percentage once, at mount,
           against whatever the container width happened to be — after that
           size, min and max are all proportional. Writing `min-size: 200` and
           getting a 148px floor is a trap for the next reader.

           25% is ~320px at 1280 wide, which is where this pane started. -->
      <SplitterPanel class="pane" :default-size="25" :min-size="15" :max-size="45">
        <SidebarTree />
      </SplitterPanel>

      <!-- A hairline divider that is hard to grab is its own kind of bug, so
           the hit area is widened well past the 1px that is drawn. -->
      <SplitterResizeHandle class="handle" :hit-area-margins="{ coarse: 10, fine: 6 }" />

      <SplitterPanel class="pane" :min-size="20">
        <DiffViewer />
      </SplitterPanel>
    </SplitterGroup>
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
