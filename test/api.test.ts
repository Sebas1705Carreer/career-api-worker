import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.ts'

/** A KV namespace in memory: enough for what the worker uses (get, put). */
function fakeKv(initial: Record<string, unknown>) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]))
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  }
}

const SEED = {
  languages: { default: 'en', supported: [{ code: 'en', label: 'English', label_native: 'English' }, { code: 'es', label: 'Spanish', label_native: 'Español' }] },
  personal: { name: 'Sebas', email: 'a@b.co', github: 'https://github.com/x', greeting: { en: 'Hi' } },
  projects: [{ id: 'youknow', name: 'YouKnow', context: 'academic', desc: { en: 'Trivia' }, long_desc: { en: 'Long text', es: 'Texto largo' }, tags: ['Kotlin'], github: 'https://github.com/x/y', demo: null }],
  skills: [{ id: 'kotlin', name: 'Kotlin', category: 'languages', level: 4, icon_url: null }],
}

function app(seed: Record<string, unknown> = SEED) {
  const env = { CAREER_KV: fakeKv(seed), API_SECRET: 'secret', ALLOWED_ORIGIN: '*' } as never
  const call = (path: string, init: RequestInit & { auth?: boolean; json?: unknown } = {}) => {
    const headers = new Headers(init.headers)
    if (init.auth) headers.set('Authorization', 'Bearer secret')
    let body = init.body
    if (init.json !== undefined) { body = JSON.stringify(init.json); headers.set('Content-Type', 'application/json') }
    return worker.fetch(new Request('https://api.test' + path, { ...init, headers, body }), env)
  }
  return { call }
}

// ── Caching ───────────────────────────────────────────────────────────────────

test('reads carry an ETag and a short Cache-Control', async () => {
  const res = await app().call('/projects')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('ETag') ?? '', /^"[0-9a-f]{24}"$/)
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=30, stale-while-revalidate=120')
})

test('the same tag in If-None-Match gives an empty 304', async () => {
  const { call } = app()
  const first = await call('/projects')
  const etag = first.headers.get('ETag')!
  const again = await call('/projects', { headers: { 'If-None-Match': etag } })
  assert.equal(again.status, 304)
  assert.equal(await again.text(), '')
  assert.equal(again.headers.get('ETag'), etag)
  // weak form, a list, and * are all understood
  assert.equal((await call('/projects', { headers: { 'If-None-Match': `W/${etag}` } })).status, 304)
  assert.equal((await call('/projects', { headers: { 'If-None-Match': `"other", ${etag}` } })).status, 304)
  assert.equal((await call('/projects', { headers: { 'If-None-Match': '*' } })).status, 304)
})

test('a different tag, or changed data, gives the full body again', async () => {
  const { call } = app()
  const etag = (await call('/projects')).headers.get('ETag')!
  assert.equal((await call('/projects', { headers: { 'If-None-Match': '"stale"' } })).status, 200)
  await call('/projects/youknow', { method: 'PATCH', auth: true, json: { name: 'YouKnow 2' } })
  const after = await call('/projects', { headers: { 'If-None-Match': etag } })
  assert.equal(after.status, 200)
  assert.notEqual(after.headers.get('ETag'), etag)
})

test('writes, errors and 404s are never cached', async () => {
  const { call } = app()
  assert.equal((await call('/projects/youknow', { method: 'PATCH', auth: true, json: {} })).headers.get('Cache-Control'), 'no-store')
  assert.equal((await call('/projects/missing')).headers.get('Cache-Control'), 'no-store')
  assert.equal((await call('/nope')).headers.get('Cache-Control'), 'no-store')
  assert.equal((await call('/projects', { method: 'POST', auth: true, json: {} })).headers.get('Cache-Control'), 'no-store')
})

test('CORS lets a browser send and read the validators', async () => {
  const res = await app().call('/projects')
  assert.equal(res.headers.get('Access-Control-Expose-Headers'), 'ETag')
  assert.match(res.headers.get('Access-Control-Allow-Headers') ?? '', /If-None-Match/)
})

// ── /all ──────────────────────────────────────────────────────────────────────

