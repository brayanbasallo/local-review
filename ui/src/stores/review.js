import { computed, reactive, readonly, watch } from 'vue'
import { api, clearContentCache } from '../api/client.js'
import { buildFileTree, flattenTree } from '../tree/file-tree.js'

const state = reactive({
  repoPath: '',
  branches: [],
  remoteBranches: [],
  virtualRefs: [],
  baseRef: '',
  compareRef: '',
  changeset: null,
  filter: '',
  selectedPath: null,
  viewed: new Set(),
  // Holds CLOSED folders, so an empty set means "everything open" and the
  // default needs no initialisation pass.
  collapsed: new Set(),
  loading: false,
  error: null,
  closed: false,
})

/**
 * Scoped per repository AND per comparison, so switching branches naturally
 * starts a fresh audit instead of inheriting stale checkmarks.
 */
const storageKey = () =>
  state.changeset && `llm-review:${state.repoPath}:${state.changeset.baseSha}..${state.compareRef}`

function loadViewed() {
  const key = storageKey()
  if (!key) return new Set()

  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    return new Set()
  }
}

function persistViewed() {
  const key = storageKey()
  if (!key) return

  try {
    localStorage.setItem(key, JSON.stringify([...state.viewed]))
  } catch {
    // A full or disabled localStorage must not break the review.
  }
}

const files = computed(() => state.changeset?.files ?? [])

const visibleFiles = computed(() => {
  const needle = state.filter.trim().toLowerCase()
  if (!needle) return files.value

  return files.value.filter((file) => file.path.toLowerCase().includes(needle))
})

/**
 * Derived from the ALREADY-FILTERED list, which is what makes search behave
 * correctly for free: non-matching branches simply do not exist in the tree,
 * so there is no pruning pass and nothing to auto-expand.
 */
const fileTree = computed(() => buildFileTree(visibleFiles.value, { viewed: state.viewed }))

/** Files in the order the sidebar shows them, not the order Git listed them. */
const orderedFiles = computed(() => flattenTree(fileTree.value))

const totals = computed(() => state.changeset?.totals ?? { added: 0, deleted: 0 })

const progress = computed(() => ({
  viewed: files.value.filter((file) => state.viewed.has(file.path)).length,
  total: files.value.length,
}))

const selectedFile = computed(
  () => files.value.find((file) => file.path === state.selectedPath) ?? null,
)

async function loadRefs() {
  const refs = await api.refs()

  state.repoPath = refs.repoPath
  state.branches = refs.branches
  state.remoteBranches = refs.remotes ?? []
  state.virtualRefs = refs.virtual
  // Default to "current branch vs what is on disk right now". An LLM has
  // usually just written files and not committed them, so this is the view
  // the tool exists for — opening to an empty diff would be useless.
  state.baseRef ||= refs.current
  state.compareRef ||= refs.virtual[0]?.id ?? refs.current
}

async function loadChanges() {
  if (!state.baseRef || !state.compareRef) return

  state.loading = true
  state.error = null

  try {
    // A fresh changeset invalidates every previously fetched file body.
    clearContentCache()
    state.changeset = await api.changes(state.baseRef, state.compareRef)
    state.viewed = loadViewed()
    // Folder paths from the previous comparison mean nothing here.
    state.collapsed = new Set()
    state.selectedPath = orderedFiles.value[0]?.path ?? null
  } catch (error) {
    state.changeset = null
    state.selectedPath = null
    state.error = error.message
  } finally {
    state.loading = false
  }
}

function contentFor(path, side) {
  return api.content(state.baseRef, state.compareRef, path, side)
}

function toggleViewed(path) {
  if (state.viewed.has(path)) state.viewed.delete(path)
  else state.viewed.add(path)

  persistViewed()
}

/**
 * While a filter is active every folder renders open — you searched in order
 * to find something, so making you unfold it would be perverse.
 */
const isExpanded = (dirPath) => Boolean(state.filter.trim()) || !state.collapsed.has(dirPath)

function toggleCollapsed(dirPath) {
  if (state.collapsed.has(dirPath)) state.collapsed.delete(dirPath)
  else state.collapsed.add(dirPath)
}

/**
 * Opens every folder that contains `path`.
 *
 * Folder node paths are always real prefixes of their descendants (the tree
 * builder guarantees this even for compressed chains), so a prefix test is
 * enough — no tree walk, and deleting a key that is not there is a no-op.
 */
function reveal(path) {
  for (const dirPath of [...state.collapsed]) {
    if (path.startsWith(`${dirPath}/`)) state.collapsed.delete(dirPath)
  }
}

function selectPath(path) {
  reveal(path)
  state.selectedPath = path
}

/**
 * Jumps to the next unreviewed file — the natural rhythm of an audit.
 *
 * Searches forward from the cursor and then WRAPS. Without the wrap, stepping
 * past an unviewed file strands it: the search always restarts from the top and
 * skips whatever you are standing on, so that file becomes unreachable by the
 * button and the audit quietly ends incomplete.
 */
function selectNextUnviewed() {
  const ordered = orderedFiles.value
  const cursor = ordered.findIndex((file) => file.path === state.selectedPath)
  const unviewed = (file) => !state.viewed.has(file.path)

  const next =
    ordered.slice(cursor + 1).find(unviewed) ??
    ordered.find((file) => unviewed(file) && file.path !== state.selectedPath)

  // Never jump somewhere the user cannot see: reveal it on the way in.
  if (next) selectPath(next.path)
}

async function finishReview() {
  try {
    await api.shutdown({
      ...progress.value,
      base: state.baseRef,
      compare: state.compareRef,
    })
  } catch {
    // The server dying mid-response IS the success case here — never let a
    // dropped socket leave the UI pretending the session is still open.
  } finally {
    state.closed = true
  }
}

watch(() => [state.baseRef, state.compareRef], loadChanges)

export function useReview() {
  return {
    state: readonly(state),
    files,
    visibleFiles,
    fileTree,
    totals,
    progress,
    selectedFile,

    loadRefs,
    loadChanges,
    contentFor,
    toggleViewed,
    selectNextUnviewed,
    finishReview,
    selectPath,
    isExpanded,
    toggleCollapsed,

    setBaseRef: (ref) => { state.baseRef = ref },
    setCompareRef: (ref) => { state.compareRef = ref },
    setFilter: (value) => { state.filter = value },
  }
}
