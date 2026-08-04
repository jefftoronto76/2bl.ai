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
import type { MessageFeedbackRow } from './feedback'

const DEFAULT_THRESHOLDS: SessionStatusThresholds = {
  chat_in_progress_idle_seconds: 300,
  chat_active_idle_seconds: 86400,
}

// How many trailing days getTtftTrend buckets — also the sparkline's point count.
const TTFT_TREND_DAYS = 7

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
  ttft_ms: number | null
}

/**
 * Feedback rollup attached to a ChatSession: the { up, down } counts driving
 * the table/dashboard tiles, computed from the same `feedback` array so the
 * two never disagree.
 */
export interface FeedbackCountsSummary {
  up: number
  down: number
}

// The triaged row shape consumed by InboundChatsTable: the session row plus its
// read-time derived status, ttft_ms, and any message_feedback rows.
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
  ttft_ms: number | null
  feedback: MessageFeedbackRow[]
  feedback_counts: FeedbackCountsSummary
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
        .select('id, visitor_name, email, messages, status, updated_at, created_at, input_tokens, output_tokens, user_id, ttft_ms')
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

  const sessionRows: SessionRow[] = (sessions as SessionRow[] | null) ?? []

  // Single bulk fetch for the whole list's message_feedback rows, keyed by
  // session_id — avoids one query per session (N+1) for the table/dashboard
  // rollups and the drawer's per-message thumbs.
  const feedbackBySession = new Map<string, MessageFeedbackRow[]>()
  if (sessionRows.length > 0) {
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from('message_feedback')
      .select('session_id, message_index, rating, tags, detail')
      .eq('tenant_id', tenantId)
      .in('session_id', sessionRows.map((s) => s.id))

    if (feedbackError) {
      console.error('[admin/page] feedback fetch error:', feedbackError)
    }
    for (const row of (feedbackRows ?? []) as (MessageFeedbackRow & { session_id: string })[]) {
      const bucket = feedbackBySession.get(row.session_id) ?? []
      bucket.push({
        message_index: row.message_index,
        rating: row.rating,
        tags: row.tags,
        detail: row.detail,
      })
      feedbackBySession.set(row.session_id, bucket)
    }
  }

  const now = new Date()
  return sessionRows.map((session) => {
    const derivedStatus: SessionStatus = deriveSessionStatus({
      updatedAt: session.updated_at ?? session.created_at,
      thresholds,
      now,
    })
    const feedback = feedbackBySession.get(session.id) ?? []
    const feedback_counts: FeedbackCountsSummary = {
      up: feedback.filter((f) => f.rating === 'up').length,
      down: feedback.filter((f) => f.rating === 'down').length,
    }
    return { ...session, derived_status: derivedStatus, feedback, feedback_counts }
  })
}

export interface TtftTrendPoint {
  /** YYYY-MM-DD, UTC. */
  date: string
  /** null when no session in this bucket had a ttft_ms value. */
  avgMs: number | null
}

/**
 * Day-bucketed TTFT trend for the dashboard sparkline, last `TTFT_TREND_DAYS`
 * days (UTC calendar days).
 *
 * SCOPE ADAPTATION: `chat_sessions.ttft_ms` is a single nullable int,
 * overwritten on every turn — there is no per-turn historical log. Each
 * bucket therefore averages "the latest known ttft_ms among sessions whose
 * updated_at falls on that day," not a true intra-day average across every
 * turn that occurred that day. Real query, real numbers, but not a full
 * per-turn history. See System Docs/Database Schema.md's chat_sessions.ttft_ms entry.
 */
export async function getTtftTrend(tenantId: string): Promise<TtftTrendPoint[]> {
  const supabase = getAdminClient()

  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - (TTFT_TREND_DAYS - 1))
  start.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('ttft_ms, updated_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('session_type', 'prospect')
    .not('ttft_ms', 'is', null)
    .gte('updated_at', start.toISOString())

  if (error) {
    console.error('[admin/page] ttft trend fetch error:', error)
  }

  const byDate = new Map<string, number[]>()
  for (const row of (data ?? []) as { ttft_ms: number | null; updated_at: string | null; created_at: string }[]) {
    if (typeof row.ttft_ms !== 'number') continue
    const dateKey = (row.updated_at ?? row.created_at).slice(0, 10)
    const bucket = byDate.get(dateKey) ?? []
    bucket.push(row.ttft_ms)
    byDate.set(dateKey, bucket)
  }

  const points: TtftTrendPoint[] = []
  for (let i = TTFT_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const dateKey = d.toISOString().slice(0, 10)
    const bucket = byDate.get(dateKey)
    const avgMs =
      bucket && bucket.length > 0
        ? Math.round(bucket.reduce((sum, v) => sum + v, 0) / bucket.length)
        : null
    points.push({ date: dateKey, avgMs })
  }
  return points
}
