import { InvalidRefError } from '../git/index.js'
import { VIRTUAL_REFS } from '../shared/virtual-refs.js'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

const required = (params, name) => {
  const value = params.get(name)
  if (!value) throw new HttpError(400, `Missing required parameter: ${name}`)
  return value
}

/**
 * Two access patterns, deliberately different.
 *
 * `/api/changes` must always be fresh: branch tips move — an LLM commits again
 * while the tab is open — and a reload has to show that. Caching it by branch
 * name would silently serve a stale changeset.
 *
 * `/api/content` instead reuses the snapshot the UI is currently rendering, so
 * the file list a path is validated against is exactly the list the sidebar was
 * built from. That keeps per-file reads to one `git show` rather than re-running
 * two diffs, and keeps the two endpoints internally consistent.
 */
function createChangesetCache(repo) {
  const snapshots = new Map()
  const keyFor = (baseRef, compareRef) => `${baseRef} ${compareRef}`

  const refresh = async (baseRef, compareRef) => {
    const changeset = await repo.listChanges(baseRef, compareRef)
    snapshots.set(keyFor(baseRef, compareRef), changeset)
    return changeset
  }

  const lookup = (baseRef, compareRef) =>
    snapshots.get(keyFor(baseRef, compareRef)) ?? refresh(baseRef, compareRef)

  return { refresh, lookup }
}

export function createRoutes({ repo, shutdown }) {
  const changesets = createChangesetCache(repo)

  return {
    'GET /api/refs': async () => ({
      branches: await repo.refs.listBranches(),
      remotes: await repo.refs.listRemoteBranches(),
      current: await repo.refs.currentRef(),
      virtual: VIRTUAL_REFS,
      repoPath: repo.cwd,
    }),

    'GET /api/changes': async ({ params }) =>
      changesets.refresh(required(params, 'base'), required(params, 'compare')),

    /**
     * The UI asks for a file by its NEW path plus which side it wants; the
     * server owns ref resolution and rename mapping. Git semantics stay out
     * of the frontend entirely.
     *
     * The requested path is whitelisted against the changeset itself — the
     * strongest guard available, since nothing outside the diff is reachable.
     */
    'GET /api/content': async ({ params }) => {
      const path = required(params, 'path')
      const side = required(params, 'side')

      if (side !== 'base' && side !== 'compare') {
        throw new HttpError(400, `side must be "base" or "compare", got: ${side}`)
      }

      const changeset = await changesets.lookup(required(params, 'base'), required(params, 'compare'))
      const file = changeset.files.find((candidate) => candidate.path === path)

      if (!file) throw new HttpError(400, `Path is not part of this changeset: ${path}`)
      if (file.isBinary) return { content: '', state: 'binary' }

      if (side === 'base') {
        if (file.status === 'A') return { content: '', state: 'absent' }
        return repo.contentAt(changeset.baseSha, file.oldPath ?? file.path)
      }

      if (file.status === 'D') return { content: '', state: 'absent' }
      return repo.contentAt(changeset.compareSha ?? changeset.compareRef, file.path)
    },

    /**
     * Tearing the process down inside the handler destroys the socket before
     * the response reaches the browser, so the UI never learns it succeeded.
     * Waiting for `finish` means the reply is fully flushed first.
     */
    'POST /api/shutdown': async ({ body, response }) => {
      response.once('finish', () => shutdown(body ?? {}))
      return { ok: true }
    },
  }
}

export function toHttpError(error) {
  if (error instanceof HttpError) return error
  if (error instanceof InvalidRefError) return new HttpError(400, error.message)
  return new HttpError(500, error.message)
}