test('/all returns every entity, with [] and null for what is missing', async () => {
  const res = await app().call('/all')
  assert.equal(res.status, 200)
  const all = await res.json() as Record<string, unknown>
  assert.deepEqual(Object.keys(all).sort(), ['certifications', 'education', 'jobs', 'languages', 'personal', 'projects', 'skills', 'soft-skills'])
  assert.equal((all.projects as unknown[]).length, 1)
  assert.deepEqual(all.jobs, [])
  assert.deepEqual(all['soft-skills'], [])
  assert.deepEqual(all.languages, SEED.languages)
})

test('/all is the same data as the individual endpoints and supports 304', async () => {
  const { call } = app()
  const all = await (await call('/all')).json() as Record<string, unknown>
  assert.deepEqual(all.projects, await (await call('/projects')).json())
  assert.deepEqual(all.personal, await (await call('/personal')).json())
  const etag = (await call('/all')).headers.get('ETag')!
  assert.equal((await call('/all', { headers: { 'If-None-Match': etag } })).status, 304)
})

test('/all needs no token and appears in the root listing', async () => {
  const { call } = app()
  assert.equal((await call('/all')).status, 200)
  const root = await (await call('/')).json() as { endpoints: string[] }
  assert.ok(root.endpoints.includes('/all'))
})

// ── Validation through the real routes ────────────────────────────────────────

test('a bad write is a 400 with the reasons, and nothing is stored', async () => {
  const { call } = app()
  const res = await call('/skills/kotlin', { method: 'PATCH', auth: true, json: { level: 9, name: '' } })
  assert.equal(res.status, 400)
  const body = await res.json() as { error: string; details: string[] }
  assert.equal(body.error, 'Validation failed')
  assert.equal(body.details.length, 2)
  assert.equal(((await (await call('/skills/kotlin')).json()) as { level: number }).level, 4)
})

test('malformed JSON is a 400, not a 500', async () => {
  const { call } = app()
  for (const [method, path] of [['POST', '/projects'], ['PATCH', '/projects/youknow'], ['PUT', '/projects/youknow'], ['PATCH', '/personal'], ['PUT', '/languages']] as const) {
    const res = await call(path, { method, auth: true, body: '{not json', headers: { 'Content-Type': 'application/json' } })
    assert.equal(res.status, 400, `${method} ${path}`)
  }
})

test('an oversized body is a 413', async () => {
  const res = await app().call('/projects/youknow', { method: 'PATCH', auth: true, json: { desc: { en: 'x'.repeat(300_000) } } })
  assert.equal(res.status, 413)
})

test('auth is checked before the body is looked at', async () => {
  assert.equal((await app().call('/projects', { method: 'POST', json: { id: 'x' } })).status, 401)
})

test('the validity probe Folio uses still works', async () => {
  const { call } = app()
  assert.equal((await call('/languages', { method: 'PATCH', auth: true, json: {} })).status, 200)
  assert.equal((await call('/languages', { method: 'PATCH', json: {} })).status, 401)
})

test('a PATCH keeps the fields it does not mention (long_desc survives)', async () => {
  const { call } = app()
  await call('/projects/youknow', { method: 'PATCH', auth: true, json: { github: null, desc: { en: 'Changed' } } })
  const p = await (await call('/projects/youknow')).json() as { github: unknown; long_desc: Record<string, string>; tags: string[]; desc: Record<string, string> }
  assert.equal(p.github, null)
  assert.equal(p.desc.en, 'Changed')
  assert.deepEqual(p.long_desc, { en: 'Long text', es: 'Texto largo' })
  assert.deepEqual(p.tags, ['Kotlin'])
})

test('create then delete, and a duplicate id is a 409', async () => {
  const { call } = app()
  const item = { id: 'new-project', name: 'New', context: 'personal' }
  assert.equal((await call('/projects', { method: 'POST', auth: true, json: item })).status, 201)
  assert.equal((await call('/projects', { method: 'POST', auth: true, json: item })).status, 409)
  assert.equal((await call('/projects/new-project', { method: 'DELETE', auth: true })).status, 200)
  assert.equal((await call('/projects/new-project')).status, 404)
})

test('the default language cannot be set to one that is not supported', async () => {
  const { call } = app()
  assert.equal((await call('/languages', { method: 'PATCH', auth: true, json: { default: 'fr' } })).status, 400)
  assert.equal((await call('/languages', { method: 'PATCH', auth: true, json: { default: 'es' } })).status, 200)
})
