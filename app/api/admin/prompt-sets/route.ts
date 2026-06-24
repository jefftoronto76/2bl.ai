import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-sets] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_sets')
    .select('id, label, description, status, version')
    .eq('tenant_id', authCtx.tenant_id)
    .order('status', { ascending: false })
    .order('label', { ascending: true })

  if (error) {
    console.error('[prompt-sets] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ promptSets: data ?? [] })
}
