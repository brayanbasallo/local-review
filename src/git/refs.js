import { isVirtualRef } from '../shared/virtual-refs.js'

/**
 * `--end-of-options` stops Git from reading a ref that begins with '-'
 * as a flag. execFile already blocks shell injection; this blocks
 * argument injection, which is the remaining hole.
 */
const endOfOptions = (...args) => ['--end-of-options', ...args]

export function createRefsReader(git) {
  /** Resolves a ref to a commit SHA, or null when it is not a valid commit. */
  async function resolveCommit(ref) {
    if (typeof ref !== 'string' || ref.length === 0 || isVirtualRef(ref)) return null

    const result = await git.attempt([
      'rev-parse', '--verify', '--quiet', ...endOfOptions(`${ref}^{commit}`),
    ])

    return result.ok ? result.stdout.trim() : null
  }

  /**
   * `%(upstream:track)` emits one of: nothing (in sync, or no upstream at all),
   * `[ahead N]`, `[behind N]`, `[ahead N, behind M]`, or `[gone]` when the
   * configured upstream no longer exists. Parsed by pattern rather than by
   * position so all five shapes are covered, not just the common one.
   */
  const parseTracking = (upstream, track) => {
    if (!upstream) return null
    if (track === '[gone]') return { upstream, gone: true, ahead: 0, behind: 0 }

    const count = (word) => Number(new RegExp(`${word} (\\d+)`).exec(track)?.[1] ?? 0)
    return { upstream, gone: false, ahead: count('ahead'), behind: count('behind') }
  }

  /**
   * Local branches with their upstream status. A branch that is BEHIND its
   * upstream is a misleading diff base — the merge-base it produces is not the
   * one a pull request would use — so the caller needs that fact up front.
   *
   * Tab-separated is safe here: Git forbids control characters in refnames.
   */
  async function listBranches() {
    const stdout = await git([
      'for-each-ref',
      '--format=%(refname:short)%09%(upstream:short)%09%(upstream:track)',
      '--sort=-committerdate',
      'refs/heads',
    ])

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, upstream, track] = line.split('\t')
        return { name, tracking: parseTracking(upstream, track ?? '') }
      })
  }

  const REMOTES_PREFIX = 'refs/remotes/'

  /**
   * Remote-tracking branches, as of the last fetch — this never touches the
   * network. Useful as a diff base when the local counterpart has fallen
   * behind, since the merge-base against a stale local branch is not the one
   * a real pull request would compute.
   *
   * Formats with the FULL refname on purpose. `%(refname:short)` renders
   * `refs/remotes/origin/HEAD` as a bare `origin`, which is an alias for the
   * default branch and would show up as a bogus duplicate entry — and the
   * shortened form gives nothing left to filter on. `for-each-ref --exclude`
   * would also work but only on Git 2.36+, and failing the whole endpoint on
   * an older Git is a worse trade than four lines of filtering.
   */
  async function listRemoteBranches() {
    const stdout = await git([
      'for-each-ref', '--format=%(refname)', '--sort=-committerdate', 'refs/remotes',
    ])

    return stdout
      .split('\n')
      .filter((refname) => refname.startsWith(REMOTES_PREFIX) && !refname.endsWith('/HEAD'))
      .map((refname) => refname.slice(REMOTES_PREFIX.length))
  }

  /** Returns the branch name, or a short SHA when HEAD is detached. */
  async function currentRef() {
    const name = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    if (name !== 'HEAD') return name
    return (await git(['rev-parse', '--short', 'HEAD'])).trim()
  }

  /** Fork point of two refs, or null for unrelated histories. */
  async function mergeBase(a, b) {
    const result = await git.attempt(['merge-base', ...endOfOptions(a, b)])
    return result.ok ? result.stdout.trim() : null
  }

  return { resolveCommit, listBranches, listRemoteBranches, currentRef, mergeBase }
}
