import { getAuthContext } from '@/services/auth'
import { getInboundChats, type ChatSession } from '@/services/crm/inbound'
import { InboundChatsTable } from './InboundChatsTable'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  let rows: ChatSession[] = []

  try {
    const { tenant_id } = await getAuthContext()
    rows = await getInboundChats(tenant_id)
  } catch (err) {
    console.error('[admin/page] auth failed:', err instanceof Error ? err.message : err)
  }

  return (
    <div>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(28px, 3vw, 40px)',
        fontWeight: 400,
        letterSpacing: '-0.02em',
        color: 'var(--color-text-primary)',
        marginBottom: '8px',
      }}>
        Inbound Chats
      </h1>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '15px',
        color: 'var(--color-text-muted)',
        marginBottom: '48px',
      }}>
        Sage conversation history.
      </p>

      <InboundChatsTable rows={rows} />
    </div>
  )
}
