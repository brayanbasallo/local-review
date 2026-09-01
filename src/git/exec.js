import { execFile } from 'node:child_process'

/** Default 1MB blows up on any sizeable file. */
const MAX_BUFFER = 50 * 1024 * 1024

export class GitError extends Error {
  constructor(args, { stderr, exitCode }) {
    super(`git ${args.join(' ')} failed: ${(stderr || '').trim() || `exit ${exitCode}`}`)
    this.name = 'GitError'
    this.stderr = stderr
    this.exitCode = exitCode
  }
}

/**
 * Builds a Git runner bound to one repository.
 *
 * Every call goes through execFile with an argument ARRAY — never a shell
 * string. A branch named `; rm -rf ~` is inert data here, not a command.
 */
export function createGitRunner(cwd) {
  /** Never rejects. Use when a non-zero exit is a meaningful answer. */
  const attempt = (args, { maxBuffer = MAX_BUFFER } = {}) =>
    new Promise((resolve) => {
      execFile('git', ['-C', cwd, ...args], { maxBuffer, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (!error) return resolve({ ok: true, stdout, stderr })
        resolve({
          ok: false,
          stdout,
          stderr,
          exitCode: typeof error.code === 'number' ? error.code : null,
          oversize: error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        })
      })
    })

  /** Rejects on non-zero exit. Use when failure is a real error. */
  const git = async (args, options) => {
    const result = await attempt(args, options)
    if (!result.ok) throw new GitError(args, result)
    return result.stdout
  }

  git.attempt = attempt
  git.cwd = cwd

  return git
}
