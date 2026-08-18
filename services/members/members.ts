// services/members/members.ts
// Server-only. Data-access for member invite operations on the `members` table.
// The `invites` table is retired — invite state now lives on `members` directly
// via token / used_at / invited_name / status = 'invited'.

import { randomBytes } from 'crypto'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { deleteClerkUser } from '@/services/auth'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { identityValue, setIdentityField, setIdentityEmail } from '@/services/shared/identity'

export const HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'

// Days an invite link stays valid after being created or resent. Stamped onto
// members.expires_at; not yet enforced at the redirect route. Duplicated here
// rather than imported from app/admin/members/constants — services/ must not
// import from app/ (architecture boundary).
const INVITE_TTL_DAYS = 14

export interface MemberInviteRow {
  id: string
  tenant_id: string
  clerk_id: string | null
  user_id: string | null
  email: string | null
  phone: string | null
  name: string | null
  invited_name: string | null
  invited_by: string | null
  role: string
  status: string
  token: string | null
  used_at: string | null
  auto_open: boolean
  primer: string | null
  created_at: string
  updated_at: string
}

export type MembersResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

/**
 * The roles `members.role` can carry (text column, NOT NULL, default 'member').
 * Distinct from `tenant_users.role`, which is the admin-console identity
 * boundary (see services/auth/get-auth-context.ts) — Heirloom visitors are
 * end-customers and never have a tenant_users row.
 */
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

const MEMBER_ROLES: readonly string[] = ['owner', 'admin', 'member', 'viewer']

/**
 * Narrows the raw `members.role` text column to MemberRole.
 *
 * Returns null for an absent row or an unrecognised value, so callers treat
 * "no known role" (an anonymous visitor, or a value added in Studio that the
 * app doesn't know yet) as its own case rather than silently collapsing it
 * into 'member' — the column's DB-level default must not become a UI default.
 */
export function parseMemberRole(raw: unknown): MemberRole | null {
  return typeof raw === 'string' && MEMBER_ROLES.includes(raw) ? (raw as MemberRole) : null
}

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Creates a members row with status = 'invited'. The invitee has no Clerk
 * account yet — user_id and clerk_id are null until they sign up and the
 * Clerk webhook fires (see linkInvitedMember). Optional email and phone lock
 * the invite to a specific contact (used by linkInvitedMember for email-match
 * activation via the webhook path). actorId (the acting admin's users.id, or
 * for a member-initiated collaborator invite, the inviting member's own
 * users.id) is stamped onto invited_by for provenance — null means
 * seeded/self-service and renders as a dash in the members UI.
 *
 * storyId (invites-collaboration-modal, 2026-08-10): which story this invite
 * is for, from the per-story invite trigger in SidebarV2. Stories are real
 * now (Real Story Creation, PR #332, 2026-08-09/10 — a story is an
 * `artifacts` row, type='story', same table as memories) but there is still
 * no story-collaborator join table (same still-dormant-FK situation as
 * media_items.story_id — see Database Schema.md), so this invite→story tie
 * cannot be persisted as a real column/relationship yet. Recorded only in
 * this call's own audit-event metadata (jsonb, no schema change) as a
 * bridge — read it back from audit_events if the story tie needs to be
 * reconstructed before the real schema lands. Do not build against this as
 * the final shape; see System Docs/Known Gaps.md.
 */
export async function createMemberInvite(
  tenantId: string,
  actorId: string | null,
  invitedName?: string | null,
  email?: string | null,
  phone?: string | null,
  autoOpen?: boolean,
  primer?: string | null,
  storyId?: string | null,
): Promise<MembersResult<{ token: string; memberId: string }>> {
  const supabase = getAdminClient()
  const token = generateToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    status: 'invited',
    role: 'member',
    token,
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  }
  if (actorId != null) {
    payload.invited_by = actorId
  }
  // Behaviourally unchanged — these guards were already correct. Routed through
  // the shared helper so there is one implementation of the rule rather than a
  // hand-rolled copy per call site, which is how D1/D4/D5 diverged.
  setIdentityField(payload, 'invited_name', invitedName)
  setIdentityEmail(payload, 'email', email)
  setIdentityField(payload, 'phone', phone)
  if (autoOpen === true) {
    payload.auto_open = true
  }
  if (primer != null && primer.trim().length > 0) {
    payload.primer = primer.trim()
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
    metadata: {
      has_invited_name: invitedName != null && invitedName.trim().length > 0,
      has_email: email != null && email.trim().length > 0,
      has_phone: phone != null && phone.trim().length > 0,
      auto_open: autoOpen === true,
      has_primer: primer != null && primer.trim().length > 0,
      // Provisional story tie — see this function's doc comment. Not a real
      // column; read back from here until Stage 2's schema lands.
      story_id: storyId != null && storyId.trim().length > 0 ? storyId.trim() : null,
    },
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
    .select('id, tenant_id, clerk_id, user_id, email, phone, name, invited_name, invited_by, role, status, token, used_at, auto_open, primer, created_at, updated_at')
    .eq('token', token)
    .is('used_at', null)
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data) return null
  return data as MemberInviteRow
}

