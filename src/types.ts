/** A string value localized per language code, e.g. { en: "Hello", es: "Hola", fr: "Bonjour" } */
export type LocalizedString = Record<string, string>

export interface Env {
  CAREER_KV: KVNamespace
  API_SECRET: string
  ALLOWED_ORIGIN: string
  /** Rate limiting bindings (wrangler.toml). Optional so tests and bare `wrangler dev` runs work without them. */
  WRITE_LIMITER?: RateLimit
  AUTH_FAIL_LIMITER?: RateLimit
}

export type EntityKey =
  | 'languages'
  | 'personal'
  | 'jobs'
  | 'projects'
  | 'skills'
  | 'education'
  | 'certifications'
  | 'soft-skills'

export const ENTITY_KEYS: EntityKey[] = [
  'languages',
  'personal',
  'jobs',
  'projects',
  'skills',
  'education',
  'certifications',
  'soft-skills',
]

/** Entities stored as a single object (not an array). Full replacement via PUT, partial via PATCH. */
export const SINGULAR_ENTITIES: EntityKey[] = ['languages', 'personal']

/** Entities stored as arrays of objects with an `id` field. Support full CRUD. */
export const ARRAY_ENTITIES: EntityKey[] = ENTITY_KEYS.filter(
  (k) => !SINGULAR_ENTITIES.includes(k),
)
