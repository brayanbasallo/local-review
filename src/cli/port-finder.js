import { createServer } from 'node:net'

const ATTEMPTS = 20

const isFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer()

    // Any bind failure — in use, permission denied — means "try the next one".
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '127.0.0.1')
  })

/**
 * First free port at or above `startPort`. Sequential rather than random so
 * the URL stays predictable across runs — muscle memory matters for a tool
 * you open dozens of times a day.
 */
export async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + ATTEMPTS; port += 1) {
    if (await isFree(port)) return port
  }

  throw new Error(`No free port found between ${startPort} and ${startPort + ATTEMPTS - 1}`)
}
