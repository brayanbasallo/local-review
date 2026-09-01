/**
 * Graceful shutdown for an http server.
 *
 * `closeAllConnections()` is the part that actually matters: without it the
 * browser's keep-alive sockets hold the listener open and `server.close()`
 * never resolves, leaving the port bound after the process appears to exit.
 */
export function installLifecycle(server, { onExit } = {}) {
  let closing = false

  const close = (reason, exitCode = 0) => {
    if (closing) return
    closing = true

    onExit?.(reason)

    server.closeAllConnections()
    server.close(() => process.exit(exitCode))

    // Never hang the terminal waiting on a socket that will not drain.
    setTimeout(() => process.exit(exitCode), 1500).unref()
  }

  process.on('SIGINT', () => close('SIGINT'))
  process.on('SIGTERM', () => close('SIGTERM'))

  return { close }
}
