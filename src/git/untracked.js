import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Files Git does not know about yet.
 *
 * `git diff` only ever reports tracked paths, so a brand-new file is invisible
 * to it until someone runs `git add`. That is precisely the file an LLM has
 * just written, which made the working-tree comparison quietly incomplete for
 * the case this tool exists to serve.
 */

/** Past this, counting lines is not worth reading the file for. */
const MAX_MEASURED_BYTES = 50 * 1024 * 1024

const UNMEASURED = { added: 0, deleted: 0, isBinary: false }

/** A trailing newline terminates the last line rather than starting a new one. */
const countLines = (text) => {
  if (text === '') return 0

  const newlines = text.split('\n').length - 1
  return text.endsWith('\n') ? newlines : newlines + 1
}

export function createUntrackedReader(git) {
  /**
   * `--exclude-standard` applies .gitignore and friends, and `--others` lists
   * individual files rather than collapsing whole new directories into one
   * entry (verified — `--directory` would be the one that collapses).
   */
  async function listPaths() {
    const stdout = await git(['ls-files', '--others', '--exclude-standard', '-z'])
    return stdout.split('\0').filter(Boolean)
  }

  async function measure(path) {
    try {
      const fullPath = join(git.cwd, path)
      const { size } = await stat(fullPath)
      if (size > MAX_MEASURED_BYTES) return UNMEASURED

      // Read as bytes: a NUL means binary, and decoding one to UTF-8 just to
      // discard it would be wasted work.
      const bytes = await readFile(fullPath)
      if (bytes.includes(0)) return { added: 0, deleted: 0, isBinary: true }

      return { added: countLines(bytes.toString('utf8')), deleted: 0, isBinary: false }
    } catch {
      // Listed a moment ago, gone now — a build step or the LLM itself.
      return UNMEASURED
    }
  }

  /** Changeset entries shaped exactly like the ones parsed out of `git diff`. */
  async function untrackedEntries() {
    const paths = await listPaths()

    return Promise.all(
      paths.map(async (path) => ({
        status: 'A',
        oldPath: null,
        path,
        ...(await measure(path)),
      })),
    )
  }

  return { untrackedEntries }
}