/**
 * Checks whether an invite token was ever issued for this tenant, with no
 * regard to status/used_at/revoked_at — used only to distinguish "a real
 * token that's since expired/been used/been revoked" from "a garbage
 * string in the URL" for the chat-first expired-invite bypass. Does not
 * indicate the token is currently valid — use validateMemberToken for that.
 */
export async function memberTokenExists(
  token: string,
  tenantId: string,
): Promise<boolean> {
  if (!token || token.trim().length === 0) return false

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('members')
    .select('id')
    .eq('token', token)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return !error && data !== null
}

/**
 * Called by the Clerk user.created webhook to link a newly-signed-up user to
 * their pending invited members row.
 *
 * Lookup order:
 *  1. Token (primary) — looks up the invited row by token from Clerk
 *     unsafeMetadata. Reliable even when the invite was created without an email
 *     or when the user signs up with a different email.
 *  2. Email (fallback) — case-insensitive match, used when no token is present
 *     (e.g. old invite flow without unsafeMetadata, or GateView sign-up via the
 *     prebuilt Clerk modal which bypasses the custom OTP flow).
 *
 * Returns true when an invited row was found and stamped (caller should skip
 * syncMember to avoid inserting a duplicate active row). Returns false when no
 * invited row was found — caller proceeds with syncMember as normal.
 */
