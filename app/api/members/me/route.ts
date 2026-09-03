import { NextResponse } from 'next/server'
import { getCurrentUser, getTenantFromRequest, HEIRLOOM_TENANT_ID } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

/**
 * GET /api/members/me
 *
 * Read-only. Resolves the caller's own `members` row for this tenant and
 * returns { name, invitedName, createdAt } for the name-completion gate
 * (NameCompletionGate.tsx) to evaluate. Same clerk_id-scoped resolution
 * `/api/sage`'s resolveMemberId uses (app/api/sage/route.ts) — server-
 * verified only, no client-supplied id ever accepted, unlike
 * services/crm/feedback.ts's user_id + client-fallback variant, which is the
 * wrong pattern for resolving a caller's OWN identity.
 *
 * Returns raw name/invitedName rather than pre-resolving via
 * resolveMemberName, so the one caller (the client component) applies the
 * shared precedence rule itself instead of this route holding a second copy
 * of it — see services/shared/identity.ts's doc comment on why that
 * duplication (D2) is exactly the failure mode to avoid.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (await getTenantFromRequest(req)) ?? HEIRLOOM_TENANT_ID

  const supabase = getAdminClient()
  const { data: memberRow } = await supabase
    .from('members')
    .select('name, invited_name, created_at')
    .eq('tenant_id', tenantId)
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()

  if (!memberRow) {
    // Signed-in Clerk user with no resolvable Heirloom members row (e.g. a
    // race with the members upsert, or a tenant mismatch). Not an error —
    // createdAt: null makes the gate condition unsatisfiable, so this fails
    // open rather than blocking the chat surface.
    return NextResponse.json({ name: null, invitedName: null, createdAt: null })
  }

  const row = memberRow as { name: string | null; invited_name: string | null; created_at: string }
  return NextResponse.json({
    name: row.name,
    invitedName: row.invited_name,
    createdAt: row.created_at,
  })
}
