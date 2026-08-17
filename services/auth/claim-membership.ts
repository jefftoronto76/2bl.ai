// services/auth/claim-membership.ts
// Server-only. Creates a pending membership record for a visitor who has just
// authenticated via Clerk but is not yet an active Heirloom member. Idempotent:
// if a row already exists (with any status), it is left unchanged — this
// prevents downgrading an 'active' member back to 'pending' on a re-claim.

import { getAdminClient } from './supabase-admin'
import { HEIRLOOM_TENANT_ID } from './sync-member'
import { setIdentityField, setIdentityEmail } from '@/services/shared/identity'

export type ClaimMembershipResult = { ok: true } | { ok: false; error: string }

export interface ClaimMembershipContact {
  name?: string | null
  email?: string | null
  phone?: string | null
}

/**
 * Inserts a members row with status 'pending' if one does not already exist.
 * Existing rows (any status) are left untouched. name/email/phone are written
 * on insert when provided.
 */
export async function claimMembership(
  clerkUserId: string,
  tenantId: string = HEIRLOOM_TENANT_ID,
  contact: ClaimMembershipContact = {},
): Promise<ClaimMembershipResult> {
  const supabase = getAdminClient()

  // Check for an existing row first so we never downgrade an active member.
  const { data: existing, error: fetchErr } = await supabase
    .from('members')
    .select('id, status')
    .eq('clerk_id', clerkUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[heirloom/claim-membership] fetch failed:', fetchErr.message)
    return { ok: false, error: fetchErr.message }
  }

  if (existing) {
    console.log('[heirloom/claim-membership] row already exists, no-op:', {
      clerk_id: clerkUserId,
      status: existing.status,
    })
    return { ok: true }
  }

  const insertPayload: Record<string, unknown> = {
    clerk_id: clerkUserId,
    tenant_id: tenantId,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }
  setIdentityField(insertPayload, 'name', contact.name)
  setIdentityEmail(insertPayload, 'email', contact.email)
  setIdentityField(insertPayload, 'phone', contact.phone)

  const { error: insertErr } = await supabase.from('members').insert(insertPayload)

  if (insertErr) {
    console.error('[heirloom/claim-membership] insert failed:', insertErr.message)
    return { ok: false, error: insertErr.message }
  }

  console.log('[heirloom/claim-membership] pending membership created:', {
    clerk_id: clerkUserId,
    tenant_id: tenantId,
  })
  return { ok: true }
}
