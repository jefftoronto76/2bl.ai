import { NextResponse } from 'next/server'
import { getCurrentUser, syncMember, HEIRLOOM_TENANT_ID, getTenantFromRequest } from '@/services/auth'
import { identityValue } from '@/services/shared/identity'

/**
 * POST /api/members/sync
 *
 * Fires once post-authentication. Upserts the users and members rows for the
 * signed-in Clerk user, syncing email, phone, and display name. Protected by
 * Clerk auth — returns 401 when no session exists. Tenant is resolved from the
 * Host header (falls back to Heirloom default).
 *
 * Both rows are written by `syncMember`, which owns the identity-write rule for
 * every column. This route previously also upserted `users` itself, guarded by
 * `if (suppliedName)` while passing an unguarded `name` through to `syncMember`
 * — that asymmetry is what produced D1's signature (members.name nulled while
 * users.name survived). One writer, one rule.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (await getTenantFromRequest(req)) ?? HEIRLOOM_TENANT_ID

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const suppliedName = typeof body.name === 'string' ? body.name : null

  // The name the visitor typed wins; Clerk's own firstName + lastName (already
  // joined onto AuthUser.name at the services/auth boundary) is the fallback so
  // a member Clerk can already name is never left nameless here. Both go
  // through identityValue, so an empty typed name falls through to Clerk rather
  // than resolving to "no value".
  const name = identityValue(suppliedName) ?? identityValue(user.name) ?? null

  const result = await syncMember({
    clerkUserId: user.providerUserId,
    tenantId,
    name,
    email: user.email ?? null,
    phone: user.phone ?? null,
  })

  if (!result.ok) {
    console.error('[api/members/sync] syncMember failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ member: result.data })
}
