import { getAdminClient } from '@/services/auth/supabase-admin'
import { getTenantFromRequest } from '@/services/auth'

type OpenAs = 'new_tab' | 'popup'

interface PublicSageParameter {
  key: string
  label: string | null
  description: string | null
  cta_label: string | null
  url: string | null
  open_as: OpenAs
  embed_code: string | null
}

export async function GET(req: Request) {
  const tenantId = await getTenantFromRequest(req)
  console.log('[sage/parameters] resolved tenant_id:', tenantId)

  if (!tenantId) {
    return Response.json([])
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('sage_parameters')
    .select('key, label, description, cta_label, url, open_as, embed_code')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[sage/parameters] fetch failed:', error.message)
    return Response.json([])
  }

  const parameters: PublicSageParameter[] = data ?? []
  console.log('[sage/parameters] GET', { tenant_id: tenantId, count: parameters.length })

  return Response.json(parameters)
}
