import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.ts'
import { listRoutes } from '../src/router.ts'
import { OPENAPI_SPEC } from '../src/openapi.ts'
import { SWAGGER_UI } from '../src/security.ts'

// ── Harness ───────────────────────────────────────────────────────────────────

function fakeKv(initial: Record<string, unknown>) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]))
  const stats = { gets: 0, puts: 0 }
  return {
    stats,
    get: async (key: string) => { stats.gets++; return store.get(key) ?? null },
    put: async (key: string, value: string) => { stats.puts++; store.set(key, value) },
  }
}

const SEED = {
  languages: { default: 'en', supported: [{ code: 'en', label: 'English', label_native: 'English' }] },
  personal: { name: 'Sebas', email: 'a@b.co' },
  projects: [{ id: 'youknow', name: 'YouKnow', context: 'academic', desc: { en: 'Trivia' }, tags: [], github: null, demo: null }],
}

type Limiter = { limit: (o: { key: string }) => Promise<{ success: boolean }> }
function limiter(allow: (key: string, n: number) => boolean): Limiter & { keys: string[] } {
  const keys: string[] = []
  return { keys, limit: async ({ key }) => { keys.push(key); return { success: allow(key, keys.length) } } }
}

function app(extra: Record<string, unknown> = {}) {
  const kv = fakeKv(SEED)
  const env = { CAREER_KV: kv, API_SECRET: 'secret', ALLOWED_ORIGIN: '*', ...extra } as never
  const call = (path: string, init: RequestInit & { auth?: boolean; json?: unknown; ip?: string } = {}) => {
    const headers = new Headers(init.headers)
    if (init.auth) headers.set('Authorization', 'Bearer secret')
    if (init.ip) headers.set('CF-Connecting-IP', init.ip)
    let body = init.body
    if (init.json !== undefined) { body = JSON.stringify(init.json); headers.set('Content-Type', 'application/json') }
    return worker.fetch(new Request('https://api.test' + path, { ...init, headers, body }), env)
  }
  return { call, kv, env }
}

/** A minimal Cache API: a Map keyed by URL, like caches.default for our purposes. */
function installCache() {
  const store = new Map<string, Response>()
  ;(globalThis as unknown as { caches: unknown }).caches = {
    default: {
      match: async (r: Request) => store.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void store.set(r.url, res),
      delete: async (r: Request) => store.delete(r.url),
    },
  }
  return store
}
function removeCache() { delete (globalThis as unknown as { caches?: unknown }).caches }
beforeEach(removeCache)

// ── Security headers ──────────────────────────────────────────────────────────

function assertSecurityHeaders(res: Response, label: string) {
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff', label)
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer', label)
  assert.equal(res.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin', label)
  assert.match(res.headers.get('Strict-Transport-Security') ?? '', /^max-age=\d{7,}/, label)
  assert.ok(res.headers.get('Content-Security-Policy'), label)
}

test('every kind of response carries the security headers', async () => {
  const { call } = app()
  assertSecurityHeaders(await call('/projects'), '200')
  assertSecurityHeaders(await call('/projects/missing'), '404')
  assertSecurityHeaders(await call('/projects', { method: 'POST', json: {} }), '401')
  assertSecurityHeaders(await call('/projects', { method: 'POST', auth: true, json: {} }), '400')
  assertSecurityHeaders(await call('/auth/check', { auth: true }), '204')
  assertSecurityHeaders(await call('/openapi.json'), 'openapi')
  assertSecurityHeaders(await call('/projects', { method: 'OPTIONS' }), 'preflight')
  const etag = (await call('/projects')).headers.get('ETag')!
  assertSecurityHeaders(await call('/projects', { headers: { 'If-None-Match': etag } }), '304')
})

test('the JSON API gets a lock-everything CSP, and CORS is untouched', async () => {
  const res = await app().call('/projects')
  assert.match(res.headers.get('Content-Security-Policy')!, /default-src 'none'/)
  assert.match(res.headers.get('Content-Security-Policy')!, /frame-ancestors 'none'/)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
})

test('the docs page pins Swagger UI with SRI and gets a CSP that matches it', async () => {
  const res = await app().call('/docs')
  assert.equal(res.status, 200)
  assertSecurityHeaders(res, 'docs')
  const html = await res.text()
  const csp = res.headers.get('Content-Security-Policy')!
  const v = SWAGGER_UI.version.replace(/\./g, '\\.')
  // exact version, no floating @5, an integrity hash on both third-party files
  assert.doesNotMatch(html, /swagger-ui-dist@5\//)
  assert.match(html, new RegExp(`swagger-ui-dist@${v}/swagger-ui-bundle\\.js" integrity="sha384-`))
  assert.match(html, new RegExp(`swagger-ui-dist@${v}/swagger-ui\\.css" integrity="sha384-`))
  assert.match(html, /integrity="sha384-[A-Za-z0-9+/]{64}"/)
  // the inline script carries the nonce the CSP names, and nothing else may run
  const nonce = /nonce="([^"]+)"/.exec(html)![1]
  assert.ok(csp.includes(`'nonce-${nonce}'`))
  assert.match(csp, /default-src 'none'/)
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/)
  assert.match(csp, /connect-src 'self'/)
  assert.match(csp, /frame-ancestors 'none'/)
  // a fresh nonce on every request
  const again = (await app().call('/docs')).headers.get('Content-Security-Policy')
  assert.notEqual(again, csp)
})

