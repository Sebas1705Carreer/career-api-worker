/**
 * Security headers added to every response (success, error, 304, 429 and CORS preflight).
 *
 * - CSP for the JSON API forbids everything: a JSON body never needs to load or run anything,
 *   so if a browser ever renders one as a page it stays inert. The docs page sets its own,
 *   looser policy in router.ts and this function leaves an existing CSP alone.
 * - Cross-Origin-Resource-Policy is `cross-origin` on purpose: the portfolio and Folio's web
 *   tooling read this API from other origins, and CORS is already open (ALLOWED_ORIGIN).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
}

export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"

export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', API_CSP)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

// ── Swagger UI (docs page) ───────────────────────────────────────────────────

/**
 * Swagger UI is loaded from unpkg at an exact version, and the browser refuses a file whose
 * content differs from the SRI hash below. The hashes were computed from the published
 * `swagger-ui-dist` 5.33.3 npm tarball and match what unpkg serves. To upgrade: change the
 * version, then recompute with
 *   curl -sL https://unpkg.com/swagger-ui-dist@<version>/<file> | openssl dgst -sha384 -binary | openssl base64 -A
 */
export const SWAGGER_UI = {
  version: '5.33.3',
  cssIntegrity: 'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW',
  jsIntegrity: 'sha384-h00llMzD1afyNow1pDmnZKlHsUZgp9KE9HXLFXF2CvbwsBY0+WBO4f75SfGwvM4K',
} as const

/** Only what Swagger UI needs: its own two files from unpkg, one nonce'd inline script, same-origin requests. */
export function docsCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://unpkg.com/swagger-ui-dist@${SWAGGER_UI.version}/`,
    // Swagger UI injects inline styles at runtime, so style-src needs 'unsafe-inline'
    `style-src 'unsafe-inline' https://unpkg.com/swagger-ui-dist@${SWAGGER_UI.version}/`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}
