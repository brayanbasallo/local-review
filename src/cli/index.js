import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openRepository } from '../git/index.js'
import { createApiServer } from '../api/server.js'
import { findRepositoryRoot, hasCommits } from './repo-guard.js'
import { findFreePort } from './port-finder.js'
import { openInBrowser } from './browser-opener.js'
import { installLifecycle } from './lifecycle.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_PORT = 3000

const USAGE = `
  llm-review — review a Git diff in a local GitHub-style PR UI

  Usage:  llm-review [options]

  Options:
    --port <n>    Preferred port (default: ${DEFAULT_PORT}; the next free one is used if taken)
    --no-open     Do not launch the browser
    -h, --help    Show this help
`

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, open: true, help: false }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--no-open') options.open = false
    else if (arg === '-h' || arg === '--help') options.help = true
    else if (arg === '--port') {
      const port = Number(argv[i + 1])
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`--port expects a number between 1 and 65535, got: ${argv[i + 1]}`)
      }
      options.port = port
      i += 1
    } else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

const fail = (message) => {
  console.error(`\n  llm-review: ${message}\n`)
  process.exit(1)
}

const reviewSummary = ({ viewed, total, base, compare }) => {
  if (!Number.isInteger(total)) return '  Review session closed.'

  const suffix = base && compare ? `  (${base} -> ${compare})` : ''
  return `  Review closed: ${viewed ?? 0}/${total} files marked as viewed.${suffix}`
}

export async function run(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    fail(error.message)
    return
  }

  if (options.help) {
    console.log(USAGE)
    return
  }

  const repoRoot = await findRepositoryRoot(process.cwd())
  if (!repoRoot) fail(`not a Git repository: ${process.cwd()}`)
  if (!(await hasCommits(repoRoot))) fail(`repository has no commits yet: ${repoRoot}`)

  const port = await findFreePort(options.port)
  const url = `http://localhost:${port}`

  const server = createApiServer({
    repo: openRepository(repoRoot),
    uiDir: join(PACKAGE_ROOT, 'ui/dist'),
    shutdown: (session) => lifecycle.close(reviewSummary(session)),
  })

  const lifecycle = installLifecycle(server, {
    onExit: (reason) => console.log(`\n${reason.startsWith('SIG') ? '  Interrupted.' : reason}\n`),
  })

  // findFreePort probes and releases, so another process can still win the
  // race. Without this the failure surfaces as an unhandled 'error' event.
  server.on('error', (error) => {
    fail(
      error.code === 'EADDRINUSE'
        ? `port ${port} was taken while starting up — try again, or pass --port`
        : error.message,
    )
  })

  server.listen(port, '127.0.0.1', async () => {
    console.log(`\n  llm-review\n  repo:  ${repoRoot}\n  url:   ${url}\n`)
    console.log('  Press Ctrl+C to stop.\n')

    if (options.open && !(await openInBrowser(url))) {
      console.log(`  Could not open the browser automatically — visit ${url}\n`)
    }
  })
}
