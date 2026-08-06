// services/auth/sync-member.ts
// Server-only. Upserts a members row for a newly-authenticated Clerk user,
// syncing their contact info (email or phone) from Clerk into the members table.
// Called once post-authentication — idempotent on re-auth.

import { getAdminClient } from './supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

export const HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'

export interface SyncMemberInput {
  clerkUserId: string
  /** Defaults to Heirloom tenant. Pass explicitly for multi-tenant use. */
  tenantId?: string
  /** From Clerk's firstName + lastName — undefined to skip field. */
  name?: string | null
  /** From Clerk's emailAddresses[0].emailAddress — undefined to skip field. */
  email?: string | null
  /** From Clerk's phoneNumbers[0].phoneNumber — undefined to skip field. */
  phone?: string | null
}

export interface MemberRow {
  id: string
  clerk_id: string
  tenant_id: string
  name: string | null
  email: string | null
  phone: string | null
  status: string
  created_at: string
  updated_at: string
}

export type SyncMemberResult =
  | { ok: true; data: MemberRow }
  | { ok: false; error: string }

/**
 * Upserts a members row on clerk_id. On first auth creates the row with
 * status 'active'; on subsequent auths updates email/phone if supplied.
 * Uses the service-role client — server-only, bypasses RLS.
 *
 * Resolves (or creates) the users row for this clerk_id first — same pattern
 * as linkInvitedMember (services/members/members.ts) — so members.user_id is
 * always set. Historically this function omitted user_id entirely, which
 * left active, Clerk-linked members rows with a permanently null user_id
 * whenever this fallback path (rather than linkInvitedMember/acceptInvite)
 * created the row. See System Docs/Known Gaps.md.
 */
export async function syncMember(input: SyncMemberInput): Promise<SyncMemberResult> {
  const { clerkUserId, tenantId = HEIRLOOM_TENANT_ID, name, email, phone } = input
  const supabase = getAdminClient()

  const usersPayload: Record<string, unknown> = { clerk_id: clerkUserId }
  if (name !== undefined) usersPayload.name = name
  if (email !== undefined) usersPayload.email = email
  if (phone !== undefined) usersPayload.phone = phone

  const { data: usersRow, error: usersErr } = await supabase
    .from('users')
    .upsert(usersPayload, { onConflict: 'clerk_id' })
    .select('id')
    .single()

  if (usersErr || !usersRow) {
    console.error('[heirloom/sync-member] users upsert failed:', usersErr?.message)
    void logEvent({
      action: AuditAction.MEMBER_USER_RESOLVE_FAILED,
      clerk_user_id: clerkUserId,
      tenant_id: tenantId,
      outcome: 'failure',
      metadata: { stage: 'sync_member', error: usersErr?.message ?? 'no row returned' },
    })
    return { ok: false, error: usersErr?.message ?? 'users upsert returned no row' }
  }

  const userId = (usersRow as { id: string }).id

  // Build the upsert payload. name/email/phone are included only when the
  // caller supplies them (undefined = caller has no value, don't touch the
  // column) — user_id is always included since it's now always resolved above.
  const payload: Record<string, unknown> = {
    clerk_id: clerkUserId,
    tenant_id: tenantId,
    user_id: userId,
    status: 'active',
    updated_at: new Date().toISOString(),
  }
  if (name !== undefined) payload.name = name
  if (email !== undefined) payload.email = email
  if (phone !== undefined) payload.phone = phone

  const { data, error } = await supabase
    .from('members')
    .upsert(payload, { onConflict: 'clerk_id' })
    .select()
    .single()

  if (error) {
    console.error('[heirloom/sync-member] upsert failed:', error.message)
    return { ok: false, error: error.message }
  }

  return { ok: true, data: data as MemberRow }
}
