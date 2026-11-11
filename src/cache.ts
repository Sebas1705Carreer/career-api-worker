/**
 * Caching for the public reads. Every GET carries an ETag (a hash of the body), so a client that
 * already has the data gets an empty 304 instead of the JSON again, and a short Cache-Control
 * lets browsers reuse it for a few seconds. The window is short on purpose: after an edit in
 * Folio the portfolio shows the change within about a minute.
 */
export const CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120'

async function etagOf(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const hex = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `"${hex}"`
}

/** Does If-None-Match (a list of tags, maybe weak, or *) name this ETag? */
function matches(header: string | null, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  return header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)
}

export async function cachedJson(req: Request, data: unknown): Promise<Response> {
  const body = JSON.stringify(data)
  const etag = await etagOf(body)
  const headers = { ETag: etag, 'Cache-Control': CACHE_CONTROL }
  if (matches(req.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers })
  return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } })
}

// ── Edge cache (Cache API) ───────────────────────────────────────────────────
//
// Without this every public GET reads KV, and /all reads it eight times. A response is stored
// per Cloudflare location for the same 30 seconds the browsers get. The cache key is the path
// only: the query string is ignored, so `/all?x=1` and `/all?x=2` neither bypass the cache nor
// fill it with copies. (The router never looks at the query either.) Only successful public
// reads that carry our Cache-Control are stored; errors, writes, /auth/check and the docs never are.
//
// A write purges the entries it can have changed, but only in the location that handled it:
// other locations serve their copy for at most max-age (30 s), the same staleness the
// browser cache already allowed. The Cache API does nothing on *.workers.dev, only on the custom domain.

type EdgeCache = { match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void>; delete(r: Request): Promise<boolean> }

/** The edge cache, or undefined where the Cache API is not available (Node tests, some dev setups). */
function edgeCache(): EdgeCache | undefined {
  return (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default
}

/** Cache key for a request: origin + path, never the query string or headers. */
export function cacheKeyFor(url: string | URL): Request {
  const u = new URL(url)
  return new Request(`${u.origin}${u.pathname.replace(/\/$/, '') || '/'}`)
}

/** A cached copy for this request, or a 304 when its If-None-Match names the cached ETag. */
export async function readEdgeCache(req: Request): Promise<Response | undefined> {
  const cache = edgeCache()
  if (!cache) return undefined
  try {
    const hit = await cache.match(cacheKeyFor(req.url))
    if (!hit) return undefined
    const etag = hit.headers.get('ETag')
    if (etag && matches(req.headers.get('If-None-Match'), etag)) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE_CONTROL } })
    }
    return new Response(hit.body, { status: hit.status, headers: hit.headers })
  } catch {
    return undefined
  }
}

/** Store a response made by cachedJson. Anything else is ignored. */
export function storeEdgeCache(req: Request, res: Response, ctx?: { waitUntil(p: Promise<unknown>): void }): void {
  const cache = edgeCache()
  if (!cache || res.status !== 200 || !res.headers.get('ETag') || res.headers.get('Cache-Control') !== CACHE_CONTROL) return
  const put = cache.put(cacheKeyFor(req.url), res.clone()).catch(() => undefined)
  ctx?.waitUntil(put)
}

/** After a write to `/<entity>[/<id>]`: drop the copies of that path, the list and /all in this location. */
export async function purgeEdgeCache(url: string): Promise<void> {
  const cache = edgeCache()
  if (!cache) return
  const u = new URL(url)
  const entity = u.pathname.split('/')[1]
  const paths = new Set([u.pathname, `/${entity}`, '/all'])
  await Promise.all([...paths].map((p) => cache.delete(cacheKeyFor(`${u.origin}${p}`)).catch(() => false)))
}
