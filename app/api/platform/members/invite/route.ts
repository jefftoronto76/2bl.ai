// POST /api/platform/members/invite
// Platform admin only. Creates a members row with status = 'invited' and
// returns the generated token plus a fully-qualified invite_url built from
// the tenant's configured domain (so invite links point to the right product
// host rather than the admin host).

import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { createMemberInvite } from '@/services/members'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { tenant_id?: string; invited_name?: string | null; email?: string | null; phone?: string | null; auto_open?: boolean; primer?: string | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id, invited_name, email, phone, auto_open, primer } = body
  if (!tenant_id) {
    return Response.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Resolve the Supabase users.id for the acting admin for audit attribution.
  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const resolvedActorId = (actorRow as { id: string } | null)?.id ?? null

  // Look up the tenant's configured domain and default_primer for invite URL construction.
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('domain, default_primer')
    .eq('id', tenant_id)
    .maybeSingle()
  const tenantDomain = (tenantRow as { domain: string | null; default_primer?: string | null } | null)?.domain ?? null
  const defaultPrimer = (tenantRow as { domain: string | null; default_primer?: string | null } | null)?.default_primer ?? null

  // Use the request-supplied primer when provided; fall back to the tenant default.
  const resolvedPrimer = (primer != null && primer.trim().length > 0)
    ? primer.trim()
    : defaultPrimer

  const result = await createMemberInvite(
    tenant_id,
    resolvedActorId,
    invited_name ?? null,
    email ?? null,
    phone ?? null,
    auto_open === true,
    resolvedPrimer,
  )

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { token, memberId } = result.data
  const inviteUrl = tenantDomain
    ? `https://${tenantDomain}?invite=${token}`
    : null

  return Response.json({ token, member_id: memberId, invite_url: inviteUrl }, { status: 201 })
}