export async function linkInvitedMember(
  clerkId: string,
  email: string,
  token?: string | null,
  /** From Clerk's firstName + lastName (same derivation as syncMember's
   *  webhook-fallback caller, app/api/webhooks/clerk/route.ts) —
   *  null/undefined when Clerk has no name on file. Only written onto the
   *  invited row below when that row's own `name` is currently null —
   *  never overwrites an existing one. */
  name?: string | null,
): Promise<boolean> {
  console.log('[members] linkInvitedMember — called', {
    clerkId,
    email,
    token: token ? token.slice(0, 8) + '…' : null,
  })

  if (!email && !token) {
    console.log('[members] linkInvitedMember — EXIT: no email or token provided')
    return false
  }

  const supabase = getAdminClient()

  // Resolve users.id for this Clerk user (may not exist yet if webhook fires
  // before the first sign-in write — create it if missing).
  // D5: this previously wrote `email: email?.toLowerCase() ?? null`
  // unconditionally. The webhook calls this function as
  // `linkInvitedMember(clerkUserId, email ?? '', …)`, and '' is not nullish, so
  // `''.toLowerCase()` wrote an empty string over a good users.email on every
  // phone-only signup. Same identity rule as everywhere else now, which also
  // makes the lowercase normalisation consistent with the webhook's own users
  // upsert (which wrote raw case moments earlier in the same request).
  const usersPayload: Record<string, unknown> = { clerk_id: clerkId }
  setIdentityEmail(usersPayload, 'email', email)

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .upsert(usersPayload, { onConflict: 'clerk_id' })
    .select('id')
    .single()

  if (userErr || !userRow) {
    console.error('[members] linkInvitedMember — EXIT: could not resolve users.id', {
      clerkId,
      email,
      error: userErr?.message,
    })
    void logEvent({
      action: AuditAction.MEMBER_USER_RESOLVE_FAILED,
      clerk_user_id: clerkId,
      outcome: 'failure',
      metadata: { stage: 'link_invited_member', email, error: userErr?.message ?? 'no row returned' },
    })
    return false
  }

  const userId = (userRow as { id: string }).id
  console.log('[members] linkInvitedMember — resolved users.id', { clerkId, userId })

  // Step 1: token-based lookup (primary). Token is unique — no .ilike needed.
  let invitedRow: { id: string; tenant_id: string; name: string | null } | null = null

  if (!token) {
    console.log('[members] linkInvitedMember — token lookup skipped (no token provided, will try email)', { clerkId, email })
  }

  if (token) {
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('members')
      .select('id, tenant_id, name')
      .eq('token', token)
      .eq('status', 'invited')
      .is('used_at', null)
      .maybeSingle()

    if (tokenErr) {
      console.error('[members] linkInvitedMember — token lookup failed (falling back to email)', {
        clerkId,
        error: tokenErr.message,
      })
    } else if (tokenRow) {
      console.log('[members] linkInvitedMember — found invited row via token', {
        clerkId,
        memberId: tokenRow.id,
        tenantId: tokenRow.tenant_id,
      })
      invitedRow = tokenRow as { id: string; tenant_id: string; name: string | null }
    } else {
      console.log('[members] linkInvitedMember — token not found or already used, trying email fallback', {
        clerkId,
        token: token.slice(0, 8) + '…',
      })
    }
  }

  // Step 2: email-based fallback (used when no token, or token lookup missed).
  if (!invitedRow && email) {
    const { data: emailRow, error: findErr } = await supabase
      .from('members')
      .select('id, tenant_id, name')
      .ilike('email', email)
      .eq('status', 'invited')
      .is('used_at', null)
      .maybeSingle()

    if (findErr) {
      console.error('[members] linkInvitedMember — EXIT: email find query failed', {
        clerkId,
        email,
        error: findErr.message,
      })
      return false
    }

    if (emailRow) {
      console.log('[members] linkInvitedMember — found invited row via email', {
        clerkId,
        memberId: emailRow.id,
        tenantId: emailRow.tenant_id,
      })
      invitedRow = emailRow as { id: string; tenant_id: string; name: string | null }
    }
  }

  if (!invitedRow) {
    console.log('[members] linkInvitedMember — EXIT: no matching invited row (no invite, email mismatch, or token used)', {
      clerkId,
      email,
      hadToken: !!token,
    })
    return false
  }

  const memberId = invitedRow.id
  const tenantId = invitedRow.tenant_id
  console.log('[members] linkInvitedMember — stamping invited row', { clerkId, memberId, tenantId })

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('members')
    .update({
      clerk_id: clerkId,
      user_id: userId,
      status: 'active',
      source: 'invite',
      used_at: now,
      updated_at: now,
      // Fill-only-when-null is deliberate (PRs #368/#371) and stricter than the
      // shared invariant requires — it never overwrites, so it can never delete.
      // identityValue here just stops a whitespace-only Clerk name being written.
      ...(identityValue(name) && !invitedRow.name ? { name: identityValue(name) } : {}),
    })
    .eq('id', memberId)

  if (updateErr) {
    console.error('[members] linkInvitedMember — EXIT: update failed', {
      clerkId,
      memberId,
      error: updateErr.message,
    })
    void logEvent({
      action: AuditAction.MEMBER_LINK_UPDATE_FAILED,
      clerk_user_id: clerkId,
      target_type: 'member',
      target_id: memberId,
      outcome: 'failure',
      metadata: { error: updateErr.message, pg_code: updateErr.code },
    })
    return false
  }

  console.log('[members] linkInvitedMember — SUCCESS: stamped invited row', {
    clerk_id: clerkId,
    member_id: memberId,
    tenant_id: tenantId,
    lookup_method: token && invitedRow ? 'token' : 'email',
  })
  return true
}

/**
 * Accepts an invite by token after the user has signed up via Clerk.
 *
 * Sequence:
 * 1. Find the invited members row by token (must be unused).
 * 2. Guard against cross-tenant acceptance.
 * 3. Delete the orphan active row that syncMember may have inserted (the
 *    Clerk webhook upserts on clerk_id conflict; the invited row has
 *    clerk_id=null so no conflict fires and a second row is created).
 * 4. Stamp the original invited row with clerk_id, user_id, status='active',
 *    source='invite', used_at.
 */
