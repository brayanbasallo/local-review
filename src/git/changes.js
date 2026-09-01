import { WORKING_TREE, STAGED, isVirtualRef } from '../shared/virtual-refs.js'

export class InvalidRefError extends Error {
  constructor(ref) {
    super(`Not a valid Git ref: ${ref}`)
    this.name = 'InvalidRefError'
    this.ref = ref
  }
}

/** Splits NUL-terminated Git output into fields, dropping the trailing empty. */
const nulFields = (stdout) => {
  const fields = stdout.split('\0')
  if (fields.at(-1) === '') fields.pop()
  return fields
}

/**
 * `--numstat -z -M` emits one field per file: "added\tdeleted\tpath".
 * A rename instead emits THREE fields: "added\tdeleted\t", oldPath, newPath.
 * Binary files carry '-' in place of both counts.
 * (Format verified empirically against git 2.54.)
 */
function parseNumstat(stdout) {
  const fields = nulFields(stdout)
  const stats = new Map()

  for (let i = 0; i < fields.length; i += 1) {
    const [added, deleted, inlinePath] = fields[i].split('\t')
    let path = inlinePath

    if (path === '') {
      // Rename: the two following fields are oldPath and newPath.
      path = fields[i + 2]
      i += 2
    }

    const isBinary = added === '-' || deleted === '-'
    stats.set(path, {
      added: isBinary ? 0 : Number(added),
      deleted: isBinary ? 0 : Number(deleted),
      isBinary,
    })
  }

  return stats
}

/**
 * `--name-status -z -M` emits status then path — except renames and copies,
 * which emit status ("R091"), oldPath, newPath.
 */
function parseNameStatus(stdout) {
  const fields = nulFields(stdout)
  const entries = []

  for (let i = 0; i < fields.length; i += 2) {
    const status = fields[i][0]
    const isMove = status === 'R' || status === 'C'

    entries.push({
      status,
      oldPath: isMove ? fields[i + 1] : null,
      path: isMove ? fields[i + 2] : fields[i + 1],
    })

    if (isMove) i += 1
  }

  return entries
}

export function createChangesReader(git, refs) {
  /**
   * Resolves which two snapshots to compare, and the exact `git diff`
   * arguments that compare them.
   *
   * For two real refs the base is the MERGE-BASE, not the base tip — that is
   * what three-dot diff compares against, and reading original content from
   * anywhere else produces phantom diffs when base has moved on.
   */
  async function resolveComparison(baseRef, compareRef) {
    const baseTip = await refs.resolveCommit(baseRef)
    if (!baseTip) throw new InvalidRefError(baseRef)

    if (isVirtualRef(compareRef)) {
      // Nothing to fork from: base tip vs the local tree/index.
      return {
        baseSha: baseTip,
        compareRef,
        diffArgs: compareRef === STAGED
          ? ['--cached', '--end-of-options', baseTip]
          : ['--end-of-options', baseTip],
      }
    }

    const compareSha = await refs.resolveCommit(compareRef)
    if (!compareSha) throw new InvalidRefError(compareRef)

    const forkPoint = await refs.mergeBase(baseTip, compareSha)
    const baseSha = forkPoint ?? baseTip

    // Two-dot between the fork point and compare == three-dot between the
    // branches, but stated explicitly so content reads cannot drift from it.
    return { baseSha, compareRef, compareSha, diffArgs: ['--end-of-options', baseSha, compareSha] }
  }

  async function listChanges(baseRef, compareRef) {
    const comparison = await resolveComparison(baseRef, compareRef)

    const [numstatOut, nameStatusOut] = await Promise.all([
      git(['diff', '--numstat', '-z', '-M', ...comparison.diffArgs]),
      git(['diff', '--name-status', '-z', '-M', ...comparison.diffArgs]),
    ])

    const stats = parseNumstat(numstatOut)

    // name-status drives the order and identity; numstat only adds counts.
    const files = parseNameStatus(nameStatusOut).map((entry) => {
      const stat = stats.get(entry.path) ?? { added: 0, deleted: 0, isBinary: false }
      return { ...entry, ...stat }
    })

    return {
      baseRef,
      baseSha: comparison.baseSha,
      compareRef: comparison.compareRef,
      compareSha: comparison.compareSha ?? null,
      files,
      totals: files.reduce(
        (acc, f) => ({ added: acc.added + f.added, deleted: acc.deleted + f.deleted }),
        { added: 0, deleted: 0 },
      ),
    }
  }

  return { listChanges, resolveComparison }
}
