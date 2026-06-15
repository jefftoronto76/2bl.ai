// services/crm/inbound.ts
//
// Inbound chat triage for the admin Inbound Chats list: fetch the tenant's
// prospect sessions (newest first), resolve the tenant's idle thresholds, and
// derive each row's display status at read time. Server-only (service-role
// client). The admin page is a thin consumer that renders the returned rows.
// Logic moved verbatim from app/admin/page.tsx — behavior unchanged.

import { getAdminClient } from '@/services/auth/supabase-admin'
import {
  deriveSessionStatus,
  type SessionStatus,
  type SessionStatusThresholds,
} from './status'

const DEFAULT_THRESHOLDS: SessionStatusThresholds = {
  chat_in_progress_idle_seconds: 300,
  chat_active_idle_seconds: 86400,
}

interface SessionRow {
  id: string
  visitor_name: string | null
  email: string | null
  messages: unknown[] | null
  status: string | null
  updated_at: string | null
  created_at: string
  input_tokens: number | null
  output_tokens: number | null
  user_id: string | null
  users: { name: string | null; email: string | null } | null
}

// The triaged row shape consumed by InboundChatsTable: the session row plus its
// read-time derived status.
export interface ChatSession {
  id: string
  visitor_name: string | null
  email: string | null
  messages: unknown[] | null
  status: string | null
  updated_at: string | null
  created_at: string
  derived_status: SessionStatus
  input_tokens: number | null
  output_tokens: number | null
  user_id: string | null
  assigned_to: { name: string | null; email: string | null } | null
}

/**
 * Fetch and triage the tenant's inbound prospect sessions for the admin list.
 * Sessions are sorted newest-first by the query; each row's display status is
 * derived from its last activity time against the tenant's idle thresholds
 * (falling back to defaults when the tenant row has none). Fetch errors are
 * logged but non-fatal — the list degrades to whatever rows came back.
 */
export async function getInboundChats(tenantId: string): Promise<ChatSession[]> {
  const supabase = getAdminClient()

  const [{ data: sessions, error: sessionsError }, { data: tenant, error: tenantError }] =
    await Promise.all([
      supabase
        .from('chat_sessions')
        .select('id, visitor_name, email, messages, status, updated_at, created_at, input_tokens, output_tokens, user_id, users(name, email)')
        .eq('tenant_id', tenantId)
        .eq('session_type', 'prospect')
        .order('updated_at', { ascending: false }),
      supabase
        .from('tenants')
        .select('chat_in_progress_idle_seconds, chat_active_idle_seconds')
        .eq('id', tenantId)
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
  return sessionRows.map((session) => {
    const derivedStatus: SessionStatus = deriveSessionStatus({
      updatedAt: session.updated_at ?? session.created_at,
      thresholds,
      now,
    })
    const { users, ...rest } = session
    return { ...rest, derived_status: derivedStatus, assigned_to: users ?? null }
  })
}
