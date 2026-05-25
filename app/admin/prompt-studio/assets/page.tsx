import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { Text } from '@/components/admin/primitives/Text'
import { AssetsTable, type AssetRow } from './AssetsTable'

export const dynamic = 'force-dynamic'

export default async function AssetsPage() {
  let tenantId: string
  try {
    const authCtx = await getAuthContext()
    tenantId = authCtx.tenant_id
  } catch {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <Text variant="title">Assets</Text>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <Text variant="muted">Unable to load assets.</Text>
        </div>
      </div>
    )
  }

  const supabase = getAdminClient()

  const { data: assets, error } = await supabase
    .from('content')
    .select('id, name, raw, storage_path, created_at')
    .eq('type', 'document')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[assets] fetch error:', error.message)
  }

  const rows = (assets as AssetRow[] | null) ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">Assets</Text>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <AssetsTable rows={rows} />
      </div>
    </div>
  )
}
