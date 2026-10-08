import { createClient } from '@supabase/supabase-js'

export default async function handler(request, response) {
  if (request.method !== 'DELETE') {
    response.setHeader('Allow', 'DELETE')
    return response.status(405).json({ message: 'Method not allowed.' })
  }

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ message: 'Authentication required.' })

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return response.status(503).json({ message: 'Account deletion is not configured.' })
  }

  const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return response.status(401).json({ message: 'Your session is no longer valid.' })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
  if (deleteError) return response.status(500).json({ message: 'The account could not be deleted.' })

  return response.status(200).json({ deleted: true })
}
