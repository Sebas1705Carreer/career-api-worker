/**
 * OpenAPI 3.0 specification for the Career API.
 *
 * Served at GET /openapi.json
 * Interactive UI served at GET /docs (Swagger UI via CDN)
 */
export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Career API',
    version: '3.0.0',
    description:
      'REST API to manage career portfolio data (work experience, projects, skills, education, certifications and soft-skills).\n\n' +
      '### Authentication\n' +
      'Write operations (`POST`, `PUT`, `PATCH`, `DELETE`) require a Bearer token in the `Authorization` header:\n' +
      '```\nAuthorization: Bearer <your-api-secret>\n```\n' +
      '`GET /auth/check` verifies a token without touching any data: `204` when it is valid, `401` otherwise.\n\n' +
      '### i18n\n' +
      'All localizable text fields use a **`LocalizedString`** map:\n' +
      '```json\n{ "en": "Hello", "es": "Hola" }\n```\n' +
      'Fetch `GET /languages` to discover which language codes are supported.\n\n' +
      '### Caching\n' +
      'Every `GET` returns an `ETag` and `Cache-Control: public, max-age=30, stale-while-revalidate=120`. Send the tag back as ' +
      '`If-None-Match` and an unchanged resource answers `304` with no body. `GET /all` returns every entity in one request.\n\n' +
      '### Validation\n' +
      'Writes are checked before they are stored. A rejected write answers `400` with ' +
      '`{ "error": "Validation failed", "details": ["projects.context: must be one of: work, academic, personal"] }`. ' +
      'Unknown fields are accepted; the types of the known ones are not negotiable.',
    contact: {
      name: 'Sebastián Entrerrios García',
      email: 'sebssgarcia502580@gmail.com',
      url: 'https://api.sebas1705.dev',
    },
    license: { name: 'MIT' },
  },
  servers: [
    {
      url: 'https://api.sebas1705.dev',
      description: 'Production (Cloudflare Workers)',
    },
    {
      url: 'http://localhost:8787',
      description: 'Local development (wrangler dev)',
    },
  ],
  tags: [
    { name: 'meta',           description: 'API information' },
    { name: 'auth',           description: 'Token verification' },
    { name: 'languages',      description: 'Supported content languages' },
    { name: 'personal',       description: 'Personal / contact information' },
    { name: 'jobs',           description: 'Work experience' },
    { name: 'projects',       description: 'Portfolio projects' },
    { name: 'skills',         description: 'Technical skills' },
    { name: 'education',      description: 'Academic background' },
    { name: 'certifications', description: 'Certificates & courses' },
    { name: 'soft-skills',    description: 'Soft skills' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API secret set via `wrangler secret put API_SECRET`',
      },
    },
    responses: {
      BadRequest: {
        description: 'Invalid JSON, or the body failed validation (see `details`)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Unauthorized: {
        description: 'Missing or invalid Bearer token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    parameters: {
      id: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Resource slug ID',
        schema: { type: 'string', example: 'senior-solusoft' },
      },
    },
    schemas: {
      // ── Primitives ────────────────────────────────────────────────────────
      LocalizedString: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Map of language code → translated value. E.g. `{ "en": "Hello", "es": "Hola" }`',
        example: { en: 'Hello', es: 'Hola' },
      },
      LocalizedStringList: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
        description: 'Map of language code → list of translated strings',
        example: { en: ['Achievement A', 'Achievement B'], es: ['Logro A', 'Logro B'] },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', description: 'Human-readable error message' },
          details: { type: 'array', items: { type: 'string' }, description: 'One entry per field that failed validation (400 only)' },
        },
      },
      // ── Languages ─────────────────────────────────────────────────────────
      Language: {
        type: 'object',
        required: ['code', 'label', 'label_native'],
        properties: {
          code:         { type: 'string', description: 'BCP-47 language code', example: 'en' },
          label:        { type: 'string', description: 'English name', example: 'English' },
          label_native: { type: 'string', description: 'Native name', example: 'English' },
        },
      },
      Languages: {
        type: 'object',
        required: ['default', 'supported'],
        properties: {
          default:   { type: 'string', description: 'Default language code', example: 'en' },
          supported: { type: 'array', items: { $ref: '#/components/schemas/Language' } },
        },
      },
      // ── Personal ──────────────────────────────────────────────────────────
      Personal: {
        type: 'object',
        properties: {
          name:     { type: 'string', example: 'Sebastián Entrerrios García' },
          email:    { type: 'string', format: 'email', example: 'sebssgarcia502580@gmail.com' },
          cv_url:   { type: 'string', example: '/data/cv.pdf' },
          github:   { type: 'string', format: 'uri', example: 'https://github.com/Sebas1705' },
          linkedin: { type: 'string', format: 'uri' },
          codewars: { type: 'string', format: 'uri' },
          greeting: { $ref: '#/components/schemas/LocalizedString' },
          role:     { $ref: '#/components/schemas/LocalizedString' },
          tagline:  { $ref: '#/components/schemas/LocalizedString' },
          bio:      { $ref: '#/components/schemas/LocalizedString' },
          location: { $ref: '#/components/schemas/LocalizedString' },
        },
      },
      // ── Job ───────────────────────────────────────────────────────────────
      Job: {
        type: 'object',
        required: ['id', 'company', 'startDate'],
        properties: {
          id:          { type: 'string', description: 'Unique slug', example: 'senior-solusoft' },
          company:     { type: 'string', example: 'Solusoft' },
          companyUrl:  { type: 'string', format: 'uri', example: 'https://www.solusoft.es/' },
          startDate:   { type: 'string', description: 'YYYY-MM format', example: '2026-01' },
          endDate:     { type: 'string', nullable: true, description: 'YYYY-MM or null if current', example: null },
          role:        { $ref: '#/components/schemas/LocalizedString' },
          type:        { $ref: '#/components/schemas/LocalizedString', description: 'Hybrid / Remote / On-site' },
          period:      { $ref: '#/components/schemas/LocalizedString', description: 'Human-readable date range' },
          desc:        { $ref: '#/components/schemas/LocalizedString' },
          projects:    { type: 'array', items: { type: 'string' }, description: 'IDs of related projects', example: ['AGEDI', 'EPDM'] },
          achievements:{ $ref: '#/components/schemas/LocalizedStringList' },
        },
      },
      // ── Project ───────────────────────────────────────────────────────────
      Project: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id:      { type: 'string', example: 'youknowme-app' },
          name:    { type: 'string', example: 'YouKnowMe App' },
          context: { type: 'string', description: 'work | academic | personal', example: 'personal' },
          desc:    { $ref: '#/components/schemas/LocalizedString' },
          tags:    { type: 'array', items: { type: 'string' }, example: ['Kotlin', 'KMP', 'Firebase'] },
          github:  { type: 'string', format: 'uri', nullable: true },
          demo:    { type: 'string', format: 'uri', nullable: true },
        },
      },
      // ── Skill ─────────────────────────────────────────────────────────────
      Skill: {
        type: 'object',
        required: ['id', 'name', 'level', 'category'],
        properties: {
          id:       { type: 'string', example: 'kotlin' },
          name:     { type: 'string', example: 'Kotlin' },
          icon_url: { type: 'string', format: 'uri', nullable: true },
          level:    { type: 'integer', minimum: 1, maximum: 4, description: '1=Básico … 4=Experto', example: 4 },
          category: { type: 'string', example: 'Mobile' },
        },
      },
      // ── Education ─────────────────────────────────────────────────────────
      Education: {
        type: 'object',
        required: ['id', 'school'],
        properties: {
          id:     { type: 'string', example: 'urjc-daw' },
          school: { type: 'string', example: 'URJC' },
          icon:   { type: 'string', description: 'Emoji or icon URL', example: '🎓' },
          degree: { $ref: '#/components/schemas/LocalizedString' },
          period: { $ref: '#/components/schemas/LocalizedString' },
          detail: { $ref: '#/components/schemas/LocalizedString' },
        },
      },
      // ── Certification ─────────────────────────────────────────────────────
      Certification: {
        type: 'object',
        required: ['id', 'name', 'issuer'],
        properties: {
          id:     { type: 'string', example: 'aws-clf-c02' },
          name:   { type: 'string', example: 'AWS Certified Cloud Practitioner' },
          issuer: { type: 'string', example: 'Amazon Web Services' },
          date:   { type: 'string', example: 'Dec 2024' },
          url:    { type: 'string', format: 'uri' },
        },
      },
      // ── SoftSkill ─────────────────────────────────────────────────────────
      SoftSkill: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id:   { type: 'string', example: 'teamwork' },
          name: { $ref: '#/components/schemas/LocalizedString' },
        },
      },
    },
  },
  paths: {
    // ── Root ─────────────────────────────────────────────────────────────────
    '/': {
      get: {
        tags: ['meta'],
        summary: 'API information',
        description: 'Returns version, supported endpoints and auth instructions.',
        operationId: 'getRoot',
        responses: {
          '200': { description: 'API metadata object', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },

    // ── All ──────────────────────────────────────────────────────────────────
    '/all': {
      get: {
        tags: ['meta'],
        summary: 'Every entity in one request',
        description:
          'Returns `{ languages, personal, jobs, projects, skills, education, certifications, "soft-skills" }`. ' +
          'Array entities that are empty come back as `[]`, singular ones that are missing as `null`. ' +
          'Sends an `ETag`; with `If-None-Match` an unchanged result is a `304`.',
        operationId: 'getAll',
        parameters: [
          { name: 'If-None-Match', in: 'header', required: false, schema: { type: 'string' }, description: 'ETag from a previous response' },
        ],
        responses: {
          '200': {
            description: 'All entities',
            headers: { ETag: { schema: { type: 'string' } }, 'Cache-Control': { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '304': { description: 'Not modified' },
        },
      },
    },

    // ── Auth check ───────────────────────────────────────────────────────────
    '/auth/check': {
      get: {
        tags: ['auth'],
        summary: 'Verify a Bearer token',
        description:
          'Answers `204` with no body when the Bearer token is valid and `401` when it is missing or wrong. ' +
          'Reads and writes no data, and is never cached (`Cache-Control: no-store`, no `ETag`).',
        operationId: 'checkAuth',
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: 'Token is valid', headers: { 'Cache-Control': { schema: { type: 'string', example: 'no-store' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Languages ─────────────────────────────────────────────────────────────
    '/languages': {
      get: {
        tags: ['languages'],
        summary: 'Get supported languages',
        operationId: 'getLanguages',
        responses: {
          '200': { description: 'Languages config', content: { 'application/json': { schema: { $ref: '#/components/schemas/Languages' } } } },
          '404': { description: 'Not seeded yet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        tags: ['languages'],
        summary: 'Replace languages config',
        operationId: 'putLanguages',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Languages' } } } },
        responses: {
          '200': { description: 'Updated languages config', content: { 'application/json': { schema: { $ref: '#/components/schemas/Languages' } } } },
          '400': { description: 'Invalid JSON', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        tags: ['languages'],
        summary: 'Partially update languages config',
        operationId: 'patchLanguages',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Fields to merge into the current config' } } } },
        responses: {
          '200': { description: 'Updated languages config', content: { 'application/json': { schema: { $ref: '#/components/schemas/Languages' } } } },
          '400': { description: 'Invalid JSON', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Personal ──────────────────────────────────────────────────────────────
    '/personal': {
      get: {
        tags: ['personal'],
        summary: 'Get personal information',
        operationId: 'getPersonal',
        responses: {
          '200': { description: 'Personal data', content: { 'application/json': { schema: { $ref: '#/components/schemas/Personal' } } } },
          '404': { description: 'Not seeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        tags: ['personal'],
        summary: 'Replace personal information',
        operationId: 'putPersonal',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Personal' } } } },
        responses: {
          '200': { description: 'Updated personal data', content: { 'application/json': { schema: { $ref: '#/components/schemas/Personal' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      patch: {
        tags: ['personal'],
        summary: 'Partially update personal information',
        operationId: 'patchPersonal',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Personal' } } } },
        responses: {
          '200': { description: 'Updated personal data', content: { 'application/json': { schema: { $ref: '#/components/schemas/Personal' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Jobs ─────────────────────────────────────────────────────────────────
    '/jobs': {
      get: {
        tags: ['jobs'],
        summary: 'List all jobs',
        operationId: 'listJobs',
        responses: {
          '200': { description: 'Array of jobs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Job' } } } } },
        },
      },
      post: {
        tags: ['jobs'],
        summary: 'Create a new job',
        operationId: 'createJob',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
        responses: {
          '201': { description: 'Created job', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': { description: 'ID already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/jobs/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: {
        tags: ['jobs'],
        summary: 'Get a job by ID',
        operationId: 'getJob',
        responses: {
          '200': { description: 'Job object', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['jobs'],
        summary: 'Replace a job',
        operationId: 'putJob',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
        responses: {
          '200': { description: 'Updated job', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['jobs'],
        summary: 'Partially update a job',
        operationId: 'patchJob',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
        responses: {
          '200': { description: 'Updated job', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['jobs'],
        summary: 'Delete a job',
        operationId: 'deleteJob',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Deleted job', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Projects ──────────────────────────────────────────────────────────────
    '/projects': {
      get: {
        tags: ['projects'],
        summary: 'List all projects',
        operationId: 'listProjects',
        responses: {
          '200': { description: 'Array of projects', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } },
        },
      },
      post: {
        tags: ['projects'],
        summary: 'Create a new project',
        operationId: 'createProject',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
        responses: {
          '201': { description: 'Created project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': { description: 'ID already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/projects/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: { tags: ['projects'], summary: 'Get a project by ID', operationId: 'getProject',
        responses: { '200': { description: 'Project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } }, '404': { $ref: '#/components/responses/NotFound' } } },
      put: { tags: ['projects'], summary: 'Replace a project', operationId: 'putProject', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
        responses: { '200': { description: 'Updated project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      patch: { tags: ['projects'], summary: 'Partially update a project', operationId: 'patchProject', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
        responses: { '200': { description: 'Updated project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      delete: { tags: ['projects'], summary: 'Delete a project', operationId: 'deleteProject', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Deleted project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
    },

    // ── Skills ────────────────────────────────────────────────────────────────
    '/skills': {
      get: { tags: ['skills'], summary: 'List all skills', operationId: 'listSkills',
        responses: { '200': { description: 'Array of skills', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Skill' } } } } } } },
      post: { tags: ['skills'], summary: 'Create a skill', operationId: 'createSkill', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } },
        responses: { '201': { description: 'Created skill', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } }, '400': { $ref: '#/components/responses/BadRequest' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { description: 'ID exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/skills/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: { tags: ['skills'], summary: 'Get a skill by ID', operationId: 'getSkill',
        responses: { '200': { description: 'Skill', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } }, '404': { $ref: '#/components/responses/NotFound' } } },
      put: { tags: ['skills'], summary: 'Replace a skill', operationId: 'putSkill', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } },
        responses: { '200': { description: 'Updated skill', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      patch: { tags: ['skills'], summary: 'Partially update a skill', operationId: 'patchSkill', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } },
        responses: { '200': { description: 'Updated skill', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      delete: { tags: ['skills'], summary: 'Delete a skill', operationId: 'deleteSkill', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Deleted skill', content: { 'application/json': { schema: { $ref: '#/components/schemas/Skill' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
    },

    // ── Education ─────────────────────────────────────────────────────────────
    '/education': {
      get: { tags: ['education'], summary: 'List all education entries', operationId: 'listEducation',
        responses: { '200': { description: 'Array of education entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Education' } } } } } } },
      post: { tags: ['education'], summary: 'Create an education entry', operationId: 'createEducation', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } }, '400': { $ref: '#/components/responses/BadRequest' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { description: 'ID exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/education/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: { tags: ['education'], summary: 'Get an education entry', operationId: 'getEducation',
        responses: { '200': { description: 'Education', content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } }, '404': { $ref: '#/components/responses/NotFound' } } },
      put: { tags: ['education'], summary: 'Replace an education entry', operationId: 'putEducation', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      patch: { tags: ['education'], summary: 'Partially update an education entry', operationId: 'patchEducation', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      delete: { tags: ['education'], summary: 'Delete an education entry', operationId: 'deleteEducation', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Education' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
    },

    // ── Certifications ────────────────────────────────────────────────────────
    '/certifications': {
      get: { tags: ['certifications'], summary: 'List all certifications', operationId: 'listCertifications',
        responses: { '200': { description: 'Array of certifications', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Certification' } } } } } } },
      post: { tags: ['certifications'], summary: 'Create a certification', operationId: 'createCertification', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } }, '400': { $ref: '#/components/responses/BadRequest' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { description: 'ID exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/certifications/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: { tags: ['certifications'], summary: 'Get a certification', operationId: 'getCertification',
        responses: { '200': { description: 'Certification', content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } }, '404': { $ref: '#/components/responses/NotFound' } } },
      put: { tags: ['certifications'], summary: 'Replace a certification', operationId: 'putCertification', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      patch: { tags: ['certifications'], summary: 'Partially update a certification', operationId: 'patchCertification', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      delete: { tags: ['certifications'], summary: 'Delete a certification', operationId: 'deleteCertification', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Certification' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
    },

    // ── Soft-skills ───────────────────────────────────────────────────────────
    '/soft-skills': {
      get: { tags: ['soft-skills'], summary: 'List all soft skills', operationId: 'listSoftSkills',
        responses: { '200': { description: 'Array of soft skills', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SoftSkill' } } } } } } },
      post: { tags: ['soft-skills'], summary: 'Create a soft skill', operationId: 'createSoftSkill', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } }, '400': { $ref: '#/components/responses/BadRequest' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { description: 'ID exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/soft-skills/{id}': {
      parameters: [{ $ref: '#/components/parameters/id' }],
      get: { tags: ['soft-skills'], summary: 'Get a soft skill', operationId: 'getSoftSkill',
        responses: { '200': { description: 'SoftSkill', content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } }, '404': { $ref: '#/components/responses/NotFound' } } },
      put: { tags: ['soft-skills'], summary: 'Replace a soft skill', operationId: 'putSoftSkill', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      patch: { tags: ['soft-skills'], summary: 'Partially update a soft skill', operationId: 'patchSoftSkill', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
      delete: { tags: ['soft-skills'], summary: 'Delete a soft skill', operationId: 'deleteSoftSkill', security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SoftSkill' } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } } },
    },
  },
}

/** HTML for the Swagger UI page — loads assets from the official CDN. */
export function swaggerUiHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Career API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { background: #1a1a2e; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${specUrl}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        // Preserve Authorization header set manually by the user
        return req;
      },
    });
  </script>
</body>
</html>`
}
