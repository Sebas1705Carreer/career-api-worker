import type { EntityKey } from './types'

/**
 * Write validation. The API stores whatever JSON it is given, so a bug in a client could
 * leave a field with the wrong type and break every consumer. These checks run on writes only;
 * unknown fields are accepted (new fields can be added without touching the API).
 *
 *   create  POST — every required field must be present and valid, and the id must be a slug
 *   patch   PATCH / PUT on an item — only the fields sent are checked
 *   replace PUT on a singular entity — the whole object, required fields included
 */
export type Mode = 'create' | 'patch' | 'replace'

type Check = (value: unknown) => string | null

interface Spec {
  fields: Record<string, Check>
  required: string[]
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// ── Field checks ──────────────────────────────────────────────────────────────

const str: Check = (v) => (typeof v === 'string' ? null : 'must be a string')

const nonEmpty: Check = (v) =>
  typeof v === 'string' && v.trim() !== '' ? null : 'must be a non-empty string'

/** http(s) URL, or empty / null for "not set" */
const url: Check = (v) =>
  v === null || v === '' || (typeof v === 'string' && /^https?:\/\/\S+$/.test(v))
    ? null
    : 'must be an http(s) URL, empty or null'

const email: Check = (v) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'must be an email address'

/** YYYY-MM, empty, or null (an unfinished job has no end date) */
const month: Check = (v) =>
  v === null || v === '' || (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v))
    ? null
    : 'must be YYYY-MM, empty or null'

const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** { langCode: text } */
const localized: Check = (v) => {
  if (!isObject(v)) return 'must be an object { languageCode: text }'
  for (const [code, text] of Object.entries(v)) {
    if (!LANG_CODE.test(code)) return `has an invalid language code "${code}"`
    if (typeof text !== 'string') return `"${code}" must be a string`
  }
  return null
}

/** { langCode: [text, …] } */
const localizedList: Check = (v) => {
  if (!isObject(v)) return 'must be an object { languageCode: [text, …] }'
  for (const [code, list] of Object.entries(v)) {
    if (!LANG_CODE.test(code)) return `has an invalid language code "${code}"`
    if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) return `"${code}" must be an array of strings`
  }
  return null
}

/** A localized value with at least one language filled in */
const localizedNonEmpty: Check = (v) =>
  localized(v) ?? (Object.values(v as Record<string, string>).some((t) => t.trim() !== '') ? null : 'needs at least one language')

const stringList: Check = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? null : 'must be an array of strings'

const oneOf = (...allowed: string[]): Check => (v) =>
  typeof v === 'string' && allowed.includes(v) ? null : `must be one of: ${allowed.join(', ')}`

const intBetween = (min: number, max: number): Check => (v) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? null : `must be an integer from ${min} to ${max}`

// ── Specs ─────────────────────────────────────────────────────────────────────

const SPECS: Record<Exclude<EntityKey, 'languages'>, Spec> = {
  personal: {
    required: ['name', 'email'],
    fields: {
      name: nonEmpty, email, cv_url: str, github: url, linkedin: url, codewars: url,
      greeting: localized, role: localized, tagline: localized, bio: localized, location: localized,
    },
  },
  jobs: {
    required: ['company'],
    fields: {
      company: nonEmpty, companyUrl: url, startDate: month, endDate: month,
      role: localized, type: localized, period: localized, desc: localized, long_desc: localized,
      projects: stringList, achievements: localizedList,
    },
  },
  projects: {
    required: ['name', 'context'],
    fields: {
      name: nonEmpty, context: oneOf('work', 'academic', 'personal'),
      desc: localized, long_desc: localized, tags: stringList, github: url, demo: url,
    },
  },
  skills: {
    required: ['name', 'category', 'level'],
    fields: { name: nonEmpty, category: nonEmpty, level: intBetween(1, 4), icon_url: url },
  },
  education: {
    required: ['school'],
    fields: { school: nonEmpty, icon: str, degree: localized, period: localized, detail: localized, long_desc: localized },
  },
  certifications: {
    required: ['name', 'issuer'],
    fields: { name: nonEmpty, issuer: nonEmpty, date: str, url, long_desc: localized },
  },
  'soft-skills': {
    required: ['name'],
    fields: { name: localizedNonEmpty },
  },
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Errors found in a body for an entity, empty when it is fine. */
export function validateEntity(entity: EntityKey, body: unknown, mode: Mode): string[] {
  if (!isObject(body)) return ['body must be a JSON object']
  if (entity === 'languages') return validateLanguages(body)

  const spec = SPECS[entity]
  const errors: string[] = []

  if (mode === 'create') {
    if (typeof body.id !== 'string' || !SLUG.test(body.id)) {
      errors.push('id: is required and must be a slug (lowercase letters, numbers and hyphens)')
    }
  }
  for (const [field, check] of Object.entries(spec.fields)) {
    if (!(field in body)) continue
    const problem = check(body[field])
    if (problem) errors.push(`${field}: ${problem}`)
  }
  if (mode !== 'patch') {
    for (const field of spec.required) {
      if (body[field] === undefined || body[field] === null) errors.push(`${field}: is required`)
    }
  }
  return errors
}

/**
 * The languages config, as it will be stored (a PATCH is merged first). The default has to be one
 * of the supported codes, otherwise every consumer would ask for a language that does not exist.
 */
export function validateLanguages(body: Record<string, unknown>): string[] {
  const errors: string[] = []
  if ('default' in body && nonEmpty(body.default)) errors.push('default: must be a non-empty string')

  if ('supported' in body) {
    if (!Array.isArray(body.supported) || body.supported.length === 0) {
      errors.push('supported: must be a non-empty array')
    } else {
      body.supported.forEach((lang, i) => {
        if (!isObject(lang)) return errors.push(`supported[${i}]: must be an object`)
        if (typeof lang.code !== 'string' || !LANG_CODE.test(lang.code)) errors.push(`supported[${i}].code: must be a language code such as "en"`)
        if (typeof lang.label !== 'string') errors.push(`supported[${i}].label: must be a string`)
        if (typeof lang.label_native !== 'string') errors.push(`supported[${i}].label_native: must be a string`)
      })
    }
  }
  if (errors.length === 0 && typeof body.default === 'string' && Array.isArray(body.supported)) {
    const codes = (body.supported as Array<{ code: string }>).map((l) => l.code)
    if (!codes.includes(body.default)) errors.push(`default: "${body.default}" is not one of the supported codes (${codes.join(', ')})`)
  }
  return errors
}
