import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKING_TREE, STAGED } from '../shared/virtual-refs.js'

export const ContentState = {
  OK: 'ok',
  ABSENT: 'absent',
  BINARY: 'binary',
  TOO_LARGE: 'too-large',
}

const absent = () => ({ content: '', state: ContentState.ABSENT })
const oversize = () => ({ content: '', state: ContentState.TOO_LARGE })

/**
 * `git show` reports a missing path with a distinctive fatal message.
 * Anything else is a real failure and must not be swallowed as "absent".
 */
const isMissingPath = (stderr = '') =>
  /does not exist in|exists on disk, but not in|invalid object name/i.test(stderr)

/**
 * A NUL byte means the payload is not text. numstat already flags binaries,
 * but this catches blobs that Git's own heuristic missed.
 */
const looksBinary = (text) => text.includes('\u0000')

const classify = (text) =>
  looksBinary(text)
    ? { content: '', state: ContentState.BINARY }
    : { content: text, state: ContentState.OK }

export function createContentReader(git) {
  async function fromGit(revision) {
    const result = await git.attempt(['show', revision])

    if (result.ok) return classify(result.stdout)
    if (result.oversize) return oversize()
    if (isMissingPath(result.stderr)) return absent()

    throw new Error(`git show ${revision} failed: ${result.stderr.trim()}`)
  }

  async function fromWorkingTree(path) {
    try {
      return classify(await readFile(join(git.cwd, path), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') return absent()
      throw error
    }
  }

  /**
   * `ref` is either a virtual sentinel or an already-resolved commit SHA.
   * `path` must have been validated against the current changeset by the
   * caller — this layer does not decide what is safe to read.
   */
  function contentAt(ref, path) {
    if (ref === WORKING_TREE) return fromWorkingTree(path)
    if (ref === STAGED) return fromGit(`:${path}`)
    return fromGit(`${ref}:${path}`)
  }

  return { contentAt }
}
