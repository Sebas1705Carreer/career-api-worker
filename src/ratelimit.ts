import type { Env } from './types'

/**
 * Rate limiting for the routes that need a token (every write, plus GET /auth/check).
 *
 * Uses Cloudflare's Workers Rate Limiting binding, declared in wrangler.toml (`[[ratelimits]]`),
 * so it needs no dashboard setup and no paid add-on. Two limiters, both keyed by client IP:
 *
 *  - WRITE_LIMITER counts EVERY request to a protected route, before the token is checked.
 *    This is what bounds token guessing: a correct guess made while over the limit is still
 *    refused, because the 429 comes first.
 *  - AUTH_FAIL_LIMITER counts only requests whose token was missing or wrong, with a much
 *    lower ceiling, so a client that keeps sending bad credentials is cut off quickly.
 *
 * Honest limits: the binding is per Cloudflare location and eventually consistent, so the
 * ceilings are approximate and an attacker spread over several locations or many IPs gets
 * more than the nominal rate. It is a brake on noisy clients, not a guarantee. If a binding is
 * missing (local tests, `wrangler dev` without it) requests are simply not limited, and
 * an error from the binding never blocks a request: availability wins over strictness here.
 */
export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'unknown'
}

async function allowed(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true
  try {
    return (await limiter.limit({ key })).success
  } catch {
    return true
  }
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  })
}

/** Called for every request to a protected route, before the token is checked. */
export function allowProtectedRequest(req: Request, env: Env): Promise<boolean> {
  return allowed(env.WRITE_LIMITER, `w:${clientIp(req)}`)
}

/** Called after a protected request failed authentication. */
export function allowAuthFailure(req: Request, env: Env): Promise<boolean> {
  return allowed(env.AUTH_FAIL_LIMITER, `a:${clientIp(req)}`)
}
