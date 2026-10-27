import type { Env, EntityKey } from './types'
import { ARRAY_ENTITIES, ENTITY_KEYS, SINGULAR_ENTITIES } from './types'
import { isAuthenticated, unauthorized } from './auth'
import { kvGet, kvSet, kvGetById, kvCreate, kvUpdate, kvDelete } from './kv'
import { OPENAPI_SPEC, swaggerUiHtml } from './openapi'
import { cachedJson } from './cache'
import { validateEntity, validateLanguages } from './validate'

type Handler = (req: Request, env: Env, params: Record<string, string>) => Promise<Response>

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: Handler
  requiresAuth: boolean
}

const routes: Route[] = []

function addRoute(
  method: string,
  path: string,
  handler: Handler,
  requiresAuth = false,
) {
  const paramNames: string[] = []
  const pattern = new RegExp(
    '^' +
      path.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name)
        return '([^/]+)'
      }) +
      '$',
  )
  routes.push({ method, pattern, paramNames, handler, requiresAuth })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404)
}

function badRequest(msg: string): Response {
  return json({ error: msg }, 400)
}

function invalid(errors: string[]): Response {
  return json({ error: 'Validation failed', details: errors }, 400)
}

/** Largest write body accepted. The whole portfolio is around 65 KB, so this is generous. */
const MAX_BODY_BYTES = 256 * 1024

async function readJson(req: Request): Promise<{ body: unknown } | { error: Response }> {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return { error: json({ error: 'Body too large' }, 413) }
  try {
    return { body: JSON.parse(text) }
  } catch {
    return { error: badRequest('Invalid JSON body') }
  }
}

function serverError(e: unknown): Response {
  const msg = e instanceof Error ? e.message : 'Internal error'
  return json({ error: msg }, 500)
}

// ── OpenAPI / Swagger UI ──────────────────────────────────────────────────────

