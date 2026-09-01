/**
 * Sentinels for comparison targets that are not real Git refs.
 *
 * They start with ':' on purpose: Git forbids colons in refnames
 * (git-check-ref-format), so these can never collide with a real
 * branch, tag or SHA. No escaping, no ambiguity.
 */
export const WORKING_TREE = ':working-tree'
export const STAGED = ':staged'

export const VIRTUAL_REFS = [
  { id: WORKING_TREE, label: 'Working Tree (uncommitted)' },
  { id: STAGED, label: 'Staged (index)' },
]

const VIRTUAL_IDS = new Set(VIRTUAL_REFS.map((r) => r.id))

export const isVirtualRef = (ref) => VIRTUAL_IDS.has(ref)
