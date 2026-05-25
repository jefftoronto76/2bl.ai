import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[content/create] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    name: string
    type: string
    raw: string
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, type, raw } = body

  if (!name || !type || !raw) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('content')
    .insert({ tenant_id: authCtx.tenant_id, owner_id: authCtx.owner_id, name, type, raw })
    .select()
    .single()

  if (error) {
    console.error('[content/create] insert failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