addRoute('GET', '/openapi.json', async (req) => {
  const origin = new URL(req.url).origin
  // Inject the real server URL so "Try it out" points to the correct host
  const spec = {
    ...OPENAPI_SPEC,
    servers: [
      { url: origin, description: origin.includes('localhost') ? 'Local development' : 'Production' },
      ...OPENAPI_SPEC.servers.slice(1),
    ],
  }
  return new Response(JSON.stringify(spec, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})

addRoute('GET', '/docs', async (req) => {
  const origin = new URL(req.url).origin
  return new Response(swaggerUiHtml(`${origin}/openapi.json`), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})

// ── Root ─────────────────────────────────────────────────────────────────────

addRoute('GET', '/', async (_req, _env) => {
  return cachedJson(_req, {
    name: 'Career API',
    version: '3.0.0',
    author: 'Sebastián Entrerrios García',
    i18n: 'All localizable fields use { [langCode]: value } — see /languages for supported codes.',
    endpoints: [
      '/all',
      '/languages',
      '/personal',
      '/jobs',
      '/projects',
      '/skills',
      '/education',
      '/certifications',
      '/soft-skills',
    ],
    write_methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    auth: 'Bearer token required for write operations; GET /auth/check verifies a token (204 or 401)',
  })
})

// ── Auth check ────────────────────────────────────────────────────────────────
//
// Lets a client (Folio) find out whether its token is valid without writing anything: 204 when it
// is, 401 (from the dispatcher, before this handler runs) when it is missing or wrong. No KV
// access, no body, and never cached: it does not go through cachedJson, so no ETag and no 304.

addRoute('GET', '/auth/check', async () => {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}, true)

// ── All entities in one request ───────────────────────────────────────────────
//
// The portfolio and Folio need every entity to draw their first screen: one request instead of
// eight. The individual endpoints keep working.

addRoute('GET', '/all', async (req, env) => {
  const entries = await Promise.all(
    ENTITY_KEYS.map(async (key) => {
      const value = await kvGet(env, key)
      return [key, value ?? (SINGULAR_ENTITIES.includes(key) ? null : [])] as const
    }),
  )
  return cachedJson(req, Object.fromEntries(entries))
})

// ── Languages (singular) ──────────────────────────────────────────────────────
//
// Stored as: { supported: [{ code, label, label_native }], default: "en" }
// Any consumer can fetch /languages to know which codes are valid and render
// a language switcher. Add new codes here, then PATCH each entity to include
// the translations for the new code.

addRoute('GET', '/languages', async (req, env) => {
  const data = await kvGet(env, 'languages')
  if (!data) return notFound('Languages not seeded yet')
  return cachedJson(req, data)
})

addRoute('PUT', '/languages', async (req, env) => {
  const read = await readJson(req)
  if ('error' in read) return read.error
  const errors = validateEntity('languages', read.body, 'replace')
  if (errors.length) return invalid(errors)
  await kvSet(env, 'languages', read.body)
  return json(read.body)
}, true)

addRoute('PATCH', '/languages', async (req, env) => {
  const read = await readJson(req)
  if ('error' in read) return read.error
  if (typeof read.body !== 'object' || read.body === null || Array.isArray(read.body)) return invalid(['body must be a JSON object'])
  const current = (await kvGet(env, 'languages')) ?? {}
  const updated = { ...(current as object), ...(read.body as object) }
  // The merged result is what gets stored, so that is what has to be valid
  const errors = validateLanguages(updated as Record<string, unknown>)
  if (errors.length) return invalid(errors)
  await kvSet(env, 'languages', updated)
  return json(updated)
}, true)

// ── Singular entity: /personal ────────────────────────────────────────────────

addRoute('GET', '/personal', async (req, env) => {
  const data = await kvGet(env, 'personal')
  if (!data) return notFound('Personal data not seeded yet')
  return cachedJson(req, data)
})

addRoute('PUT', '/personal', async (req, env) => {
  const read = await readJson(req)
  if ('error' in read) return read.error
  const errors = validateEntity('personal', read.body, 'replace')
  if (errors.length) return invalid(errors)
  await kvSet(env, 'personal', read.body)
  return json(read.body)
}, true)

addRoute('PATCH', '/personal', async (req, env) => {
  const read = await readJson(req)
  if ('error' in read) return read.error
  const errors = validateEntity('personal', read.body, 'patch')
  if (errors.length) return invalid(errors)
  const current = (await kvGet(env, 'personal')) ?? {}
  const updated = { ...(current as object), ...(read.body as object) }
  await kvSet(env, 'personal', updated)
  return json(updated)
}, true)

// ── Array entities: generic CRUD ──────────────────────────────────────────────

for (const entity of ARRAY_ENTITIES) {
  const e = entity // capture

  // GET all
  addRoute('GET', `/${e}`, async (req, env) => {
    const list = await kvGet(env, e)
    return cachedJson(req, list ?? [])
  })

  // GET by id
  addRoute('GET', `/${e}/:id`, async (req, env, params) => {
    const item = await kvGetById(env, e, params.id)
    if (!item) return notFound(`${e}/${params.id} not found`)
    return cachedJson(req, item)
  })

  // POST create
  addRoute('POST', `/${e}`, async (req, env) => {
    try {
      const read = await readJson(req)
      if ('error' in read) return read.error
      const errors = validateEntity(e, read.body, 'create')
      if (errors.length) return invalid(errors)
      const body = read.body as { id: string }
      await kvCreate(env, e, body)
      return json(body, 201)
    } catch (err) {
      return err instanceof Error && err.message.includes('already exists')
        ? json({ error: err.message }, 409)
        : serverError(err)
    }
  }, true)

  // PUT replace
  addRoute('PUT', `/${e}/:id`, async (req, env, params) => {
    try {
      const read = await readJson(req)
      if ('error' in read) return read.error
      // PUT merges into the stored item, like PATCH, so only what is sent is checked
      const errors = validateEntity(e, read.body, 'patch')
      if (errors.length) return invalid(errors)
      const updated = await kvUpdate(env, e, params.id, { ...(read.body as object), id: params.id })
      return json(updated)
    } catch (err) {
      return err instanceof Error && err.message.includes('not found')
        ? notFound(err.message)
        : serverError(err)
    }
  }, true)

  // PATCH partial update
  addRoute('PATCH', `/${e}/:id`, async (req, env, params) => {
    try {
      const read = await readJson(req)
      if ('error' in read) return read.error
      const errors = validateEntity(e, read.body, 'patch')
      if (errors.length) return invalid(errors)
      const updated = await kvUpdate(env, e, params.id, read.body as Record<string, unknown>)
      return json(updated)
    } catch (err) {
      return err instanceof Error && err.message.includes('not found')
        ? notFound(err.message)
        : serverError(err)
    }
  }, true)

  // DELETE
  addRoute('DELETE', `/${e}/:id`, async (_req, env, params) => {
    try {
      const deleted = await kvDelete(env, e, params.id)
      return json(deleted)
    } catch (err) {
      return err instanceof Error && err.message.includes('not found')
        ? notFound(err.message)
        : serverError(err)
    }
  }, true)
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatch(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const pathname = url.pathname.replace(/\/$/, '') || '/'
  const method = req.method.toUpperCase()

  for (const route of routes) {
    if (route.method !== method) continue
    const match = route.pattern.exec(pathname)
    if (!match) continue

    const params: Record<string, string> = {}
    route.paramNames.forEach((name, i) => {
      params[name] = match[i + 1]
    })

    if (route.requiresAuth && !isAuthenticated(req, env)) {
      return unauthorized()
    }

    try {
      return await route.handler(req, env, params)
    } catch (e) {
      return serverError(e)
    }
  }

  return notFound(`Route ${method} ${pathname} not found`)
}