// ── Auth on EVERY mutating route ─────────────────────────────────────────────

const concrete = (path: string) => path.replace(/:[^/]+/g, 'x')
const mutating = listRoutes().filter((r) => r.method !== 'GET')

test('the router has the write routes we expect (2 singular x 2 + 6 array x 4)', () => {
  const keys = mutating.map((r) => `${r.method} ${r.path}`).sort()
  assert.equal(keys.length, 2 * 2 + 6 * 4)
  assert.ok(keys.includes('PUT /languages') && keys.includes('PATCH /personal'))
  for (const e of ['jobs', 'projects', 'skills', 'education', 'certifications', 'soft-skills']) {
    for (const k of [`POST /${e}`, `PUT /${e}/:id`, `PATCH /${e}/:id`, `DELETE /${e}/:id`]) assert.ok(keys.includes(k), k)
  }
})

test('every mutating route requires auth in the route table', () => {
  assert.deepEqual(mutating.filter((r) => !r.requiresAuth), [])
})

test('every mutating route in the OpenAPI spec exists in the router, and the other way round', () => {
  const fromSpec = Object.entries(OPENAPI_SPEC.paths as Record<string, Record<string, unknown>>)
    .flatMap(([path, ops]) => Object.keys(ops).filter((m) => ['post', 'put', 'patch', 'delete'].includes(m)).map((m) => `${m.toUpperCase()} ${path.replace(/\{[^}]+\}/g, ':id')}`))
    .sort()
  const fromRouter = mutating.map((r) => `${r.method} ${r.path}`).sort()
  assert.deepEqual(fromSpec, fromRouter)
})

for (const route of mutating) {
  test(`${route.method} ${route.path}: 401 with no token, a wrong one or a non-Bearer one, nothing stored`, async () => {
    const { call, kv } = app()
    for (const headers of [{}, { Authorization: 'Bearer nope' }, { Authorization: 'secret' }, { Authorization: 'Basic secret' }, { Authorization: 'Bearer ' }]) {
      const res = await call(concrete(route.path), { method: route.method, headers, json: { id: 'new-one', name: 'N', context: 'work' } })
      assert.equal(res.status, 401, JSON.stringify(headers))
      assert.deepEqual(await res.json(), { error: 'Unauthorized' })
      assert.equal(res.headers.get('Cache-Control'), 'no-store')
    }
    assert.equal(kv.stats.puts, 0)
    assert.equal(kv.stats.gets, 0, 'an unauthenticated write must not even read KV')
  })

  test(`${route.method} ${route.path}: auth is checked before the body is read`, async () => {
    const { env } = app()
    let pulled = false
    // highWaterMark 0: the runtime pulls only when somebody actually reads the body
    const body = new ReadableStream({
      pull(c) { pulled = true; c.enqueue(new TextEncoder().encode('{}')); c.close() },
    }, { highWaterMark: 0 })
    const res = await worker.fetch(
      new Request('https://api.test' + concrete(route.path), { method: route.method, body, duplex: 'half' } as RequestInit),
      env,
    )
    assert.equal(res.status, 401)
    assert.equal(pulled, false, 'the body stream was consumed before the 401')
  })
}

