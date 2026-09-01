<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import { useReview } from '../stores/review.js'
import { useDiffEditor } from '../monaco/useDiffEditor.js'
import { languageForPath } from '../monaco/setup.js'
import { renderMarkdown } from '../markdown/render-markdown.js'
import MarkdownView from './MarkdownView.vue'

const review = useReview()
const { state, selectedFile } = review

const container = ref(null)
const { show, clear, changedModifiedLines } = useDiffEditor(container)

const placeholder = shallowRef(null)
const lastSwapMs = shallowRef(null)

const isMarkdown = computed(
  () => Boolean(selectedFile.value) && languageForPath(selectedFile.value.path) === 'markdown',
)

/**
 * Sticky for the session but not persisted, like the tree's collapse state:
 * it is a view mode, and a predictable default matters more than remembering.
 * Rendered is the default because reading the document is the point — the
 * changed-block marks are what make that safe.
 */
const preferRendered = ref(true)
const showRendered = computed(() => isMarkdown.value && preferRendered.value)

const markdownHtml = shallowRef('')

const PLACEHOLDERS = {
  binary: 'Binary file — not shown.',
  'too-large': 'File is too large to display.',
}

/**
 * A single in-flight token guards against a slow fetch for file A landing
 * after the user has already moved on to file B.
 */
let requestToken = 0

async function render(file) {
  const token = (requestToken += 1)

  if (!file) {
    clear()
    placeholder.value = null
    return
  }

  if (file.isBinary) {
    clear()
    placeholder.value = PLACEHOLDERS.binary
    return
  }

  const [base, compare] = await Promise.all([
    review.contentFor(file.path, 'base'),
    review.contentFor(file.path, 'compare'),
  ])

  if (token !== requestToken) return

  const blocked = [base.state, compare.state].find((s) => s in PLACEHOLDERS)
  if (blocked) {
    clear()
    placeholder.value = PLACEHOLDERS[blocked]
    return
  }

  placeholder.value = null
  lastSwapMs.value = show({ path: file.path, original: base.content, modified: compare.content })

  // The editor stays modelled even when hidden: it is what computes the diff
  // the marks are derived from.
  if (languageForPath(file.path) === 'markdown') {
    const changedLines = await changedModifiedLines()
    if (token !== requestToken) return

    markdownHtml.value = renderMarkdown(compare.content, { changedLines })
  } else {
    markdownHtml.value = ''
  }
}

watch(selectedFile, render, { immediate: true })

// Exposed so an end-to-end run can assert the sub-200ms swap budget.
watch(lastSwapMs, (value) => {
  if (value !== null) window.__lastDiffSwapMs = value
})
</script>

<template>
  <section class="viewer">
    <div v-if="selectedFile" class="file-header">
      <span class="path mono">
        <template v-if="selectedFile.oldPath">
          {{ selectedFile.oldPath }} <span class="rename-arrow">&rarr;</span>
        </template>
        {{ selectedFile.path }}
      </span>

      <span class="header-meta">
        <!-- Only for markdown; every other file type keeps the header it had. -->
        <span v-if="isMarkdown" class="mode" role="group" aria-label="Markdown view mode">
          <button :class="{ on: !preferRendered }" @click="preferRendered = false">Source</button>
          <button :class="{ on: preferRendered }" @click="preferRendered = true">Rendered</button>
        </span>

        <span v-if="!selectedFile.isBinary" class="counts mono">
          <span class="stat-added">+{{ selectedFile.added }}</span>
          <span class="stat-deleted">-{{ selectedFile.deleted }}</span>
        </span>
        <label class="viewed">
          <input
            type="checkbox"
            :checked="state.viewed.has(selectedFile.path)"
            @change="review.toggleViewed(selectedFile.path)"
          />
          Viewed
        </label>
        <button class="next" @click="review.selectNextUnviewed()">Next unviewed</button>
      </span>
    </div>

    <p v-if="state.error" class="notice error">{{ state.error }}</p>
    <p v-else-if="state.loading" class="notice">Loading diff&hellip;</p>
    <p v-else-if="!selectedFile" class="notice">Select a file to review.</p>
    <p v-else-if="placeholder" class="notice">{{ placeholder }}</p>

    <MarkdownView v-if="showRendered && !placeholder && !state.error" :html="markdownHtml" />

    <!-- Kept mounted at all times: the DiffEditor instance must never be torn
         down and rebuilt, or file switching costs half a second — and in
         rendered mode it is still the thing computing the diff the marks come
         from, so it stays modelled while hidden. -->
    <div
      v-show="selectedFile && !placeholder && !state.error && !showRendered"
      ref="container"
      class="editor"
    />
  </section>
</template>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}

.viewer > :deep(.markdown) {
  flex: 1;
  min-height: 0;
}

/* Segmented control: one border around the pair, a divider between them. */
.mode {
  display: inline-flex;
  flex: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.mode button {
  padding: 3px 10px;
  background: var(--bg);
  border: 0;
  color: var(--fg-muted);
  font-size: 11.5px;
  font-weight: 500;
}

.mode button + button {
  border-left: 1px solid var(--border);
}

.mode button:hover {
  color: var(--fg);
}

.mode button.on {
  background: var(--accent);
  color: #fff;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
}

.path {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-arrow {
  color: var(--fg-muted);
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
}

.counts {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.viewed {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.viewed input {
  cursor: pointer;
  accent-color: var(--added);
}

.next {
  padding: 3px 10px;
  background: var(--bg);
  color: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}

.next:hover {
  border-color: var(--accent);
}

.notice {
  margin: 0;
  padding: 40px 16px;
  color: var(--fg-muted);
  text-align: center;
}

.notice.error {
  color: var(--deleted);
}

.editor {
  flex: 1;
  min-height: 0;
}
</style>
