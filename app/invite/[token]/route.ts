// GET /invite/[token]
// Public, unauthenticated redirect. The tracking hinge for invite-link
// observability (Option B): stamps opened_at (last-open semantics) and
// increments opens on first + every subsequent hit, then 302s to the same
// host's `/?invite=TOKEN` — the existing Heirloom gate flow
// (app/heirloom/page.tsx) picks the query param up unchanged.
//
// 404 — token doesn't exist. 410 — invite was revoked. expires_at is read
// but NOT enforced yet (deferred — see CLAUDE.md).

import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

interface RouteContext {
  params: Promise<{ token: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const { token } = await context.params

  if (!token) {
    return new Response('Not found', { status: 404 })
  }

  const supabase = getAdminClient()

  const { data: row, error } = await supabase
    .from('members')
    .select('id, tenant_id, used_at, opened_at, opens, revoked_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('[invite/[token]] lookup failed:', error.message, { token: token.slice(0, 8) + '…' })
    return new Response('Not found', { status: 404 })
  }

  if (!row) {
    console.warn('[invite/[token]] token not found', { token: token.slice(0, 8) + '…' })
    return new Response('Not found', { status: 404 })
  }

  const member = row as {
    id: string
    tenant_id: string
    used_at: string | null
    opened_at: string | null
    opens: number | null
    revoked_at: string | null
    expires_at: string | null
  }

  if (member.revoked_at) {
    console.warn('[invite/[token]] revoked', { memberId: member.id, token: token.slice(0, 8) + '…' })
    return new Response('This invite link has been revoked.', { status: 410 })
  }

  const now = new Date().toISOString()

  if (!member.used_at) {
    const { error: updateErr } = await supabase
      .from('members')
      .update({ opened_at: now, opens: (member.opens ?? 0) + 1, updated_at: now })
      .eq('id', member.id)

    if (updateErr) {
      console.error('[invite/[token]] opened_at/opens update failed (non-fatal):', updateErr.message, {
        memberId: member.id,
      })
    }
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_OPENED,
    tenant_id: member.tenant_id,
    actor_type: 'anonymous',
    target_type: 'member',
    target_id: member.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { already_accepted: !!member.used_at },
  })

  console.log('[invite/[token]] redirecting', { memberId: member.id, alreadyAccepted: !!member.used_at })

  return Response.redirect(new URL(`/?invite=${token}`, req.url), 302)
}