test('with the token the same routes get past auth (not 401)', async () => {
  const { call } = app()
  for (const route of mutating) {
    const res = await call(concrete(route.path), { method: route.method, auth: true, json: {} })
    assert.notEqual(res.status, 401, `${route.method} ${route.path}`)
  }
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

test('without the bindings nothing is limited', async () => {
  const { call } = app()
  for (let i = 0; i < 30; i++) assert.equal((await call('/projects', { method: 'POST', json: {} })).status, 401)
})

test('reads never touch the limiters', async () => {
  const w = limiter(() => false), a = limiter(() => false)
  const { call } = app({ WRITE_LIMITER: w, AUTH_FAIL_LIMITER: a })
  for (const p of ['/projects', '/all', '/personal', '/docs', '/openapi.json', '/']) assert.equal((await call(p)).status, 200, p)
  assert.deepEqual([w.keys, a.keys], [[], []])
})

test('over the write limit gives 429 + Retry-After, even with the right token and before the body is read', async () => {
  const w = limiter(() => false)
  const { call, kv } = app({ WRITE_LIMITER: w })
  const res = await call('/projects', { method: 'POST', auth: true, json: { id: 'a-b', name: 'N', context: 'work' }, ip: '203.0.113.7' })
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '60')
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  assertSecurityHeaders(res, '429')
  assert.equal(kv.stats.puts, 0)
  assert.deepEqual(w.keys, ['w:203.0.113.7'])
})

test('wrong tokens are 401 until the failure limit, then 429; a good token is unaffected by that limiter', async () => {
  const a = limiter((_k, n) => n <= 3)
  const { call } = app({ AUTH_FAIL_LIMITER: a })
  const bad = () => call('/projects', { method: 'POST', headers: { Authorization: 'Bearer nope' }, json: {}, ip: '198.51.100.1' })
  assert.deepEqual([(await bad()).status, (await bad()).status, (await bad()).status, (await bad()).status], [401, 401, 401, 429])
  assert.equal((await call('/projects', { method: 'POST', auth: true, json: {} })).status, 400)
  assert.equal(a.keys.length, 4, 'only failures are counted')
  assert.ok(a.keys.every((k) => k === 'a:198.51.100.1'))
})

test('a limiter that throws never blocks a request', async () => {
  const boom = { limit: async () => { throw new Error('down') } }
  const { call } = app({ WRITE_LIMITER: boom, AUTH_FAIL_LIMITER: boom })
  assert.equal((await call('/projects', { method: 'POST', json: {} })).status, 401)
  assert.equal((await call('/projects', { method: 'POST', auth: true, json: {} })).status, 400)
})

test('/auth/check is throttled like the writes', async () => {
  const { call } = app({ WRITE_LIMITER: limiter(() => false) })
  assert.equal((await call('/auth/check', { auth: true })).status, 429)
})

// ── Edge cache and the query string ──────────────────────────────────────────

test('/all with different query strings is one cache entry and one set of KV reads', async () => {
  const store = installCache()
  const { call, kv } = app()
  const first = await call('/all')
  assert.equal(first.status, 200)
  assert.equal(kv.stats.gets, 8)
  const expected = await first.json()
  for (const q of ['?x=1', '?x=2', '?utm_source=a&b=c', '?']) {
    const res = await call('/all' + q)
    assert.equal(res.status, 200, q)
    assert.deepEqual(await res.json(), expected)
  }
  assert.equal(kv.stats.gets, 8, 'cached: no further KV reads')
  assert.equal(store.size, 1)
})

test('trailing slash and query share the key; different paths do not', async () => {
  const store = installCache()
  const { call } = app()
  await call('/projects'); await call('/projects/?a=1'); await call('/projects?b=2')
  assert.equal(store.size, 1)
  await call('/personal')
  assert.equal(store.size, 2)
})

test('a cached copy still answers If-None-Match with a 304, ETag intact', async () => {
  installCache()
  const { call, kv } = app()
  const etag = (await call('/projects')).headers.get('ETag')!
  const reads = kv.stats.gets
  const res = await call('/projects?cachebust=1', { headers: { 'If-None-Match': etag } })
  assert.equal(res.status, 304)
  assert.equal(res.headers.get('ETag'), etag)
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=30, stale-while-revalidate=120')
  assert.equal(await res.text(), '')
  assert.equal(kv.stats.gets, reads)
  const full = await call('/projects', { headers: { 'If-None-Match': '"stale"' } })
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('Access-Control-Allow-Origin'), '*')
  assertSecurityHeaders(full, 'cached 200')
})

test('a write purges what it changed, so the next read is fresh', async () => {
  const store = installCache()
  const { call } = app()
  await call('/projects'); await call('/all'); await call('/projects/youknow')
  assert.equal(store.size, 3)
  const res = await call('/projects/youknow', { method: 'PATCH', auth: true, json: { name: 'Renamed' } })
  assert.equal(res.status, 200)
  assert.equal(store.size, 0)
  assert.equal(((await (await call('/projects')).json()) as { name: string }[])[0].name, 'Renamed')
  assert.equal(((await (await call('/all')).json()) as { projects: { name: string }[] }).projects[0].name, 'Renamed')
})

test('a failed write does not purge', async () => {
  const store = installCache()
  const { call } = app()
  await call('/projects')
  await call('/projects', { method: 'POST', json: {} })
  await call('/projects', { method: 'POST', auth: true, json: {} })
  assert.equal(store.size, 1)
})

test('errors, /auth/check and the docs are never stored', async () => {
  const store = installCache()
  const { call } = app()
  await call('/projects/missing'); await call('/nope'); await call('/auth/check', { auth: true })
  await call('/docs'); await call('/openapi.json')
  assert.equal(store.size, 0)
})
