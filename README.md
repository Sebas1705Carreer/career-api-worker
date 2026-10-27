# career-api

REST API for managing personal career portfolio data. Built with **Cloudflare Workers** + **Cloudflare KV**, written in TypeScript.

**Live URL:** `https://api.sebas1705.dev` · **Interactive docs:** [`/docs`](https://api.sebas1705.dev/docs) (Swagger UI, spec at [`/openapi.json`](https://api.sebas1705.dev/openapi.json))

---

## Overview

This API exposes CRUD endpoints for all sections of a developer portfolio: supported languages, personal info, jobs, projects, education, certifications, skills, and soft skills.

- **Read** operations are public (no auth required)
- **Write** operations (`POST`, `PUT`, `PATCH`, `DELETE`) require a Bearer token
- Data is persisted in **Cloudflare KV**
- **i18n:** every localizable field is a `LocalizedString` — a `{ [langCode]: value }` map (e.g. `{ "en": "Hello", "es": "Hola" }`). `GET /languages` lists the supported codes; adding a language means extending the `LocalizedString` fields and updating `/languages`.

---

## Authentication

Write operations require an `Authorization` header:

```
Authorization: Bearer <API_SECRET>
```

Unauthenticated write requests return `401 Unauthorized`.

---

## Entities

| Entity | Path | Type |
|---|---|---|
| Languages | `/languages` | Singular object |
| Personal info | `/personal` | Singular object |
| Jobs | `/jobs` | Array (items have `id`) |
| Projects | `/projects` | Array (items have `id`) |
| Skills | `/skills` | Array (items have `id`) |
| Education | `/education` | Array (items have `id`) |
| Certifications | `/certifications` | Array (items have `id`) |
| Soft Skills | `/soft-skills` | Array (items have `id`) |

**Singular entities** (`languages`, `personal`) support `GET`, `PUT`, `PATCH`.  
**Array entities** support full CRUD: `GET` (list + by id), `POST`, `PUT/:id`, `PATCH/:id`, `DELETE/:id`.

---

## Endpoints

### Root

```
GET /
```

Returns API metadata and available endpoints.

```
GET /docs           → Swagger UI (interactive documentation)
GET /openapi.json   → OpenAPI 3.0 specification
```

### Everything in one request

```
GET /all
```

Returns `{ languages, personal, jobs, projects, skills, education, certifications, "soft-skills" }`: what the portfolio and Folio need to draw their first screen, in one request instead of eight. Empty array entities come back as `[]`, a missing singular one as `null`. The individual endpoints keep working.

### Caching

Every public `GET` carries an `ETag` (a hash of the body) and `Cache-Control: public, max-age=30, stale-while-revalidate=120`. A client that sends the tag back as `If-None-Match` gets an empty `304` when nothing changed. The window is short on purpose: an edit in Folio shows up on the portfolio within about a minute. Writes, errors and 404s are `Cache-Control: no-store`.

### Validation

Writes are checked before they are stored. A rejected one answers `400`:

```json
{ "error": "Validation failed", "details": ["level: must be an integer from 1 to 4"] }
```

| Rule | Where |
|---|---|
| `id` of a new item is a slug (`a-z`, `0-9`, hyphens) | `POST` |
| Required fields are present: projects `name` + `context`, jobs `company`, skills `name` + `category` + `level`, education `school`, certifications `name` + `issuer`, soft skills `name`, personal `name` + `email` | `POST`, `PUT /personal` |
| Localized fields are `{ "en": "text" }` maps with valid language codes; `achievements` is a map of string lists | every write |
| `context` is `work`, `academic` or `personal`; `level` is an integer from 1 to 4 | every write |
| Dates are `YYYY-MM` (or empty / `null`); links are `http(s)` URLs (or empty / `null`); a project `image_url` is an absolute `https` URL of at most 2048 characters (or empty / `null`) and `image_alt` a localized map (or `null`); `email` looks like one | every write |
| The default language is one of the supported codes | `/languages` |
| The body is valid JSON and at most 256 KB (`413` above that) | every write |

Only the fields sent are checked on a `PATCH` (and on `PUT` of an item, which merges like `PATCH`). Unknown fields are accepted, so new fields do not need an API change.

---

### Languages (singular)

```
GET    /languages         → { "default": "en", "supported": [{ "code", "label", "label_native" }] }
PUT    /languages         → replaces the languages object  [auth]
PATCH  /languages         → merges fields into the languages object  [auth]
```

---

### Personal (singular)

```
GET    /personal          → returns the personal object
PUT    /personal          → replaces the entire personal object  [auth]
PATCH  /personal          → merges fields into the personal object  [auth]
```

**Example PATCH:**
```bash
curl -X PATCH https://api.sebas1705.dev/personal \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"location": {"en": "Barcelona, Spain", "es": "Barcelona, España"}}'
```

---

### Array entities (jobs, projects, skills, education, certifications, soft-skills)

Replace `{entity}` with any array entity name.

```
GET    /{entity}          → returns all items as an array
GET    /{entity}/:id      → returns a single item by id
POST   /{entity}          → creates a new item  [auth]
PUT    /{entity}/:id      → replaces an item by id  [auth]
PATCH  /{entity}/:id      → partially updates an item by id  [auth]
DELETE /{entity}/:id      → deletes an item by id  [auth]
```

**POST requires** a body with a unique `"id"` string field. Returns `409 Conflict` if the id already exists.

**Examples:**

```bash
# List all projects
curl https://api.sebas1705.dev/projects

# Get a single project
curl https://api.sebas1705.dev/projects/youknow

# Create a new certification
curl -X POST https://api.sebas1705.dev/certifications \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-cert",
    "name": "My New Certification",
    "issuer": "Udemy",
    "date": "Jun 2026",
    "url": "https://example.com/cert"
  }'

# Update a job's description
curl -X PATCH https://api.sebas1705.dev/jobs/senior-solusoft \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"desc": {"en": "Updated description", "es": "Descripción actualizada"}}'

# Delete a project
curl -X DELETE https://api.sebas1705.dev/projects/old-project \
  -H "Authorization: Bearer <token>"
```

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Created (POST) |
| `304` | Not modified (the `If-None-Match` tag is current) |
| `400` | Invalid JSON or failed validation (see `details`) |
| `401` | Unauthorized (missing or invalid Bearer token) |
| `404` | Entity or item not found |
| `409` | Conflict (duplicate `id` on POST) |
| `413` | Body larger than 256 KB |
| `500` | Internal server error |

---

## Data Schemas

All localizable fields are `LocalizedString` maps: `{ "en": "string", "es": "string", ... }` with one key per supported language code (see `GET /languages`). The exact schemas are also published in [`/openapi.json`](https://api.sebas1705.dev/openapi.json) and browsable at [`/docs`](https://api.sebas1705.dev/docs).

### Languages

```json
{
  "default": "en",
  "supported": [
    { "code": "en", "label": "English", "label_native": "English" },
    { "code": "es", "label": "Spanish", "label_native": "Español" }
  ]
}
```

### Personal

```json
{
  "name": "string",
  "email": "string",
  "cv_url": "string",
  "github": "string",
  "linkedin": "string",
  "codewars": "string",
  "greeting": { "en": "string", "es": "string" },
  "role": { "en": "string", "es": "string" },
  "tagline": { "en": "string", "es": "string" },
  "bio": { "en": "string", "es": "string" },
  "location": { "en": "string", "es": "string" }
}
```

### Job

```json
{
  "id": "string (unique, kebab-case)",
  "company": "string",
  "companyUrl": "string",
  "startDate": "string (YYYY-MM)",
  "endDate": "string (YYYY-MM) | null",
  "role": { "en": "string", "es": "string" },
  "type": { "en": "Hybrid | Remote | On-site", "es": "string" },
  "period": { "en": "string", "es": "string" },
  "desc": { "en": "string", "es": "string" },
  "projects": ["string"],
  "achievements": { "en": ["string"], "es": ["string"] }
}
```

### Project

```json
{
  "id": "string (unique, kebab-case)",
  "name": "string",
  "context": "work | academic | personal",
  "desc": { "en": "string", "es": "string" },
  "tags": ["string"],
  "github": "string | null",
  "demo": "string | null",
  "image_url": "string | null (optional; absolute https URL)",
  "image_alt": { "en": "string", "es": "string" }
}
```

`image_url` and `image_alt` are optional (`image_alt` may also be `null`). Project images are
hosted by the portfolio at `https://sebas1705carreer.github.io/carreerV2/projects/<project-id>.webp`;
clients use the project name as alt text when `image_alt` is missing.

### Education

```json
{
  "id": "string (unique, kebab-case)",
  "degree": { "en": "string", "es": "string" },
  "school": "string",
  "period": { "en": "string", "es": "string" },
  "detail": { "en": "string", "es": "string" },
  "icon": "string"
}
```

### Certification

```json
{
  "id": "string (unique, kebab-case)",
  "name": "string",
  "issuer": "string",
  "date": "string (e.g. 'Jun 2026')",
  "url": "string"
}
```

### Skill

```json
{
  "id": "string (unique, kebab-case)",
  "name": "string",
  "category": "string",
  "level": "number (1-4)",
  "icon_url": "string | null"
}
```

### Soft Skill

```json
{
  "id": "string (unique, kebab-case)",
  "name": { "en": "string", "es": "string" }
}
```

---

## Project Structure

```
src/
├── index.ts        # Worker entry point — routes requests
├── router.ts       # Route definitions and dispatcher
├── auth.ts         # Bearer token authentication
├── cors.ts         # CORS headers and preflight handling
├── cache.ts        # ETag + Cache-Control for the public reads (304 handling)
├── validate.ts     # Write validation (types, required fields, languages)
├── kv.ts           # KV storage helpers (get, set, create, update, delete)
├── types.ts        # Env interface and entity type definitions
├── seed-data.ts    # Initial seed data for all entities
└── seed.ts         # Script to generate wrangler KV put commands
seed-kv.mjs         # Node.js script to seed KV namespace directly
wrangler.toml       # Cloudflare Worker configuration
```

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via `npm install`)
- A Cloudflare account with Workers and KV access

### Setup

```bash
git clone https://github.com/Sebas1705Carreer/career-api-worker.git
cd career-api-worker
npm install --ignore-scripts
```

### Tests

```bash
npm test
```

Runs the validation rules and the whole API (caching, `/all`, writes) against an in-memory KV. Set `LIVE_DATA_DIR` to a folder with one `<entity>.json` per entity (copies of the `GET` responses) to also check that the rules accept the data the API holds.

### Run locally

```bash
npx wrangler dev
```

The API will be available at `http://localhost:8787`.

For local development with a local KV namespace, add `[env.development.kv_namespaces]` to `wrangler.toml` or use `--local` flag.

### Seed the KV namespace

> ⚠️ **Re-seeding overwrites live data — the seeds lag production across
> the board.** Live has 137 skills (vs ~30 in the seeds, old taxonomy),
> and projects/jobs/education carry `long_desc` fields the seeds never
> had. Before re-seeding, export the live data (`GET` each entity) and
> regenerate the seeds from production first.

After creating the KV namespace, populate it with initial data:

```bash
node seed-kv.mjs
```

This writes all entities (languages, personal, jobs, projects, education, certifications, skills, soft-skills) to the remote KV namespace.

### Deploy

```bash
npx wrangler deploy
```

### Set the API secret

```bash
echo "<your-secret-token>" | npx wrangler secret put API_SECRET
```

---

## Environment & Bindings

| Name | Type | Description |
|---|---|---|
| `CAREER_KV` | KV Namespace | Persistent storage for all entity data |
| `API_SECRET` | Secret | Bearer token required for write operations |
| `ALLOWED_ORIGIN` | Var | CORS allowed origin (default: `*`) |

---

## CORS

All responses include `Access-Control-Allow-Origin: *` (configurable via `ALLOWED_ORIGIN`). `OPTIONS` preflight requests return `204`.

---

## License

MIT
