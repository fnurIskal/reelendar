import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_ENDPOINTS = new Set(['discover/movie', 'discover/tv', 'search/movie', 'search/tv'])

function isAllowedTmdbEndpoint(endpoint: string) {
  return TMDB_ENDPOINTS.has(endpoint) || /^movie\/\d+$/.test(endpoint) || /^tv\/\d+$/.test(endpoint)
}

function localTmdbApi(token: string) {
  return {
    name: 'reelendar-local-tmdb-api',
    configureServer(server: { middlewares: { use: (route: string, handler: (request: { method?: string; url?: string }, response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }) => void) => void } }) {
      server.middlewares.use('/api/tmdb', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (request.method !== 'GET') {
          response.statusCode = 405
          response.setHeader('Allow', 'GET')
          response.end(JSON.stringify({ message: 'Method not allowed.' }))
          return
        }

        const url = new URL(request.url ?? '/', 'http://localhost')
        const endpoint = url.searchParams.get('endpoint') ?? ''
        url.searchParams.delete('endpoint')
        if (!isAllowedTmdbEndpoint(endpoint)) {
          response.statusCode = 404
          response.end(JSON.stringify({ message: 'TMDB route not found.' }))
          return
        }
        if (!token) {
          response.statusCode = 503
          response.end(JSON.stringify({ message: 'Add TMDB_ACCESS_TOKEN to your local .env file.' }))
          return
        }

        try {
          const tmdbResponse = await fetch(`${TMDB_API_URL}/${endpoint}?${url.searchParams}`, {
            headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
          })
          response.statusCode = tmdbResponse.status
          response.end(await tmdbResponse.text())
        } catch {
          response.statusCode = 502
          response.end(JSON.stringify({ message: 'TMDB service is temporarily unavailable.' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const tmdbToken = env.TMDB_ACCESS_TOKEN || env.VITE_TMDB_ACCESS_TOKEN

  return {
    plugins: [react(), localTmdbApi(tmdbToken)],
    envPrefix: 'PUBLIC_',
  }
})
