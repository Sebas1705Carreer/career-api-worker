/**
 * Exports the live API (GET /all) to a JSON file: a cheap backup of everything in KV.
 * Reads are public, so no secret is needed.
 *
 * Run:  node scripts/backup-export.mjs [output-file]
 *       API_URL=https://api.sebas1705.dev   (default)
 *
 * The file has the shape `data-updates/apply.mjs` takes ({ entity: items | object }), so it can
 * be restored with that script (see "Backup and restore" in the README).
 * Exits non-zero, without writing anything, if the response does not look like the real data,
 * so an outage or a wiped KV never replaces a good backup with an empty one.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const API = (process.env.API_URL ?? 'https://api.sebas1705.dev').replace(/\/$/, '')
const out = process.argv[2] ?? `backups/career-all-${new Date().toISOString().slice(0, 10)}.json`

const ENTITIES = ['languages', 'personal', 'jobs', 'projects', 'skills', 'education', 'certifications', 'soft-skills']
const SINGULAR = new Set(['languages', 'personal'])

const res = await fetch(`${API}/all`, { headers: { Accept: 'application/json' } })
if (!res.ok) throw new Error(`GET ${API}/all answered ${res.status}`)
const data = await res.json()

const problems = []
for (const key of ENTITIES) {
  const v = data[key]
  if (SINGULAR.has(key)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) problems.push(`${key}: expected an object`)
  } else if (!Array.isArray(v) || v.length === 0) {
    problems.push(`${key}: expected a non-empty array`)
  }
}
if (problems.length) throw new Error(`Refusing to write a suspicious backup:\n- ${problems.join('\n- ')}`)

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(data, null, 2) + '\n')
const counts = ENTITIES.map((k) => `${k}=${SINGULAR.has(k) ? 1 : data[k].length}`).join(' ')
console.log(`Wrote ${out} (${counts})`)
