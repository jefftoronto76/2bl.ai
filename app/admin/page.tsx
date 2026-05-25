import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import {
  deriveSessionStatus,
  type SessionStatus,
  type SessionStatusThresholds,
} from '@/lib/deriveSessionStatus'
import { InboundChatsTable, type ChatSession } from './InboundChatsTable'

export const dynamic = 'force-dynamic'

const DEFAULT_THRESHOLDS: SessionStatusThresholds = {
  chat_in_progress_idle_seconds: 300,
  chat_active_idle_seconds: 86400,
}

interface SessionRow {
  id: string
  visitor_name: string | null
  messages: unknown[] | null
  status: string | null
  updated_at: string | null
  created_at: string
  input_tokens: number | null
  output_tokens: number | null
}

export default async function AdminPage() {
  let rows: ChatSession[] = []

  try {
    const { tenant_id } = await getAuthContext()
    const supabase = getAdminClient()

    const [{ data: sessions, error: sessionsError }, { data: tenant, error: tenantError }] =
      await Promise.all([
        supabase
          .from('chat_sessions')
          .select('id, visitor_name, messages, status, updated_at, created_at, input_tokens, output_tokens')
          .eq('tenant_id', tenant_id)
          .eq('session_type', 'prospect')
          .order('updated_at', { ascending: false }),
        supabase
          .from('tenants')
          .select('chat_in_progress_idle_seconds, chat_active_idle_seconds')
          .eq('id', tenant_id)
          .maybeSingle(),
      ])

    if (sessionsError) {
      console.error('[admin/page] sessions fetch error:', sessionsError)
    }
    if (tenantError) {
      console.error('[admin/page] tenant fetch error:', tenantError)
    }

    const thresholds: SessionStatusThresholds =
      tenant &&
      typeof tenant.chat_in_progress_idle_seconds === 'number' &&
      typeof tenant.chat_active_idle_seconds === 'number'
        ? {
            chat_in_progress_idle_seconds: tenant.chat_in_progress_idle_seconds,
            chat_active_idle_seconds: tenant.chat_active_idle_seconds,
          }
        : DEFAULT_THRESHOLDS

    const now = new Date()
    const sessionRows: SessionRow[] = (sessions as SessionRow[] | null) ?? []
    rows = sessionRows.map((session) => {
      const derivedStatus: SessionStatus = deriveSessionStatus({
        updatedAt: session.updated_at ?? session.created_at,
        thresholds,
        now,
      })
      return { ...session, derived_status: derivedStatus }
    })
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
