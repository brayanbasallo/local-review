/**
 * Turns the flat path list from `/api/changes` into a directory tree.
 *
 * Pure data in, pure data out — no Vue, no DOM. Grouping by directory is a
 * presentation concern, so it lives here rather than leaking into the Git
 * layer, and it stays trivially testable from Node.
 */

/** Folders first, then files; natural order within each group. */
const byKindThenName = (a, b) => {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1

  // Numeric collation puts Widget2 before Widget10, which plain lexicographic
  // ordering gets backwards — and numbered files are common in generated code.
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Merges a folder with its only child while that child is itself a folder, so
 * `ui` -> `src` -> `components` collapses into one `ui/src/components` row.
 *
 * A folder whose only child is a FILE is left alone: that row still carries
 * information (the file), so folding it would hide something.
 *
 * `path` becomes the deepest merged path, which keeps it a real prefix of
 * every descendant — the store relies on that when revealing a selection.
 */
function compressChain(dir) {
  while (dir.children.size === 1) {
    const [only] = dir.children.values()
    if (only.type !== 'dir') break

    dir.label = `${dir.label}/${only.label}`
    dir.path = only.path
    dir.children = only.children
  }

  return dir
}

/**
 * File nodes carry the same totals shape as directories so the roll-up below
 * is one uniform reduce instead of a type switch.
 */
const finaliseFile = (node, viewed) => ({
  type: 'file',
  path: node.path,
  label: node.label,
  file: node.file,
  added: node.file.added,
  deleted: node.file.deleted,
  fileCount: 1,
  viewedCount: viewed?.has(node.path) ? 1 : 0,
})

function finaliseDir(dir, viewed) {
  compressChain(dir)

  const children = [...dir.children.values()]
    .map((child) => (child.type === 'dir' ? finaliseDir(child, viewed) : finaliseFile(child, viewed)))
    .sort(byKindThenName)

  const totals = children.reduce(
    (acc, child) => ({
      added: acc.added + child.added,
      deleted: acc.deleted + child.deleted,
      fileCount: acc.fileCount + child.fileCount,
      viewedCount: acc.viewedCount + child.viewedCount,
    }),
    { added: 0, deleted: 0, fileCount: 0, viewedCount: 0 },
  )

  return { type: 'dir', path: dir.path, label: dir.label, children, ...totals }
}

/**
 * @param files  changeset entries, placed by their NEW path (a cross-directory
 *               rename belongs where it landed, same as GitHub shows it)
 * @param viewed Set of viewed paths, used only for the per-folder roll-up
 */
export function buildFileTree(files, { viewed } = {}) {
  const root = { type: 'dir', path: '', label: '', children: new Map() }

  for (const file of files) {
    const segments = file.path.split('/')
    const filename = segments.pop()

    let cursor = root
    let prefix = ''

    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment

      if (!cursor.children.has(segment)) {
        cursor.children.set(segment, { type: 'dir', path: prefix, label: segment, children: new Map() })
      }
      cursor = cursor.children.get(segment)
    }

    cursor.children.set(filename, { type: 'file', path: file.path, label: filename, file })
  }

  // The synthetic root must not be compressed away, so descend from its children.
  return [...root.children.values()]
    .map((child) => (child.type === 'dir' ? finaliseDir(child, viewed) : finaliseFile(child, viewed)))
    .sort(byKindThenName)
}

/**
 * Files in tree order (depth-first, folders first) — which differs from the
 * `git diff --name-status` order the changeset arrives in. Anything that means
 * "the next file" to the user has to walk this, not the raw list.
 */
export function flattenTree(nodes) {
  const files = []

  const walk = (list) => {
    for (const node of list) {
      if (node.type === 'file') files.push(node.file)
      else walk(node.children)
    }
  }

  walk(nodes)
  return files
}
