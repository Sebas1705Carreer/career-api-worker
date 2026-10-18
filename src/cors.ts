import type { Env } from './types'

export function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
    // Lets a browser script read the ETag it will send back as If-None-Match
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
  }
}

export function cors(res: Response, env: Env): Response {
  const h = corsHeaders(env)
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(h)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

export function preflight(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) })
}
