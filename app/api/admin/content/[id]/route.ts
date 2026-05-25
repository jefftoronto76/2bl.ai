import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[content/get] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('content')
    .select('id, name, raw')
    .eq('id', id)
    .eq('tenant_id', authCtx.tenant_id)
    .single()

  if (error || !data) {
    return Response.json({ error: 'Content not found' }, { status: 404 })
  }

  return Response.json(data)
}
