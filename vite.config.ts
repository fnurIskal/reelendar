import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const tmdbToken = env.TMDB_ACCESS_TOKEN || env.VITE_TMDB_ACCESS_TOKEN

  return {
    plugins: [react()],
    envPrefix: 'PUBLIC_',
    server: {
      proxy: {
        '/api/tmdb': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            const endpoint = url.searchParams.get('endpoint') || ''
            url.searchParams.delete('endpoint')
            return `/${endpoint}?${url.searchParams}`
          },
          headers: {
            Authorization: `Bearer ${tmdbToken}`,
            accept: 'application/json',
          },
        },
      },
    },
  }
})