export async function acceptInvite(
  token: string,
  clerkUserId: string,
  supabaseUserId: string,
  /** From Clerk's firstName + lastName (same derivation as
   *  linkInvitedMember's/acceptStoryInvite's trailing `name` param) —
   *  null/undefined when Clerk has no name on file. Fallback only: the
   *  orphan-rescue below (rescuedName) reflects a name the visitor actually
   *  typed into the OTP form and wins when both are available. Closes the
   *  race this function used to depend on rescuedName alone to survive —
   *  see Design Handovers/heirloom-signup-signin-fixes-proposal.md §2. */
  name?: string | null,
): Promise<MembersResult<{ memberId: string }>> {
  console.log('[acceptInvite] entry', {
    clerkUserId,
    token: token.slice(0, 8) + '…',
    supabaseUserId,
  })

  if (!token || !clerkUserId || !supabaseUserId) {
    console.error('[acceptInvite] missing required parameters', {
      hasToken: !!token,
      hasClerkUserId: !!clerkUserId,
      hasSupabaseUserId: !!supabaseUserId,
    })
    return { ok: false, status: 400, error: 'Missing required parameters' }
  }

  const supabase = getAdminClient()

  // Step 1: find the invited row. Excludes revoked invites — a revoked token
  // is dead everywhere, not just at the /invite/[token] redirect.
  const { data: invitedRow, error: findErr } = await supabase
    .from('members')
    .select('id, tenant_id, name')
    .eq('token', token)
    .is('used_at', null)
    .is('revoked_at', null)
    .maybeSingle()

  if (findErr) {
    console.error('[acceptInvite] step 1 find failed', { clerkUserId, error: findErr.message })
    return { ok: false, status: 500, error: findErr.message }
  }

  if (!invitedRow) {
    console.warn('[acceptInvite] step 1 token not found or already used', {
      clerkUserId,
      token: token.slice(0, 8) + '…',
    })
    return { ok: false, status: 404, error: 'Invalid or already used token' }
  }

  const row = invitedRow as { id: string; tenant_id: string; name: string | null }
  console.log('[acceptInvite] step 1 invited row found', {
    memberId: row.id,
    tenantId: row.tenant_id,
    clerkUserId,
  })

  // Step 2: cross-tenant guard.
  if (row.tenant_id !== HEIRLOOM_TENANT_ID) {
    console.error('[acceptInvite] step 2 cross-tenant attempt rejected', {
      tenantId: row.tenant_id,
      clerkUserId,
    })
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  // Step 3: delete any orphan row syncMember inserted for this clerk_id
  // (clerk_id was null on the invited row → no conflict → new active row).
  // Selecting `name` alongside `id` lets us rescue it below: /api/members/sync
  // can independently write a real `name` onto that orphan row (it races
  // acceptInvite off the same Clerk session-activation event, no ordering
  // guaranteed), and the invited row being stamped in step 4 never has one.
  const { data: orphanRows, error: orphanErr } = await supabase
    .from('members')
    .delete()
    .eq('clerk_id', clerkUserId)
    .eq('tenant_id', row.tenant_id)
    .neq('id', row.id)
    .select('id, name')

  // Rescued from a single deleted orphan's `name` when the invited row
  // doesn't already have one — see step 3 comment above. Left undefined
  // (not included in the step 4 update payload) for every other case:
  // zero orphans, more than one, or the orphan's name is also null.
  let rescuedName: string | undefined

  if (orphanErr) {
    console.error('[acceptInvite] step 3 orphan delete failed (non-fatal)', {
      clerkUserId,
      error: orphanErr.message,
    })
    void logEvent({
      action: AuditAction.MEMBER_ORPHAN_CLEANUP_FAILED,
      clerk_user_id: clerkUserId,
      target_type: 'member',
      target_id: row.id,
      outcome: 'failure',
      metadata: { error: orphanErr.message },
    })
    // Non-fatal: attempt to stamp the invited row anyway. The unique constraint
    // on clerk_id will surface a real error if the orphan remains.
  } else {
    const deletedRows = (orphanRows ?? []) as { id: string; name: string | null }[]
    const deletedCount = deletedRows.length
    console.log('[acceptInvite] step 3 orphan delete attempted', { clerkUserId, memberId: row.id, deletedCount })
    if (deletedCount > 0) {
      // A syncMember-created orphan actually existed — confirms the
      // linkInvitedMember/syncMember race described in Known Gaps.md fired
      // and was reconciled here rather than left as a stuck user_id-null row.
      void logEvent({
        action: AuditAction.MEMBER_ORPHAN_RECONCILED,
        clerk_user_id: clerkUserId,
        target_type: 'member',
        target_id: row.id,
        metadata: { deleted_count: deletedCount },
      })
    }
    if (deletedCount === 1 && deletedRows[0].name && !row.name) {
      rescuedName = deletedRows[0].name
      console.log('[acceptInvite] step 3 rescuing orphan name', { memberId: row.id, name: rescuedName })
    }
  }

  // Step 4: stamp the original invited row.
  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('members')
    .update({
      clerk_id: clerkUserId,
      user_id: supabaseUserId,
      status: 'active',
      source: 'invite',
      used_at: now,
      updated_at: now,
      ...(!row.name && identityValue(rescuedName ?? name)
        ? { name: identityValue(rescuedName ?? name) }
        : {}),
    })
    .eq('id', row.id)

  if (updateErr) {
    console.error('[acceptInvite] step 4 stamp failed', {
      memberId: row.id,
      clerkUserId,
      error: updateErr.message,
    })
    return { ok: false, status: 500, error: updateErr.message }
  }

  console.log('[acceptInvite] step 4 accepted', {
    memberId: row.id,
    clerkUserId,
    supabaseUserId,
    usedAt: now,
  })
  void logEvent({
    action: AuditAction.MEMBER_INVITE_ACCEPTED,
    tenant_id: row.tenant_id,
    actor_id: supabaseUserId,
    actor_type: 'user',
    clerk_user_id: clerkUserId,
    target_type: 'member',
    target_id: row.id,
  })
  return { ok: true, data: { memberId: row.id } }
}

/**
 * Hard-deletes a user row. The DB cascade removes dependent members /
 * chat_sessions rows. Writes an audit record before deleting (so the audit
 * row is never orphaned), then removes the Clerk identity (non-fatal — a
 * Clerk-already-deleted user should not block Supabase cleanup).
 */
export async function hardDeleteMember(
  userId: string,
  actorId: string | null,
  tenantId: string | null,
  reason?: string | null,
): Promise<MembersResult<{ id: string }>> {
  console.log('[hardDeleteMember] starting', { userId, actorId, reason })

  const supabase = getAdminClient()

  // Look up clerk_id before any deletes so we can remove the Clerk identity.
  const { data: userRow, error: lookupErr } = await supabase
    .from('users')
    .select('clerk_id')
    .eq('id', userId)
    .maybeSingle()

  if (lookupErr) {
    console.error('[members] hardDeleteMember — clerk_id lookup failed:', lookupErr.message)
  }

  const clerkId = (userRow as { clerk_id?: string | null } | null)?.clerk_id ?? null
  console.log('[hardDeleteMember] resolved clerk_id', { userId, clerkId: clerkId ?? 'null — no Clerk user' })

  // Write audit before delete so the record survives the cascade.
  void logEvent({
    action: AuditAction.MEMBER_HARD_DELETED,
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'user',
    target_id: userId,
    metadata: {
      reason_type: 'admin_hard_delete',
      ...(reason ? { reason } : {}),
    },
  })

  // Delete Clerk identity before Supabase row (Clerk is the source of truth for
  // authentication — remove it first so no sign-in is possible during the window).
  if (clerkId) {
    console.log('[hardDeleteMember] calling Clerk deleteUser', { clerkId })
    try {
      await deleteClerkUser(clerkId)
      console.log('[hardDeleteMember] Clerk deleteUser succeeded', { clerkId })
    } catch (err) {
      // Non-fatal: log and continue. The Supabase row deletion is still correct
      // even if Clerk deletion fails (e.g. user already deleted in Clerk dashboard).
      console.error('[hardDeleteMember] Clerk deleteUser failed — proceeding with Supabase delete', {
        clerkId,
        error: err instanceof Error ? err.message : err,
      })
    }
  }

  console.log('[hardDeleteMember] deleting Supabase users row', { userId })
  const { error } = await supabase.from('users').delete().eq('id', userId)

  if (error) {
    console.error('[hardDeleteMember] Supabase delete failed', { userId, error })
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[hardDeleteMember] Supabase users row deleted', { userId })
  return { ok: true, data: { id: userId } }
}
