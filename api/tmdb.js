const TMDB_API_URL = 'https://api.themoviedb.org/3'
const ALLOWED_ENDPOINTS = new Set([
  'discover/movie',
  'discover/tv',
  'search/movie',
  'search/tv',
])

function isAllowedEndpoint(endpoint) {
  return ALLOWED_ENDPOINTS.has(endpoint)
    || /^movie\/\d+$/.test(endpoint)
    || /^tv\/\d+$/.test(endpoint)
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  const endpoint = request.query.endpoint
  if (typeof endpoint !== 'string' || !isAllowedEndpoint(endpoint)) {
    return response.status(404).json({ message: 'TMDB route not found.' })
  }

  const token = process.env.TMDB_ACCESS_TOKEN
  if (!token) {
    return response.status(503).json({ message: 'TMDB service is not configured.' })
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(request.query)) {
    if (key === 'endpoint' || value == null) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
  }

  try {
    const tmdbResponse = await fetch(`${TMDB_API_URL}/${endpoint}?${query}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    })
    const data = await tmdbResponse.json()

    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return response.status(tmdbResponse.status).json(data)
  } catch {
    return response.status(502).json({ message: 'TMDB service is temporarily unavailable.' })
  }
}
