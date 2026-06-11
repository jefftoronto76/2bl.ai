import { getCurrentUser } from '@/services/auth'
import { createTenant, type TenantInput } from '@/services/tenant'
import { logEvent, AuditAction } from '@/services/audit'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

// Tenant creation is a privileged, cross-tenant write. Gate it on the same
// signal the (platform) layout/page use — AuthUser.isPlatformAdmin, resolved
// inside services/auth —
// re-checked here so the service-role INSERT can never run for a non-admin,
// independent of any client-side routing. Validation + data-access live in
// services/tenant.

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: TenantInput
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await createTenant(body)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.TENANT_CREATE,
    // Host-resolved attribution per 2026-06-11 directive; stays null when the
    // platform host doesn't map to a tenants.domain row (platform-level event).
    tenant_id: await getTenantFromRequest(req),
    actor_id: null,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    target_type: 'tenant',
    target_id: (result.data as { id?: string })?.id ?? null,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { name: body.name, type: body.type },
  })

  return Response.json(result.data, { status: result.status })
}
