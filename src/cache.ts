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
