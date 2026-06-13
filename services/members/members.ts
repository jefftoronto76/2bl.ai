// services/members/members.ts
// Server-only. Data-access for member invite operations on the `members` table.
// The `invites` table is retired — invite state now lives on `members` directly
// via token / used_at / invited_name / status = 'invited'.

import { randomBytes } from 'crypto'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

export const HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'

export interface MemberInviteRow {
  id: string
  tenant_id: string
  clerk_id: string | null
  user_id: string | null
  email: string | null
  name: string | null
  invited_name: string | null
  role: string
  status: string
  token: string | null
  used_at: string | null
  created_at: string
  updated_at: string
}

export type MembersResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Creates a members row with status = 'invited'. The invitee has no Clerk
 * account yet — user_id and clerk_id are null until they sign up and the
 * Clerk webhook fires (see linkInvitedMember).
 */
export async function createMemberInvite(
  tenantId: string,
  actorId: string | null,
  invitedName?: string | null,
): Promise<MembersResult<{ token: string; memberId: string }>> {
  const supabase = getAdminClient()
  const token = generateToken()

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    status: 'invited',
    role: 'member',
    token,
    updated_at: new Date().toISOString(),
  }
  if (invitedName != null && invitedName.trim().length > 0) {
    payload.invited_name = invitedName.trim()
  }

  const { data, error } = await supabase
    .from('members')
    .insert(payload)
    .select('id, token')
    .single()

  if (error) {
    console.error('[members] createMemberInvite failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_CREATED,
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'member',
    target_id: (data as { id: string }).id,
    metadata: { has_invited_name: invitedName != null && invitedName.trim().length > 0 },
  })

  return { ok: true, data: { token: (data as { token: string }).token, memberId: (data as { id: string }).id } }
}

/**
 * Validates an invite token. Returns the members row when the token exists and
 * has not been used; null otherwise.
 */
export async function validateMemberToken(
  token: string,
): Promise<MemberInviteRow | null> {
  if (!token || token.trim().length === 0) return null

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('members')
    .select('id, tenant_id, clerk_id, user_id, email, name, invited_name, role, status, token, used_at, created_at, updated_at')
    .eq('token', token)
    .is('used_at', null)
    .maybeSingle()

  if (error || !data) return null
  return data as MemberInviteRow
}

/**
 * Called by the Clerk user.created webhook to link a newly-signed-up user to
 * their pending invited members row. Matches by email (case-insensitive).
 * No-ops when no matching invited row is found (sign-up without an invite).
 */
export async function linkInvitedMember(
  clerkId: string,
  email: string,
): Promise<void> {
  if (!email) return

  const supabase = getAdminClient()

  // Resolve users.id for this Clerk user (may not exist yet if webhook fires
  // before the first sign-in write — create it if missing).
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .upsert({ clerk_id: clerkId, email: email.toLowerCase() }, { onConflict: 'clerk_id' })
    .select('id')
    .single()

  if (userErr || !userRow) {
    console.error('[members] linkInvitedMember — could not resolve users.id:', userErr?.message)
    return
  }

  const userId = (userRow as { id: string }).id

  // Find any invited row matching this email that hasn't been used yet.
  const { data: invitedRow, error: findErr } = await supabase
    .from('members')
    .select('id, tenant_id')
    .ilike('email', email)
    .eq('status', 'invited')
    .is('used_at', null)
    .maybeSingle()

  if (findErr) {
    console.error('[members] linkInvitedMember — find failed:', findErr.message)
    return
  }

  if (!invitedRow) {
    // Normal for sign-ups without an invite — no-op.
    return
  }

  const { error: updateErr } = await supabase
    .from('members')
    .update({
      clerk_id: clerkId,
      user_id: userId,
      status: 'active',
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', (invitedRow as { id: string }).id)

  if (updateErr) {
    console.error('[members] linkInvitedMember — update failed:', updateErr.message)
    return
  }

  console.log('[members] linkInvitedMember — linked:', {
    clerk_id: clerkId,
    member_id: (invitedRow as { id: string }).id,
  })
}

/**
 * Hard-deletes a user row. The DB cascade removes dependent members /
 * chat_sessions rows. Writes an audit record before deleting (so the audit
 * row is never orphaned).
 */
export async function hardDeleteMember(
  userId: string,
  actorId: string | null,
  tenantId: string | null,
): Promise<MembersResult<{ id: string }>> {
  const supabase = getAdminClient()

  // Write audit before delete so the record survives.
  void logEvent({
    action: AuditAction.MEMBER_HARD_DELETED,
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'user',
    target_id: userId,
    metadata: { reason: 'admin_hard_delete' },
  })

  const { error } = await supabase.from('users').delete().eq('id', userId)

  if (error) {
    console.error('[members] hardDeleteMember failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: { id: userId } }
}
