import { createGitRunner } from '../git/exec.js'

/**
 * Resolves the repository root for a directory, or null when it is not
 * inside a Git working tree. Returning the ROOT (not the cwd) matters:
 * running the tool from a subdirectory must still diff the whole repo.
 */
export async function findRepositoryRoot(cwd) {
  const git = createGitRunner(cwd)
  const result = await git.attempt(['rev-parse', '--show-toplevel'])

  return result.ok ? result.stdout.trim() : null
}

/** True when the repository has at least one commit. */
export async function hasCommits(repoRoot) {
  const git = createGitRunner(repoRoot)
  const result = await git.attempt(['rev-parse', '--verify', '--quiet', 'HEAD'])

  return result.ok
}
