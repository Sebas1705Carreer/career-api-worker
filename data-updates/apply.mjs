/**
 * Upserts the items of a data-update file into the live API, by id:
 * PUT /<entity>/<id> when the item exists, POST /<entity> when it doesn't.
 * Singular entities (an object instead of an array) are replaced with PUT /<entity>.
 * Only the listed items are touched — nothing else in KV is overwritten.
 *
 * Run:  API_SECRET=... node data-updates/apply.mjs data-updates/<file>.json [--dry-run]
 */
import { readFileSync } from 'fs'

const API = process.env.API_URL ?? 'https://api.sebas1705.dev'
const [file, flag] = process.argv.slice(2)
const dryRun = flag === '--dry-run'
const secret = process.env.API_SECRET
if (!file) throw new Error('Usage: node data-updates/apply.mjs <file.json> [--dry-run]')
if (!secret && !dryRun) throw new Error('API_SECRET is not set')

const update = JSON.parse(readFileSync(file, 'utf8'))
for (const [entity, items] of Object.entries(update)) {
  // Singular entities (personal, languages) are a single object: replaced whole
  if (!Array.isArray(items)) {
    if (dryRun) { console.log(`[dry-run] PUT ${API}/${entity}`); continue }
    const res = await fetch(`${API}/${entity}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(items),
    })
    console.log(`${res.status} PUT ${API}/${entity}`)
    if (!res.ok) console.log(await res.text())
    continue
  }
  const live = await (await fetch(`${API}/${entity}`)).json()
  const ids = new Set(live.map((x) => x.id))
  for (const item of items) {
    const exists = ids.has(item.id)
    const [method, url] = exists ? ['PUT', `${API}/${entity}/${item.id}`] : ['POST', `${API}/${entity}`]
    if (dryRun) {
      console.log(`[dry-run] ${method} ${url}`)
      continue
    }
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(item),
    })
    console.log(`${res.status} ${method} ${url}`)
    if (!res.ok) console.log(await res.text())
  }
}
