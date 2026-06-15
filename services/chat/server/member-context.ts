// services/chat/server/member-context.ts
// Server-only. Resolves the one-time primer for a chat session's member.
// Fail-open: any error returns null so the chat is never blocked.

import { getAdminClient } from '@/services/auth/supabase-admin'

/**
 * Returns the primer text for the member who owns this session, then stamps
 * `primer_used_at` so it is only injected once (first session only).
 *
 * Returns null when:
 * - the session has no user_id (anonymous visitor)
 * - no matching members row with a primer is found
 * - the primer has already been used (primer_used_at is set)
 * - any DB call fails
 */
export async function getMemberPrimer(
  sessionId: string,
  tenantId: string | null,
): Promise<string | null> {
  if (!sessionId || !tenantId) return null

  const supabase = getAdminClient()

  // Step 1: resolve user_id from the session.
  const { data: sessionRow, error: sessionErr } = await supabase
    .from('chat_sessions')
    .select('user_id')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (sessionErr) {
    console.error('[chat/primer] session lookup failed:', sessionErr.message)
    return null
  }

  const userId = (sessionRow as { user_id?: string | null } | null)?.user_id ?? null
  if (!userId) {
    console.log('[chat/primer] no user_id for session — skipping', { sessionId })
    return null
  }

  // Step 2: find the member's primer (only when not yet used).
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id, primer, primer_used_at, invited_name, email, phone')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (memberErr) {
    console.error('[chat/primer] member lookup failed:', memberErr.message)
    return null
  }

  const member = memberRow as {
    id: string
    primer: string | null
    primer_used_at: string | null
    invited_name: string | null
    email: string | null
    phone: string | null
  } | null

  if (!member || !member.primer) {
    console.log('[chat/primer] no primer set for member', { userId, tenantId })
    return null
  }

  if (member.primer_used_at) {
    console.log('[chat/primer] primer already used — skipping', { memberId: member.id })
    return null
  }

  // Step 3: stamp primer_used_at so it is only injected once.
  const { error: stampErr } = await supabase
    .from('members')
    .update({ primer_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', member.id)

  if (stampErr) {
    // Non-fatal: still return the primer so this first session works correctly.
    // The next session will check primer_used_at; if the stamp failed it will
    // inject again, which is acceptable as a safety fallback.
    console.error('[chat/primer] failed to stamp primer_used_at (non-fatal):', stampErr.message)
  }

  const name      = member.invited_name?.trim() ?? null
  const email     = member.email?.trim() ?? null
  const phone     = member.phone?.trim() ?? null
  const primerText = member.primer.trim()

  const contextLines: string[] = []
  if (name)       contextLines.push(`Member's name is ${name}.`)
  if (email)      contextLines.push(`Email: ${email}.`)
  if (phone)      contextLines.push(`Phone: ${phone}.`)
  if (primerText) contextLines.push(primerText)

  const markerLines: string[] = []
  if (name)  markerLines.push(`[NAME: ${name}]`)
  if (email) markerLines.push(`[EMAIL: ${email}]`)
  if (phone) markerLines.push(`[PHONE: ${phone}]`)

  const markerInstruction = markerLines.length > 0
    ? `\n\nOn your first reply, silently append each of the following hidden markers on their own line at the very end of your message (they are stripped before the member sees your reply):\n${markerLines.join('\n')}`
    : ''

  const result = contextLines.join(' ') + markerInstruction

  console.log('[chat/primer] found and stamped', { memberId: member.id, hasName: !!name, hasEmail: !!email, hasPhone: !!phone })
  return result
}
