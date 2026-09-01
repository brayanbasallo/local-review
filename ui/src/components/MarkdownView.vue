<script setup>
import { nextTick, ref, watch } from 'vue'
import { monaco, activeTheme, languageForAlias } from '../monaco/setup.js'

const props = defineProps({
  html: { type: String, default: '' },
})

const root = ref(null)

/**
 * Colours code fences with Monaco's own tokenizers. Same theme and same 82
 * languages as the diff, so a fence looks identical either side of the
 * Source/Rendered toggle — and no second highlighting library.
 *
 * Uses `colorize(text, id)` rather than `colorizeElement(node)`: the latter
 * reads `data-lang` and treats it as a language ID, so a ```ts fence resolves
 * to nothing and the element is emptied instead of left alone.
 */
async function colourFences() {
  await nextTick()
  if (!root.value) return

  const fences = [...root.value.querySelectorAll('pre.md-fence[data-lang]')]

  await Promise.all(
    fences.map(async (fence) => {
      const language = languageForAlias(fence.dataset.lang)
      const code = fence.querySelector('code')
      if (!language || !code) return

      try {
        const coloured = await monaco.editor.colorize(code.textContent, language, {})
        // Only replace on success: a failed colourise must never blank the code.
        code.innerHTML = coloured
      } catch {
        /* leave the plain text in place */
      }
    }),
  )
}

watch(() => props.html, colourFences, { immediate: true })
</script>

<template>
  <!-- The HTML comes from markdown-it with `html: false`, so raw markup in the
       source arrives escaped rather than live. -->
  <article ref="root" class="markdown" v-html="html" />
</template>

<style scoped>
.markdown {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px 64px;
  /* Prose wants a measure, not the full width of a widescreen pane. */
  max-width: 900px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--fg);
}
</style>
