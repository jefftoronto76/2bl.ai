// PATCH /api/platform/members/status
// Platform admin only. Bulk status change — applies the new status to every
// membership of each supplied user. Writes one MEMBER_STATUS_UPDATED audit
// row per affected membership. Eligibility is resolved server-side (deleted
// memberships are never overwritten back to a lesser state like suspended).

import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

type MemberStatus = 'active' | 'invited' | 'waitlist' | 'suspended' | 'deleted'

const VALID_STATUSES = new Set<MemberStatus>(['active', 'invited', 'waitlist', 'suspended', 'deleted'])

// Statuses that should never be overwritten by a bulk status change (a hard-deleted
// membership stays deleted regardless of what the bulk action intends).
const PROTECTED_STATUSES = new Set(['deleted'])

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { user_ids?: string[]; status?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { user_ids, status } = body
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return Response.json({ error: 'user_ids must be a non-empty array' }, { status: 400 })
  }
  if (!status || !VALID_STATUSES.has(status as MemberStatus)) {
    return Response.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }

  const supabase = getAdminClient()

  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const actorId = (actorRow as { id: string } | null)?.id ?? null
  const platformTenantId = await getTenantFromRequest(req)

  // Fetch all current memberships for the target users.
  const { data: memberships, error: fetchErr } = await supabase
    .from('members')
    .select('id, user_id, tenant_id, status')
    .in('user_id', user_ids)

  if (fetchErr) {
    console.error('[platform/members/status] fetch failed:', fetchErr.message)
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }

  // Filter to eligible memberships (not already in a protected state).
  const eligible = ((memberships ?? []) as { id: string; user_id: string; tenant_id: string; status: string }[]).filter(
    (m) => !PROTECTED_STATUSES.has(m.status) && m.status !== status,
  )

  if (eligible.length === 0) {
    return Response.json({ ok: true, updated: 0, message: 'No eligible memberships to update' })
  }

  const { error: updateErr } = await supabase
    .from('members')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', eligible.map((m) => m.id))

  if (updateErr) {
    console.error('[platform/members/status] bulk update failed:', updateErr.message)
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  // One audit row per affected membership.
  for (const m of eligible) {
    void logEvent({
      action: AuditAction.MEMBER_STATUS_UPDATED,
      tenant_id: platformTenantId,
      actor_id: actorId,
      actor_type: 'user',
      clerk_user_id: user.providerUserId,
      target_type: 'member',
      target_id: m.id,
      correlation_id: req.headers.get('x-correlation-id'),
      changes: { before: { status: m.status }, after: { status } },
      metadata: { user_id: m.user_id, tenant_id: m.tenant_id },
    })
  }

  return Response.json({ ok: true, updated: eligible.length })
}
