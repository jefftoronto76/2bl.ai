import { NextResponse } from 'next/server'
import { getCurrentUser, claimMembership, ensureClerkUser, HEIRLOOM_TENANT_ID } from '@/services/auth'
import { logEvent, AuditAction } from '@/services/audit'

/**
 * POST /api/heirloom/members/claim
 *
 * Creates a pending membership record for a visitor who has just authenticated
 * via Clerk. Upserts the users row first (writes name/email/phone), then
 * inserts the pending members row with the same contact fields.
 * Returns 200 when the claim succeeds or a row already exists (idempotent).
 * Returns 401 when no Clerk session is present.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // AuthUser.name is already the joined firstName/lastName (same logic the
  // route previously inlined).
  const email = user.email ?? null
  const phone = user.phone ?? null
  const name = user.name ?? null

  // Upsert the users row — writes name, email, phone.
  await ensureClerkUser()

  const result = await claimMembership(user.providerUserId, HEIRLOOM_TENANT_ID, { name, email, phone })

  if (!result.ok) {
    console.error('[api/heirloom/members/claim] claimMembership failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  console.log('[api/heirloom/members/claim] claim succeeded for', user.providerUserId)

  void logEvent({
    action: AuditAction.MEMBER_CLAIM,
    tenant_id: HEIRLOOM_TENANT_ID,
    clerk_user_id: user.providerUserId,
    target_type: 'member',
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return NextResponse.json({ ok: true })
}
