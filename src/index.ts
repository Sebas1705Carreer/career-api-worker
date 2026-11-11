import type { Env } from './types'
import { cors, preflight } from './cors'
import { dispatch } from './router'
import { withSecurityHeaders } from './security'
import { purgeEdgeCache, readEdgeCache, storeEdgeCache } from './cache'

type Ctx = { waitUntil(p: Promise<unknown>): void }

async function handle(request: Request, env: Env, ctx?: Ctx): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight(env)

  // Public reads: serve from the edge cache when there is a copy (no KV read)
  const method = request.method.toUpperCase()
  if (method === 'GET') {
    const hit = await readEdgeCache(request)
    if (hit) return cors(hit, env)
  }

  const response = cors(await dispatch(request, env), env)
  // Only the public reads opt in to caching (see cache.ts); writes, errors and the rest never do
  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store')

  if (method === 'GET') storeEdgeCache(request, response, ctx)
  else if (response.status < 300) {
    const purge = purgeEdgeCache(request.url)
    if (ctx) ctx.waitUntil(purge)
    else await purge
  }
  return response
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    return withSecurityHeaders(await handle(request, env, ctx))
  },
} satisfies ExportedHandler<Env>
