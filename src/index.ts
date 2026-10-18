import type { Env } from './types'
import { cors, preflight } from './cors'
import { dispatch } from './router'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight(env)
    const response = cors(await dispatch(request, env), env)
    // Only the public reads opt in to caching (see cache.ts); writes, errors and the rest never do
    if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store')
    return response
  },
} satisfies ExportedHandler<Env>
