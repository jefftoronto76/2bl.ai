// PATCH /api/platform/members/roles
// Platform admin only. Updates members.role for each supplied change in a
// batch, then writes one MEMBER_ROLE_UPDATED audit row per change.
//
// NOTE: V1 uses sequential updates rather than a true DB transaction. A failed
// intermediate write is logged and skipped but does not roll back prior writes.
// Migrate to a Postgres RPC when full atomicity is required.

import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

interface RoleChange {
  tenant_id: string
  role: string
}

const VALID_ROLES = new Set(['owner', 'admin', 'member', 'viewer'])

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { user_id?: string; changes?: RoleChange[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { user_id, changes } = body
  if (!user_id) return Response.json({ error: 'user_id is required' }, { status: 400 })
  if (!Array.isArray(changes) || changes.length === 0) {
    return Response.json({ error: 'changes must be a non-empty array' }, { status: 400 })
  }

  const invalidRole = changes.find((c) => !VALID_ROLES.has(c.role))
  if (invalidRole) {
    return Response.json({ error: `Invalid role: ${invalidRole.role}` }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Resolve actor's users.id for audit attribution.
  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const actorId = (actorRow as { id: string } | null)?.id ?? null
  const platformTenantId = await getTenantFromRequest(req)

  // Fetch current roles so we can record before/after in the audit log.
  const { data: existing } = await supabase
    .from('members')
    .select('tenant_id, role')
    .eq('user_id', user_id)
    .in('tenant_id', changes.map((c) => c.tenant_id))

  const currentRoles = new Map<string, string>(
    ((existing ?? []) as { tenant_id: string; role: string }[]).map((r) => [r.tenant_id, r.role]),
  )

  const failed: string[] = []

  for (const change of changes) {
    const { error } = await supabase
      .from('members')
      .update({ role: change.role, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .eq('tenant_id', change.tenant_id)

    if (error) {
      console.error('[platform/members/roles] update failed:', change.tenant_id, error.message)
      failed.push(change.tenant_id)
      continue
    }

    void logEvent({
      action: AuditAction.MEMBER_ROLE_UPDATED,
      tenant_id: platformTenantId,
      actor_id: actorId,
      actor_type: 'user',
      clerk_user_id: user.providerUserId,
      target_type: 'member',
      target_id: user_id,
      correlation_id: req.headers.get('x-correlation-id'),
      changes: {
        before: { role: currentRoles.get(change.tenant_id) ?? null },
        after: { role: change.role },
      },
      metadata: { tenant_id: change.tenant_id },
    })
  }

  if (failed.length > 0) {
    return Response.json(
      { error: `Some role updates failed`, failed_tenant_ids: failed },
      { status: 207 },
    )
  }

  return Response.json({ ok: true, updated: changes.length })
}
