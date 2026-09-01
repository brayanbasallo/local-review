/**
 * Deliberately NOT `import 'monaco-editor'`.
 *
 * The default entry pulls in four language SERVICES (typescript, json, css,
 * html) on top of the editor. A read-only diff viewer has no use for them:
 * they exist to provide IntelliSense, go-to-definition and diagnostics
 * against a project we do not have. What we actually want is the Monarch
 * tokenizer for each language, which runs on the main thread.
 *
 * Keeping them cost real time: the first TypeScript file opened paid ~230ms
 * loading `tsMode` and syncing models into a worker — over the 200ms budget,
 * for zero benefit. The two imports below are exactly `editor.main` minus
 * `vs/language/*`, so all 82 tokenizers stay and every service is gone.
 */
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution.js'
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main.js'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

/**
 * One worker, and it is the editor's own — it computes the diff itself.
 * Vite bundles the `?worker` import as its own chunk; this is the ESM path
 * (`getWorkerUrl` is the old AMD one and does not work here).
 */
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

/**
 * Monaco already publishes its own extension registry, so a hand-maintained
 * `.ts -> typescript` table would be strictly worse: more code, less coverage,
 * and stale the moment Monaco adds a language.
 */
function buildLanguageIndex() {
  const byExtension = new Map()
  const byFilename = new Map()

  for (const language of monaco.languages.getLanguages()) {
    for (const extension of language.extensions ?? []) {
      byExtension.set(extension.toLowerCase(), language.id)
    }
    for (const filename of language.filenames ?? []) {
      byFilename.set(filename.toLowerCase(), language.id)
    }
  }

  return { byExtension, byFilename }
}

let languageIndex = null

export function languageForPath(path) {
  languageIndex ??= buildLanguageIndex()

  const filename = path.split('/').pop().toLowerCase()
  const dot = filename.lastIndexOf('.')

  return (
    languageIndex.byFilename.get(filename) ??
    (dot > 0 ? languageIndex.byExtension.get(filename.slice(dot)) : null) ??
    'plaintext'
  )
}

export { monaco }
