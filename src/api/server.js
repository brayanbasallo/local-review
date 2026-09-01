import { createServer } from 'node:http'
import { createRoutes, toHttpError } from './routes.js'
import { createStaticHandler } from './static.js'

const MAX_BODY_BYTES = 64 * 1024

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Request body is not valid JSON'))
      }
    })

    request.on('error', reject)
  })

const sendJson = (response, status, payload) => {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

export function createApiServer({ repo, uiDir, shutdown }) {
  const routes = createRoutes({ repo, shutdown })
  const serveStatic = createStaticHandler(uiDir)

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')

    if (!url.pathname.startsWith('/api/')) {
      return serveStatic(request, response)
    }

    const handler = routes[`${request.method} ${url.pathname}`]
    if (!handler) return sendJson(response, 404, { error: `No route for ${request.method} ${url.pathname}` })

    try {
      const body = request.method === 'POST' ? await readJsonBody(request) : null
      sendJson(response, 200, await handler({ params: url.searchParams, body, response }))
    } catch (error) {
      const httpError = toHttpError(error)
      if (httpError.status >= 500) console.error(`[llm-review] ${url.pathname}:`, error)
      sendJson(response, httpError.status, { error: httpError.message })
    }
  })

  return server
}
