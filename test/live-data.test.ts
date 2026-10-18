import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { validateEntity, validateLanguages } from '../src/validate.ts'
import type { EntityKey } from '../src/types.ts'

/**
 * Guards against a rule that would reject data the API already holds or the update files in
 * data-updates/. Set LIVE_DATA_DIR to a folder with one <entity>.json per entity (a copy of the
 * GET responses) to check real data; the data-updates files are always checked.
 */
const ARRAYS: Exclude<EntityKey, 'languages' | 'personal'>[] = ['jobs', 'projects', 'skills', 'education', 'certifications', 'soft-skills']

test('every item in the data-updates files is valid', () => {
  for (const file of readdirSync('data-updates').filter((f) => f.endsWith('.json'))) {
    const update = JSON.parse(readFileSync(`data-updates/${file}`, 'utf8')) as Record<string, unknown>
    for (const [entity, value] of Object.entries(update)) {
      const key = entity as EntityKey
      if (key === 'personal') {
        assert.deepEqual(validateEntity('personal', value, 'replace'), [], `${file}: personal`)
      } else if (Array.isArray(value)) {
        for (const item of value as { id: string }[]) {
          assert.deepEqual(validateEntity(key, item, 'create'), [], `${file}: ${entity}/${item.id}`)
        }
      }
    }
  }
})

const dir = process.env.LIVE_DATA_DIR
test('the data the API holds passes the rules', { skip: dir ? false : 'set LIVE_DATA_DIR to check live data' }, () => {
  const read = (name: string) => JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'))
  assert.deepEqual(validateLanguages(read('languages')), [])
  assert.deepEqual(validateEntity('personal', read('personal'), 'replace'), [])
  for (const entity of ARRAYS) {
    for (const item of read(entity) as { id: string }[]) {
      assert.deepEqual(validateEntity(entity, item, 'create'), [], `${entity}/${item.id}`)
    }
  }
})
