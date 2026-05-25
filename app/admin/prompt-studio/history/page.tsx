import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { Text } from '@/components/admin/primitives/Text'
import { HistoryTable, type SessionRow } from './HistoryTable'

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  let tenantId: string
  try {
    const authCtx = await getAuthContext()
    tenantId = authCtx.tenant_id
  } catch {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <Text variant="title">History</Text>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <Text variant="muted">Unable to load history.</Text>
        </div>
      </div>
    )
  }

  const supabase = getAdminClient()

  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('id, created_at, status, message_count, block_id, messages, blocks(title)')
    .eq('session_type', 'composer')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[history] fetch error:', error.message)
  }

  const rows = (sessions as SessionRow[] | null) ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">History</Text>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <HistoryTable rows={rows} />
      </div>
    </div>
  )
}
