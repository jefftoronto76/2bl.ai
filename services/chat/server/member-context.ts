// services/chat/server/member-context.ts
// Server-only. Resolves the MEMBER CONTEXT block for a chat session's member.
// Fail-open: any error returns null so the chat is never blocked.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { identityValue, resolveMemberName } from '@/services/shared/identity'

/**
 * Returns the MEMBER CONTEXT text for the member who owns this session,
 * computed fresh on every request — no one-shot lock. Always-on, matching
 * getBookingCardSection's pattern: fail-open, no gating beyond "is there
 * anything to say."
 *
 * Two resolution paths:
 * - `memberId` provided (pre-auth invite holder): looks up the member directly
 *   by id. Bypasses the chat_sessions lookup — user_id is null until sign-in.
 * - `sessionId` only: resolves user_id from chat_sessions, then looks up the
 *   member by user_id (the original signed-in path).
 *
 * `isFirstTurn` gates only the marker-emission instruction, not the
 * descriptive name/email/phone/primer lines (which are safe and useful to
 * repeat every turn). The caller computes `isFirstTurn` from whether this
 * session's own message history already contains a real assistant reply —
 * a deterministic, server-side signal, not something the model is trusted to
 * infer from re-reading its own prior turns.
 *
 * Returns null when:
 * - no member row is found
 * - the member row has no name/email/phone/primer to report
 * - any DB call fails
 */
export async function getMemberContext(
  sessionId: string | null,
  tenantId: string | null,
  memberId: string | null | undefined,
  isFirstTurn: boolean,
): Promise<string | null> {
  if (!tenantId) return null
  if (!sessionId && !memberId) return null

  const supabase = getAdminClient()

  let resolvedMemberId: string | null = null

  if (memberId) {
    // Fast path: member id provided directly (pre-auth invite holder). Skip the
    // chat_sessions lookup entirely — user_id is null until sign-in.
    resolvedMemberId = memberId
    console.log('[chat/member-context] using provided memberId directly', { memberId, tenantId })
  } else {
    // Step 1: resolve user_id from the session.
    const { data: sessionRow, error: sessionErr } = await supabase
      .from('chat_sessions')
      .select('user_id')
      .eq('id', sessionId!)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (sessionErr) {
      console.error('[chat/member-context] session lookup failed:', sessionErr.message)
      return null
    }

    const userId = (sessionRow as { user_id?: string | null } | null)?.user_id ?? null
    if (!userId) {
      console.log('[chat/member-context] no user_id for session — skipping', { sessionId })
      return null
    }

    // Resolve the member row id via user_id so Step 2 below is uniform.
    const { data: idRow, error: idErr } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (idErr) {
      console.error('[chat/member-context] member id lookup failed:', idErr.message)
      return null
    }
    resolvedMemberId = (idRow as { id: string } | null)?.id ?? null
    if (!resolvedMemberId) {
      console.log('[chat/member-context] no member row for user_id — skipping', { userId, tenantId })
      return null
    }
  }

  // Step 2: fetch the member's identity + primer data.
  // `name` is the member's current name; `invited_name` is invite-creation
  // metadata and only ever a fallback (see resolveMemberName). This select
  // previously omitted `name` entirely — that was D2: 12 members whose name was
  // in the database but who the model was never told about, on every turn.
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id, primer, name, invited_name, email, phone')
    .eq('id', resolvedMemberId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (memberErr) {
    console.error('[chat/member-context] member lookup failed:', memberErr.message)
    return null
  }

  const member = memberRow as {
    id: string
    primer: string | null
    name: string | null
    invited_name: string | null
    email: string | null
    phone: string | null
  } | null

  if (!member) {
    console.log('[chat/member-context] no member row found', { resolvedMemberId, tenantId })
    return null
  }

  const name      = resolveMemberName(member)
  const email     = identityValue(member.email) ?? null
  const phone     = identityValue(member.phone) ?? null
  const primerText = member.primer?.trim() || null

  const contextLines: string[] = []
  if (name)       contextLines.push(`Member's name is ${name}.`)
  if (email)      contextLines.push(`Email: ${email}.`)
  if (phone)      contextLines.push(`Phone: ${phone}.`)
  if (primerText) contextLines.push(primerText)

  if (contextLines.length === 0) {
    console.log('[chat/member-context] member has no identity/primer data — nothing to inject', {
      memberId: member.id,
    })
    return null
  }

  const markerLines: string[] = []
  if (name)  markerLines.push(`[NAME: ${name}]`)
  if (email) markerLines.push(`[EMAIL: ${email}]`)
  if (phone) markerLines.push(`[PHONE: ${phone}]`)

  const markerInstruction = isFirstTurn && markerLines.length > 0
    ? `\n\nOn your first reply, silently append each of the following hidden markers on their own line at the very end of your message (they are stripped before the member sees your reply):\n${markerLines.join('\n')}`
    : ''

  const result = contextLines.join(' ') + markerInstruction

  console.log('[chat/member-context] found', {
    memberId: member.id,
    hasName: !!name,
    hasEmail: !!email,
    hasPhone: !!phone,
    isFirstTurn,
    emittingMarkerInstruction: markerInstruction.length > 0,
    resultLength: result.length,
  })
  return result
}
