import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEntity, validateLanguages } from '../src/validate.ts'

const ok = (errors: string[]) => assert.deepEqual(errors, [])
const bad = (errors: string[], containing: string) =>
  assert.ok(errors.some((e) => e.includes(containing)), `expected an error about "${containing}", got ${JSON.stringify(errors)}`)

// ── What the real clients send must pass ──────────────────────────────────────

test('a project as Folio sends it (empty maps, null links) is valid', () => {
  ok(validateEntity('projects', {
    id: 'youknow', name: 'YouKnow', context: 'academic', desc: { en: 'x', es: 'y' }, long_desc: {},
    tags: ['Kotlin'], github: null, demo: null,
  }, 'patch'))
})

test('creating a project needs id, name and context', () => {
  ok(validateEntity('projects', { id: 'new-one', name: 'New', context: 'personal' }, 'create'))
  bad(validateEntity('projects', { name: 'New', context: 'personal' }, 'create'), 'id')
  bad(validateEntity('projects', { id: 'new-one', context: 'personal' }, 'create'), 'name: is required')
  bad(validateEntity('projects', { id: 'new-one', name: 'New' }, 'create'), 'context: is required')
})

test('an empty patch is valid for every entity (it is how the token is checked)', () => {
  for (const e of ['personal', 'jobs', 'projects', 'skills', 'education', 'certifications', 'soft-skills'] as const) {
    ok(validateEntity(e, {}, 'patch'))
  }
  ok(validateLanguages({}))
})

test('unknown fields are accepted', () => {
  ok(validateEntity('projects', { name: 'X', somethingNew: { a: 1 } }, 'patch'))
})

test('blank links and an unfinished job are valid', () => {
  ok(validateEntity('jobs', { company: 'Solusoft', startDate: '2026-01', endDate: null, companyUrl: '' }, 'patch'))
  ok(validateEntity('jobs', { endDate: '' }, 'patch'))
})

// ── What would corrupt the data must not ──────────────────────────────────────

test('a project context outside the known three is rejected', () => {
  bad(validateEntity('projects', { context: 'hobby' }, 'patch'), 'context: must be one of')
})

test('skill levels are integers from 1 to 4', () => {
  ok(validateEntity('skills', { level: 4 }, 'patch'))
  bad(validateEntity('skills', { level: 5 }, 'patch'), 'level')
  bad(validateEntity('skills', { level: 0 }, 'patch'), 'level')
  bad(validateEntity('skills', { level: '3' }, 'patch'), 'level')
  bad(validateEntity('skills', { level: 2.5 }, 'patch'), 'level')
})

test('localized fields are { code: string } maps', () => {
  bad(validateEntity('projects', { desc: 'plain text' }, 'patch'), 'desc')
  bad(validateEntity('projects', { desc: { en: 5 } }, 'patch'), 'desc')
  bad(validateEntity('projects', { desc: { 'EN!': 'x' } }, 'patch'), 'language code')
  bad(validateEntity('jobs', { achievements: { en: 'not a list' } }, 'patch'), 'achievements')
})

test('ids of new items are slugs', () => {
  bad(validateEntity('skills', { id: 'C++', name: 'C++', category: 'languages', level: 3 }, 'create'), 'id')
  bad(validateEntity('skills', { id: 'Upper', name: 'x', category: 'languages', level: 3 }, 'create'), 'id')
  ok(validateEntity('skills', { id: 'cpp', name: 'C++', category: 'languages', level: 3 }, 'create'))
})

test('dates, links and emails have a shape', () => {
  bad(validateEntity('jobs', { startDate: 'January 2026' }, 'patch'), 'startDate')
  bad(validateEntity('jobs', { startDate: '2026-13' }, 'patch'), 'startDate')
  bad(validateEntity('projects', { github: 'javascript:alert(1)' }, 'patch'), 'github')
  bad(validateEntity('personal', { email: 'not-an-email' }, 'patch'), 'email')
  bad(validateEntity('personal', { linkedin: 'linkedin.com/in/x' }, 'patch'), 'linkedin')
})

test('a soft skill needs a name in at least one language', () => {
  ok(validateEntity('soft-skills', { id: 'focus', name: { en: 'Focus' } }, 'create'))
  bad(validateEntity('soft-skills', { id: 'focus', name: {} }, 'create'), 'at least one language')
  bad(validateEntity('soft-skills', { id: 'focus', name: { en: '  ' } }, 'create'), 'at least one language')
})

test('a bare array or string is not a body', () => {
  bad(validateEntity('projects', [] as unknown, 'patch'), 'JSON object')
  bad(validateEntity('projects', 'x' as unknown, 'patch'), 'JSON object')
  bad(validateEntity('projects', null as unknown, 'patch'), 'JSON object')
})

test('personal as a whole needs name and email', () => {
  ok(validateEntity('personal', { name: 'A', email: 'a@b.co' }, 'replace'))
  bad(validateEntity('personal', { name: 'A' }, 'replace'), 'email: is required')
})

// ── Languages ─────────────────────────────────────────────────────────────────

test('the default language must be one of the supported ones', () => {
  const supported = [{ code: 'en', label: 'English', label_native: 'English' }, { code: 'es', label: 'Spanish', label_native: 'Español' }]
  ok(validateLanguages({ default: 'es', supported }))
  bad(validateLanguages({ default: 'fr', supported }), 'not one of the supported codes')
  bad(validateLanguages({ default: 'en', supported: [] }), 'non-empty array')
  bad(validateLanguages({ default: 'en', supported: [{ code: 'e', label: 'x', label_native: 'x' }] }), 'language code')
})
