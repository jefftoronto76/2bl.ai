// services/auth/claim-membership.ts
// Server-only. Creates a pending membership record for a visitor who has just
// authenticated via Clerk but is not yet an active Heirloom member. Idempotent:
// if a row already exists (with any status), it is left unchanged — this
// prevents downgrading an 'active' member back to 'pending' on a re-claim.

import { getAdminClient } from './supabase-admin'
import { HEIRLOOM_TENANT_ID } from './sync-member'

export type ClaimMembershipResult = { ok: true } | { ok: false; error: string }

/**
 * Inserts a members row with status 'pending' if one does not already exist.
 * Existing rows (any status) are left untouched.
 */
export async function claimMembership(
  clerkUserId: string,
  tenantId: string = HEIRLOOM_TENANT_ID,
): Promise<ClaimMembershipResult> {
  const supabase = getAdminClient()

  // Check for an existing row first so we never downgrade an active member.
  const { data: existing, error: fetchErr } = await supabase
    .from('members')
    .select('id, status')
    .eq('clerk_user_id', clerkUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[heirloom/claim-membership] fetch failed:', fetchErr.message)
    return { ok: false, error: fetchErr.message }
  }

  if (existing) {
    console.log('[heirloom/claim-membership] row already exists, no-op:', {
      clerk_user_id: clerkUserId,
      status: existing.status,
    })
    return { ok: true }
  }

  const { error: insertErr } = await supabase.from('members').insert({
    clerk_user_id: clerkUserId,
    tenant_id: tenantId,
    status: 'pending',
    updated_at: new Date().toISOString(),
  })

  if (insertErr) {
    console.error('[heirloom/claim-membership] insert failed:', insertErr.message)
    return { ok: false, error: insertErr.message }
  }

  console.log('[heirloom/claim-membership] pending membership created:', {
    clerk_user_id: clerkUserId,
    tenant_id: tenantId,
  })
  return { ok: true }
}
