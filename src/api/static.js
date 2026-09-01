import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const mimeFor = (path) => MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'

async function fileAt(path) {
  try {
    const stats = await stat(path)
    return stats.isFile() ? stats : null
  } catch {
    return null
  }
}

/**
 * Serves the built UI. Requests that match no file fall back to index.html
 * so client-side routing keeps working.
 */
export function createStaticHandler(rootDir) {
  const root = resolve(rootDir)
  const indexPath = join(root, 'index.html')

  return async function serveStatic(request, response) {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const candidate = resolve(join(root, requested))

    // Anything resolving outside the build directory is not ours to serve.
    const withinRoot = candidate === root || candidate.startsWith(root + sep)
    const target = (withinRoot && (await fileAt(candidate))) ? candidate : indexPath

    if (!(await fileAt(target))) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(
        'The UI bundle is missing.\n\nBuild it first:  npm run build\n' +
          `Expected at: ${indexPath}\n`,
      )
      return
    }

    response.writeHead(200, {
      'Content-Type': mimeFor(target),
      // Immutable hashed assets are safe to cache; index.html must not be.
      'Cache-Control': target === indexPath ? 'no-cache' : 'public, max-age=31536000, immutable',
    })

    createReadStream(target).pipe(response)
  }
}
