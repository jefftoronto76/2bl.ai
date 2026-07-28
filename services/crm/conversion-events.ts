// services/crm/conversion-events.ts
//
// conversion_events reads/writes — an append-only log of conversion-relevant
// marker fires (booking offers, contact captures) and what happened to them.
// No upsert / no unique row identifier on this table: every marker fire is
// its own row, unlike message_feedback's upsert-on-(session_id,message_index)
// (services/crm/feedback.ts). Uses the shared service-role client
// (services/auth/supabase-admin.ts), matching session.ts's own convention —
// recordConversionEvents is consumed as one more onFinish detection flow
// there.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry'
import type { MarkerType } from '@/services/chat/ui/v1/types'

export type ConversionEventType = 'booking_offered' | 'contact_captured'

/**
 * Marker type → conversion event type. The single place a new conversion
 * point gets added — recordConversionEvents below never branches on marker
 * type directly, it just looks up this map. Markers with no entry (ARTIFACT,
 * ACCOUNT_CREATE) are not conversion-relevant and are silently skipped.
 */
const MARKER_EVENT_TYPES: Partial<Record<MarkerType, ConversionEventType>> = {
  BOOKING: 'booking_offered',
  NAME: 'contact_captured',
  EMAIL: 'contact_captured',
  PHONE: 'contact_captured',
}

const registry = createDefaultRegistry()

/**
 * Scans an assistant message for conversion-relevant markers and inserts one
 * `status: 'presented'` row per match (multiple markers in one message
 * produce multiple rows — there is no dedupe, this is an event log, not a
 * self-guarded state field like chat_sessions.email). Called from
 * handleSessionFinish (services/crm/session.ts) as one more onFinish
 * detection flow. Fire-and-forget in effect: every error is caught and
 * logged, never thrown, so a conversion-tracking failure can never abort the
 * turn it's observing or the flows that run after it.
 */
export async function recordConversionEvents(params: {
  tenantId: string
  sessionId: string
  memberId: string | null
  text: string
}): Promise<void> {
  const { tenantId, sessionId, memberId, text } = params
  const { markers } = registry.parse(text)

  const rows = markers
    .map(m => {
      const eventType = MARKER_EVENT_TYPES[m.type]
      return eventType
        ? {
            tenant_id: tenantId,
            session_id: sessionId,
            member_id: memberId,
            event_type: eventType,
            marker_type: m.type,
          }
        : null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (rows.length === 0) return

  try {
    const supabase = getAdminClient()
    const { error } = await supabase.from('conversion_events').insert(rows)
    if (error) {
      console.error('[conversion-events] insert failed:', error.message)
      return
    }
    console.log(
      '[conversion-events] recorded:',
      rows.map(r => ({ event_type: r.event_type, marker_type: r.marker_type })),
    )
  } catch (err) {
    console.error('[conversion-events] insert threw:', err instanceof Error ? err.message : err)
  }
}

/**
 * Flips every still-'presented' conversion_events row for a session created
 * after `afterTimestamp` (ISO 8601) to 'overwritten'. Called when
 * editMessage/resendMessage truncates the transcript forward from a message
 * (services/chat/ui/v1/useChatTurn.ts `truncateAndRedeliver`), so a booking
 * offer or contact capture tied to a now-discarded reply doesn't sit
 * silently as 'presented' forever — mirrors deleteFeedbackFrom's role for
 * message_feedback (services/crm/feedback.ts).
 *
 * There is no message-position column on this table (see the schema — no
 * message_index, no message id), so the cutoff is time-based rather than
 * index-based: `afterTimestamp` is the truncated-from message's own
 * timestamp, and on the ordinary happy path everything the truncation could
 * possibly have dropped necessarily has a later created_at than that
 * (messages are appended in order; onFinish inserts run right after that
 * turn's reply finishes streaming). Client/server clock skew is the one
 * thing that could make this imprecise — accepted, since this is best-effort
 * cleanup, not the source of truth for whether an event actually happened.
 * Fire-and-forget: every error is caught and logged, never thrown.
 */
export async function overwriteConversionEventsFrom(
  tenantId: string,
  sessionId: string,
  afterTimestamp: string,
): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { error } = await supabase
      .from('conversion_events')
      .update({ status: 'overwritten', updated_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId)
      .eq('status', 'presented')
      .gt('created_at', afterTimestamp)

    if (error) {
      console.error('[conversion-events] overwrite failed:', error.message)
      return
    }
    console.log('[conversion-events] marked overwritten:', { sessionId, afterTimestamp })
  } catch (err) {
    console.error('[conversion-events] overwrite threw:', err instanceof Error ? err.message : err)
  }
}
