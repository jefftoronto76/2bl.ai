import { currentUser } from '@clerk/nextjs/server'
import { updateTenant, deleteTenant, type TenantInput } from '@/services/tenant'
import { logEvent, AuditAction } from '@/services/audit'

// PATCH/DELETE for a single tenant. Same gate as POST /api/platform/tenants —
// platform_admin only, re-checked here so these privileged service-role writes
// can never run for a non-admin. Validation + data-access live in
// services/tenant.

interface RouteContext {
  params: Promise<{ id: string }>
}

// Returns a denial Response when the caller is not a platform admin, else null.
async function denyUnlessPlatformAdmin(): Promise<Response | null> {
  const user = await currentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (user.publicMetadata as Record<string, unknown>)?.role
  if (role !== 'platform_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function PATCH(req: Request, context: RouteContext) {
  const denied = await denyUnlessPlatformAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return Response.json({ error: 'Missing tenant id' }, { status: 400 })
  }

  let body: TenantInput
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await updateTenant(id, body)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.TENANT_UPDATE,
    target_type: 'tenant',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
    changes: { after: body },
    metadata: {},
  })

  return Response.json(result.data, { status: result.status })
}

export async function DELETE(req: Request, context: RouteContext) {
  const denied = await denyUnlessPlatformAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return Response.json({ error: 'Missing tenant id' }, { status: 400 })
  }

  const result = await deleteTenant(id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.TENANT_DELETE,
    target_type: 'tenant',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return Response.json(result.data, { status: result.status })
}
