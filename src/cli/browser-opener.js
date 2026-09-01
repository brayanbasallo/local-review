import { execFile } from 'node:child_process'

/**
 * Opens the system default browser. macOS-only by design (see README);
 * failure is never fatal — the URL is always printed to the terminal too.
 */
export function openInBrowser(url) {
  return new Promise((resolve) => {
    execFile('open', [url], (error) => resolve(!error))
  })
}
