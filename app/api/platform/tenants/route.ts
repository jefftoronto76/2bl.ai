import { currentUser } from '@clerk/nextjs/server'
import { createTenant, type TenantInput } from '@/services/tenant'

// Tenant creation is a privileged, cross-tenant write. Gate it on the same
// signal the (platform) layout/page use — Clerk publicMetadata.role —
// re-checked here so the service-role INSERT can never run for a non-admin,
// independent of any client-side routing. Validation + data-access live in
// services/tenant.

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (user.publicMetadata as Record<string, unknown>)?.role
  if (role !== 'platform_admin') {
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
  return Response.json(result.data, { status: result.status })
}
