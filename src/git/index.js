import { createGitRunner } from './exec.js'
import { createRefsReader } from './refs.js'
import { createChangesReader } from './changes.js'
import { createContentReader } from './content.js'

/**
 * The single seam between this app and Git. Nothing above this module
 * spawns a process or knows what a revision string looks like.
 */
export function openRepository(cwd) {
  const git = createGitRunner(cwd)
  const refs = createRefsReader(git)

  return {
    cwd,
    refs,
    ...createChangesReader(git, refs),
    ...createContentReader(git),
  }
}

export { GitError } from './exec.js'
export { InvalidRefError } from './changes.js'
export { ContentState } from './content.js'
