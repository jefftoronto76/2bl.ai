import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { InvitesManager } from './InvitesManager'

export const dynamic = 'force-dynamic'

export default async function InvitesPage() {
  let tenantName = 'this product'
  let tenantDomain: string | null = null

  try {
    const authCtx = await getAuthContext()
    const supabase = getAdminClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, domain')
      .eq('id', authCtx.tenant_id)
      .single()
    if (tenant) {
      tenantName = tenant.name ?? tenantName
      tenantDomain = tenant.domain ?? null
    }
  } catch {
    // Fall through — page still renders with generic defaults
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <p className="text-base font-semibold text-gray-900">Invites</p>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <InvitesManager tenantName={tenantName} tenantDomain={tenantDomain} />
      </div>
    </div>
  )
}
