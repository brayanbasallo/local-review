import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { monaco, languageForPath } from './setup.js'

const EDITOR_OPTIONS = {
  renderSideBySide: true,
  /**
   * Monaco falls back to the unified view whenever the diff is narrower than
   * `renderSideBySideInlineBreakpoint` (900px). Reasonable on its own, but it
   * turns dragging the sidebar wider into a silent switch away from the
   * side-by-side view this tool exists to show — and the original|modified
   * divider disappears with it, since a unified view has nothing to split.
   */
  useInlineViewWhenSpaceIsLimited: false,
  /** Makes the original|modified boundary draggable. */
  enableSplitViewResizing: true,
  readOnly: true,
  originalEditable: false,
  automaticLayout: true,
  renderOverviewRuler: true,
  ignoreTrimWhitespace: false,
  scrollBeyondLastLine: false,
  fontSize: 12.5,
  lineHeight: 20,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  minimap: { enabled: false },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  diffCodeLens: false,
  // Word-level highlighting inside a changed line, the way GitHub shows it.
  renderIndicators: true,
}

/**
 * Owns exactly ONE DiffEditor for the lifetime of the component.
 *
 * This is the whole performance story. Creating a DiffEditor costs roughly
 * half a second; swapping its models costs tens of milliseconds. Switching
 * files must never recreate the instance.
 */
export function useDiffEditor(containerRef) {
  const editor = shallowRef(null)
  let models = null

  onMounted(() => {
    monaco.editor.setTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs')
    editor.value = monaco.editor.createDiffEditor(containerRef.value, EDITOR_OPTIONS)
  })

  onBeforeUnmount(() => {
    editor.value?.dispose()
    models?.original.dispose()
    models?.modified.dispose()
  })

  /** Returns how long the swap took, so the 200ms budget can be asserted. */
  function show({ path, original, modified }) {
    if (!editor.value) return 0

    const startedAt = performance.now()
    const language = languageForPath(path)

    const next = {
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    }

    editor.value.setModel(next)

    // Dispose only after the editor has let go of them — disposing an
    // attached model throws inside Monaco.
    models?.original.dispose()
    models?.modified.dispose()
    models = next

    return performance.now() - startedAt
  }

  function clear() {
    editor.value?.setModel(null)
    models?.original.dispose()
    models?.modified.dispose()
    models = null
  }

  return { editor, show, clear }
}
