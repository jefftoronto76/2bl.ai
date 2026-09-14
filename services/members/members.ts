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
import { logSafeIdentity } from '@/services/shared/log-safe'

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
  const supabase = getAdminClient('members_admin')
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
 * The row claim itself (after the lookup above resolves which row) is a
 * single atomic conditional UPDATE, not the lookup's own SELECT followed by
 * an unconditional UPDATE-by-id. This function and acceptInvite
 * (services/members/members.ts) both fire for the same signup event — this
 * one from the Clerk webhook, that one from the client's own accept call —
 * with no ordering guarantee between them (System Docs/Identity System.md
 * §1.3). Folding "is this still claimable" into the UPDATE's own WHERE
 * clause means Postgres's row lock decides which of the two concurrent
 * callers wins, not application code racing a stale read. See Design
 * Handovers/identity_reconciliation_replan_2026-09-14.md for the full design.
 *
 * Also deletes any orphan row syncMember may have created for this clerk_id
 * before this function claims the real invited row — acceptInvite always
 * had this step; this function never did, which is exactly the failure mode
 * its own former doc comment described ("simulates the clerk_id
 * unique-constraint collision race"). Safe unconditionally here (no
 * skipOrphanCleanup escape hatch, unlike acceptInvite): the lookup above can
 * only ever match a row still in status='invited'/used_at IS NULL, so an
 * already-established member's real membership can never be what gets
 * deleted — that ambiguity doesn't arise on this path.
 *
 * Returns true when an invited row was found and stamped BY THIS CALL, or
 * when it was already claimed by a concurrent acceptInvite call for the
 * same row — either way the row is correctly linked. Returns false when no
 * invited row was found at all — caller proceeds with syncMember as normal.
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
    email: logSafeIdentity(email),
    token: token ? token.slice(0, 8) + '…' : null,
  })

  if (!email && !token) {
    console.log('[members] linkInvitedMember — EXIT: no email or token provided')
    return false
  }

  const supabase = getAdminClient('link_invited_member')

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
      email: logSafeIdentity(email),
      error: userErr?.message,
    })
    void logEvent({
      action: AuditAction.MEMBER_USER_RESOLVE_FAILED,
      clerk_user_id: clerkId,
      outcome: 'failure',
      // No users.id/member_id to attribute this to — that's exactly what
      // failed to resolve. clerk_user_id above is the real, non-PII join key
      // an auditor has to trace this row back to a person; email is a
      // logSafeIdentity fingerprint, not the raw value (audit_events is
      // permanent storage, unlike a console log).
      metadata: { stage: 'link_invited_member', email: logSafeIdentity(email), error: userErr?.message ?? 'no row returned' },
    })
    return false
  }

  const userId = (userRow as { id: string }).id
  console.log('[members] linkInvitedMember — resolved users.id', { clerkId, userId })

  // Step 1: token-based lookup (primary). Token is unique — no .ilike needed.
  // This pre-check resolves WHICH row + tenant to target below; it is not
  // itself the claim decision (the atomic UPDATE further down re-checks
  // used_at authoritatively, so a stale snapshot here can't cause an
  // incorrect write — only, at worst, an unnecessary-but-harmless orphan
  // cleanup attempt for a row that turns out to already be claimed).
  let invitedRow: { id: string; tenant_id: string } | null = null

  if (!token) {
    console.log('[members] linkInvitedMember — token lookup skipped (no token provided, will try email)', { clerkId, email: logSafeIdentity(email) })
  }

  if (token) {
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('members')
      .select('id, tenant_id')
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
      invitedRow = tokenRow as { id: string; tenant_id: string }
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
      .select('id, tenant_id')
      .ilike('email', email)
      .eq('status', 'invited')
      .is('used_at', null)
      .maybeSingle()

    if (findErr) {
      console.error('[members] linkInvitedMember — EXIT: email find query failed', {
        clerkId,
        email: logSafeIdentity(email),
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
      invitedRow = emailRow as { id: string; tenant_id: string }
    }
  }

  if (!invitedRow) {
    console.log('[members] linkInvitedMember — EXIT: no matching invited row (no invite, email mismatch, or token used)', {
      clerkId,
      email: logSafeIdentity(email),
      hadToken: !!token,
    })
    return false
  }

  const memberId = invitedRow.id
  const tenantId = invitedRow.tenant_id
  const lookupMethod = token ? 'token' : 'email'

  // Step 3 (symmetric with acceptInvite, new here): delete any other row
  // sharing this clerk_id + tenant — a syncMember-created orphan from the
  // same signup race, safe to remove because the invited row's own clerk_id
  // is still null at this point (it can't be what this delete matches).
  // Shares acceptInvite's own deleteOrphanRows helper (defined below in this
  // file — hoisted, so callable from here) rather than a second copy of the
  // same delete-and-log logic.
  let rescuedName = await deleteOrphanRows(supabase, clerkId, tenantId, memberId)

  console.log('[members] linkInvitedMember — claiming invited row', { clerkId, memberId, tenantId })

  // Step 4: the atomic claim. WHERE id = memberId AND used_at IS NULL,
  // evaluated by Postgres under its own row lock — the authoritative
  // decision, not the pre-check lookup above.
  const claim = async () => {
    const now = new Date().toISOString()
    return supabase
      .from('members')
      .update({
        clerk_id: clerkId,
        user_id: userId,
        status: 'active',
        source: 'invite',
        used_at: now,
        updated_at: now,
      })
      .eq('id', memberId)
      .is('used_at', null)
      .select('id, name')
      .maybeSingle()
  }

  let { data: claimedRow, error: claimErr } = await claim()

  if (claimErr?.code === '23505') {
    // An orphan reappeared in the gap between step 3's delete and this
    // write — the exact window the old unconditional UPDATE's own comment
    // already described as a real failure mode. One bounded retry, same
    // pattern acceptStoryInvite already uses for this error code.
    console.warn('[members] linkInvitedMember — claim hit 23505, retrying orphan cleanup once', { clerkId, memberId })
    const retryRescued = await deleteOrphanRows(supabase, clerkId, tenantId, memberId)
    rescuedName = rescuedName ?? retryRescued
    ;({ data: claimedRow, error: claimErr } = await claim())
  }

  if (claimErr) {
    console.error('[members] linkInvitedMember — EXIT: claim failed', {
      clerkId,
      memberId,
      error: claimErr.message,
    })
    void logEvent({
      action: AuditAction.MEMBER_LINK_UPDATE_FAILED,
      clerk_user_id: clerkId,
      target_type: 'member',
      target_id: memberId,
      outcome: 'failure',
      metadata: { error: claimErr.message, pg_code: claimErr.code },
    })
    return false
  }

  if (!claimedRow) {
    // Zero rows: a concurrent acceptInvite call already claimed this row
    // first. It's linked — just not by this call. Same success outcome.
    console.log('[members] linkInvitedMember — claim matched no rows, already linked by a concurrent call', { clerkId, memberId })
    return true
  }

  const claimed = claimedRow as { id: string; name: string | null }

  // Step 5: fill-only-when-null name, its own small follow-up write.
  // claimed.name reflects the row's name BEFORE step 4 (that UPDATE never
  // touched the column), which is exactly what "was it empty" needs to mean.
  // identityValue on both candidates and on claimed.name itself is what
  // makes a whitespace-only stored name count as absent, same as every
  // other identity write in this codebase — a DB-side `.is('name', null)`
  // guard would miss that case (whitespace isn't SQL NULL) and silently
  // no-op exactly where the JS check said to write. Not re-checking
  // used_at here: this call only runs immediately after this same
  // function's own successful claim, on the row it just claimed.
  const finalName = identityValue(rescuedName) ?? identityValue(name)
  if (!identityValue(claimed.name) && finalName) {
    const { error: nameErr } = await supabase
      .from('members')
      .update({ name: finalName })
      .eq('id', claimed.id)
    if (nameErr) {
      console.error('[members] linkInvitedMember — name fill failed (non-fatal)', { memberId: claimed.id, error: nameErr.message })
    }
  }

  console.log('[members] linkInvitedMember — SUCCESS: stamped invited row', {
    clerk_id: clerkId,
    member_id: memberId,
    tenant_id: tenantId,
    lookup_method: lookupMethod,
  })
  return true
}

type AdminClient = ReturnType<typeof getAdminClient>

/**
 * Deletes any other row sharing this clerk_id + tenant (a syncMember-created
 * orphan from the same signup race — see acceptInvite's own doc comment) and
 * returns a rescued name when exactly one row was deleted and it carried one.
 * Shared by acceptInvite (initial cleanup and its one-shot retry after a
 * 23505 on the claim) and linkInvitedMember (same shape of cleanup, added
 * for symmetry — see that function's own doc comment).
 */
async function deleteOrphanRows(
  supabase: AdminClient,
  clerkUserId: string,
  tenantId: string,
  invitedRowId: string,
): Promise<string | undefined> {
  const { data: orphanRows, error: orphanErr } = await supabase
    .from('members')
    .delete()
    .eq('clerk_id', clerkUserId)
    .eq('tenant_id', tenantId)
    .neq('id', invitedRowId)
    .select('id, name')

  if (orphanErr) {
    console.error('[members] deleteOrphanRows — delete failed (non-fatal)', { clerkUserId, error: orphanErr.message })
    void logEvent({
      action: AuditAction.MEMBER_ORPHAN_CLEANUP_FAILED,
      clerk_user_id: clerkUserId,
      target_type: 'member',
      target_id: invitedRowId,
      outcome: 'failure',
      metadata: { error: orphanErr.message },
    })
    // Non-fatal: the caller attempts the claim anyway. The tenant-scoped
    // clerk_id unique index will surface a real error if the orphan remains.
    return undefined
  }

  const deletedRows = (orphanRows ?? []) as { id: string; name: string | null }[]
  const deletedCount = deletedRows.length
  console.log('[members] deleteOrphanRows — attempted', { clerkUserId, memberId: invitedRowId, deletedCount })
  if (deletedCount > 0) {
    // A syncMember-created orphan actually existed — confirms the
    // linkInvitedMember/syncMember race described in Known Gaps.md fired
    // and was reconciled here rather than left as a stuck user_id-null row.
    void logEvent({
      action: AuditAction.MEMBER_ORPHAN_RECONCILED,
      clerk_user_id: clerkUserId,
      target_type: 'member',
      target_id: invitedRowId,
      metadata: { deleted_count: deletedCount },
    })
  }
  if (deletedCount === 1 && deletedRows[0].name) {
    console.log('[members] deleteOrphanRows — rescuing orphan name', { memberId: invitedRowId, name: logSafeIdentity(deletedRows[0].name) })
    return deletedRows[0].name
  }
  return undefined
}

/**
 * Accepts an invite by token after the user has signed up via Clerk.
 *
 * The row claim (step 3 below) is a single atomic conditional UPDATE, not a
 * prior SELECT followed by an unconditional UPDATE-by-id. This function and
 * the Clerk webhook's linkInvitedMember both fire for the same signup event
 * — this one from the client's own accept call, that one from the webhook —
 * with no ordering guarantee between them (System Docs/Identity System.md
 * §1.3). Folding "is this still claimable" into the UPDATE's own WHERE
 * clause means Postgres's row lock decides which of the two concurrent
 * callers wins, not application code racing a stale read — the actual
 * defect the old unconditional UPDATE's own comment already documented
 * ("the unique constraint on clerk_id will surface a real error if the
 * orphan remains"). See Design Handovers/
 * identity_reconciliation_replan_2026-09-14.md for the full design.
 *
 * Sequence:
 * 1. Cheap existence/tenant pre-check. Gates step 2 (never delete another
 *    clerk_id's row for a garbage or cross-tenant token) and fails fast on
 *    an invalid token — it is NOT the claim decision; step 3 re-checks
 *    authoritatively regardless of whether this snapshot is stale by the
 *    time it's acted on.
 * 2. Delete any orphan active row syncMember may have inserted for this
 *    clerk_id (the invited row's own clerk_id is still null here, so this
 *    can never match the invited row itself). Skipped when skipOrphanCleanup
 *    is set — see that option's own doc comment.
 * 3. Atomic claim: UPDATE ... WHERE token = ? AND tenant_id = ? AND
 *    used_at IS NULL AND revoked_at IS NULL, RETURNING the row. Zero rows
 *    back means a concurrent call (almost always the racing webhook)
 *    already claimed it first — treated as success, not failure, since the
 *    row IS correctly linked. A 23505 (the orphan reappeared in the gap
 *    between step 2 and step 3) gets one bounded retry, same pattern
 *    acceptStoryInvite already uses for this exact error code.
 * 4. Fill-only-when-null name, its own small follow-up write — never inline
 *    in step 3's SET, since step 3's own RETURNING needs to reflect the
 *    PRE-claim name to decide correctly whether a fill is even needed.
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
  options?: {
    /** True when the caller is an already-signed-in visitor (the mount-time
     *  effect added for the "already signed in with a fresh invite link"
     *  gap, chatStore.tsx), not the false→true sign-up transition. Skips
     *  step 2's orphan delete entirely: that delete's premise is "any other
     *  row sharing this clerk_id is a same-request signup-race artifact
     *  syncMember created moments ago" — true only for a brand-new sign-up.
     *  For an already-signed-in visitor, that other row is just as likely
     *  their real, established membership (with its own primer, role, and
     *  subscriptions) — deleting it would silently destroy it. Flagged in
     *  PR #448 review; see the guard below for what runs instead. */
    skipOrphanCleanup?: boolean
  },
): Promise<MembersResult<{ memberId: string }>> {
  console.log('[acceptInvite] entry', {
    clerkUserId,
    token: token.slice(0, 8) + '…',
    supabaseUserId,
    skipOrphanCleanup: options?.skipOrphanCleanup === true,
  })

  if (!token || !clerkUserId || !supabaseUserId) {
    console.error('[acceptInvite] missing required parameters', {
      hasToken: !!token,
      hasClerkUserId: !!clerkUserId,
      hasSupabaseUserId: !!supabaseUserId,
    })
    return { ok: false, status: 400, error: 'Missing required parameters' }
  }

  const supabase = getAdminClient('accept_invite')

  // Step 1: cheap pre-check — same predicate the old single SELECT used, but
  // its result now only gates step 2 below and gives a fast 404/403 for an
  // obviously bad token. Never used to decide the claim itself (step 3).
  const { data: preRow, error: preErr } = await supabase
    .from('members')
    .select('id, tenant_id')
    .eq('token', token)
    .is('used_at', null)
    .is('revoked_at', null)
    .maybeSingle()

  if (preErr) {
    console.error('[acceptInvite] step 1 find failed', { clerkUserId, error: preErr.message })
    return { ok: false, status: 500, error: preErr.message }
  }

  if (!preRow) {
    console.warn('[acceptInvite] step 1 token not found or already used', {
      clerkUserId,
      token: token.slice(0, 8) + '…',
    })
    return { ok: false, status: 404, error: 'Invalid or already used token' }
  }

  const pre = preRow as { id: string; tenant_id: string }
  console.log('[acceptInvite] step 1 invited row found', {
    memberId: pre.id,
    tenantId: pre.tenant_id,
    clerkUserId,
  })

  if (pre.tenant_id !== HEIRLOOM_TENANT_ID) {
    console.error('[acceptInvite] step 1 cross-tenant attempt rejected', {
      tenantId: pre.tenant_id,
      clerkUserId,
    })
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  // Step 2: delete any orphan row syncMember inserted for this clerk_id
  // (clerk_id was null on the invited row → no conflict → new active row).
  // Selecting `name` alongside `id` lets us rescue it below: /api/members/sync
  // can independently write a real `name` onto that orphan row (it races
  // acceptInvite off the same Clerk session-activation event, no ordering
  // guaranteed), and the invited row being claimed in step 3 never has one.
  //
  // Skipped entirely when skipOrphanCleanup is set — see the param's doc
  // comment. Instead: if this clerk_id already owns a different row for this
  // tenant, that row is this visitor's real membership, not an artifact to
  // clean up. Claiming pre.id would violate the tenant-scoped clerk_id
  // unique index regardless, so surface that plainly (no accept, nothing
  // deleted) rather than attempt a destructive delete to make room for it.
  let rescuedName: string | undefined

  if (options?.skipOrphanCleanup) {
    const { data: conflictingRow, error: conflictErr } = await supabase
      .from('members')
      .select('id')
      .eq('clerk_id', clerkUserId)
      .eq('tenant_id', pre.tenant_id)
      .neq('id', pre.id)
      .maybeSingle()

    if (conflictErr) {
      console.error('[acceptInvite] step 2 conflict check failed', { clerkUserId, error: conflictErr.message })
      return { ok: false, status: 500, error: conflictErr.message }
    }
    if (conflictingRow) {
      console.log('[acceptInvite] step 2 skipped: visitor already has a membership for this tenant', {
        clerkUserId,
        existingMemberId: (conflictingRow as { id: string }).id,
      })
      return { ok: false, status: 409, error: 'Already a member' }
    }
  } else {
    rescuedName = await deleteOrphanRows(supabase, clerkUserId, pre.tenant_id, pre.id)
  }

  // Step 3: the atomic claim. Postgres's row lock — not this function's
  // control flow — decides which of two concurrent callers (this one and a
  // racing linkInvitedMember) actually performs the write.
  const claim = async () => {
    const now = new Date().toISOString()
    return supabase
      .from('members')
      .update({
        clerk_id: clerkUserId,
        user_id: supabaseUserId,
        status: 'active',
        source: 'invite',
        used_at: now,
        updated_at: now,
      })
      .eq('token', token)
      .eq('tenant_id', HEIRLOOM_TENANT_ID)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id, name')
      .maybeSingle()
  }

  let { data: claimedRow, error: claimErr } = await claim()

  if (claimErr?.code === '23505') {
    // An orphan reappeared in the gap between step 2's delete and this
    // write — vanishingly rare, but the old code's own comment already
    // acknowledged this exact window. One bounded retry, same pattern
    // acceptStoryInvite already uses for this exact error code.
    console.warn('[acceptInvite] step 3 claim hit 23505, retrying orphan cleanup once', { clerkUserId })
    if (!options?.skipOrphanCleanup) {
      const retryRescued = await deleteOrphanRows(supabase, clerkUserId, pre.tenant_id, pre.id)
      rescuedName = rescuedName ?? retryRescued
    }
    ;({ data: claimedRow, error: claimErr } = await claim())
  }

  if (claimErr) {
    console.error('[acceptInvite] step 3 claim failed', { memberId: pre.id, clerkUserId, error: claimErr.message })
    return { ok: false, status: 500, error: claimErr.message }
  }

  if (!claimedRow) {
    // Zero rows matched the claim's WHERE — someone else (almost always the
    // racing webhook) already claimed this token first, in the gap between
    // step 1's pre-check and this write. The row IS correctly linked; this
    // call just wasn't the one that did it. That is success, not failure —
    // the entire point of making the claim conditional.
    console.log('[acceptInvite] step 3 claim matched no rows — already claimed by a concurrent call', {
      clerkUserId,
      token: token.slice(0, 8) + '…',
    })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_ACCEPTED,
      tenant_id: pre.tenant_id,
      actor_id: supabaseUserId,
      actor_type: 'user',
      clerk_user_id: clerkUserId,
      target_type: 'member',
      target_id: pre.id,
      metadata: { claimed_by_concurrent_call: true },
    })
    return { ok: true, data: { memberId: pre.id } }
  }

  const claimed = claimedRow as { id: string; name: string | null }

  // Step 4: fill-only-when-null name, its own small follow-up write.
  // claimed.name reflects the row's name BEFORE step 3 (that UPDATE never
  // touched the column), which is exactly what "was it empty" needs to mean.
  // Each candidate normalized independently, not `identityValue(rescuedName
  // ?? name)` — `??` treats a whitespace-only rescuedName as present (it's
  // neither null nor undefined) and would block a real Clerk name from ever
  // being used as the fallback. identityValue on claimed.name itself, not a
  // DB-side `.is('name', null)` guard, for the same reason: whitespace isn't
  // SQL NULL, and a DB guard would miss exactly the case the JS check
  // catches. Flagged in PR #448 review (for the equivalent single-statement
  // version this replaces).
  const finalName = identityValue(rescuedName) ?? identityValue(name)
  if (!identityValue(claimed.name) && finalName) {
    const { error: nameErr } = await supabase
      .from('members')
      .update({ name: finalName })
      .eq('id', claimed.id)
    if (nameErr) {
      // Best-effort: the accept itself already succeeded. Log and move on.
      console.error('[acceptInvite] step 4 name fill failed (non-fatal)', { memberId: claimed.id, error: nameErr.message })
    }
  }

  console.log('[acceptInvite] step 3 accepted', {
    memberId: claimed.id,
    clerkUserId,
    supabaseUserId,
  })
  void logEvent({
    action: AuditAction.MEMBER_INVITE_ACCEPTED,
    tenant_id: pre.tenant_id,
    actor_id: supabaseUserId,
    actor_type: 'user',
    clerk_user_id: clerkUserId,
    target_type: 'member',
    target_id: claimed.id,
  })
  return { ok: true, data: { memberId: claimed.id } }
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
