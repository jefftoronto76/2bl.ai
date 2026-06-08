import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { claimMembership } from '@/services/auth/claim-membership'
import { HEIRLOOM_TENANT_ID } from '@/services/auth/sync-member'
import { logEvent, AuditAction } from '@/services/audit'

/**
 * POST /api/heirloom/members/claim
 *
 * Creates a pending membership record for a visitor who has just authenticated
 * via Clerk. Called from GateView after MagicLinkCard sign-up completes.
 * Returns 200 when the claim succeeds or a row already exists (idempotent).
 * Returns 401 when no Clerk session is present.
 */
export async function POST(req: Request) {
  const clerk = await currentUser()
  if (!clerk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await claimMembership(clerk.id, HEIRLOOM_TENANT_ID)

  if (!result.ok) {
    console.error('[api/heirloom/members/claim] claimMembership failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  console.log('[api/heirloom/members/claim] claim succeeded for', clerk.id)

  void logEvent({
    action: AuditAction.MEMBER_CLAIM,
    tenant_id: HEIRLOOM_TENANT_ID,
    clerk_user_id: clerk.id,
    target_type: 'member',
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return NextResponse.json({ ok: true })
}
