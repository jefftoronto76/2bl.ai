// services/auth/sync-member.ts
// Server-only. Upserts a members row for a newly-authenticated Clerk user,
// syncing their contact info (email or phone) from Clerk into the members table.
// Called once post-authentication — idempotent on re-auth.

import { getAdminClient, type IdentitySource } from './supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'
import { setIdentityField, setIdentityEmail, type MemberSource } from '@/services/shared/identity'

export const HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'

export interface SyncMemberInput {
  clerkUserId: string
  /** Defaults to Heirloom tenant. Pass explicitly for multi-tenant use. */
  tenantId?: string
  /** From Clerk's firstName + lastName. Null/empty/absent all mean "no value
   *  supplied" and leave the column untouched — see services/shared/identity.ts. */
  name?: string | null
  /** From Clerk's emailAddresses[0].emailAddress. Same no-value semantics as `name`. */
  email?: string | null
  /** From Clerk's phoneNumbers[0].phoneNumber. Same no-value semantics as `name`. */
  phone?: string | null
  /** Gate 3 attribution — which caller triggered this sync. Defaults to
   *  'sync_member' (this function's own identity) when the caller doesn't
   *  distinguish itself, e.g. /api/members/sync passes 'api_members_sync',
   *  the Clerk webhook passes 'clerk_webhook'. */
  source?: IdentitySource
  /** Gate 3 attribution — threaded through when the caller has one (e.g. an
   *  incoming request's own x-correlation-id header). */
  correlationId?: string | null
  /** members.source (services/shared/identity.ts's MemberSource) — a
   *  completely different concept from `source` above despite the shared
   *  word; see that type's doc comment. Written into the members payload
   *  ONLY when this call turns out to be the row's genuine first creation
   *  (checked below) — never on an update to an existing row, so a
   *  `self_serve_*` value passed here can never clobber an already-correct
   *  `invite`/`story_invite` on someone's ordinary next login. Omit when the
   *  caller has no opinion (e.g. a context where this distinction doesn't
   *  apply) — an existing row's source, or a new row's, both stay untouched
   *  when this is absent. */
  memberSource?: MemberSource
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
  const { clerkUserId, tenantId = HEIRLOOM_TENANT_ID, name, email, phone, source = 'sync_member', correlationId, memberSource } = input
  const supabase = getAdminClient(source, { correlationId })

  // Resolve whether a members row already exists for this clerk_id BEFORE
  // the upsert below, so memberSource can be written only on genuine first
  // creation. This upsert is a blanket .upsert(payload, {onConflict:
  // 'clerk_id'}), reached on every single authentication (including an
  // already-invite-sourced or story_invite-sourced member's completely
  // ordinary next login) — including memberSource unconditionally would
  // silently overwrite an already-correct members.source back to a
  // self_serve_* value the next time that member logs in again.
  const { data: existingMemberRow } = await supabase
    .from('members')
    .select('id')
    .eq('clerk_id', clerkUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const isNewMember = !existingMemberRow

  const usersPayload: Record<string, unknown> = { clerk_id: clerkUserId }
  setIdentityField(usersPayload, 'name', name)
  setIdentityEmail(usersPayload, 'email', email)
  setIdentityField(usersPayload, 'phone', phone)

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
  // caller supplies a real value — null, '' and undefined alike leave the
  // column untouched (services/shared/identity.ts). This is the D1 fix: the
  // previous `if (name !== undefined)` guard treated an explicit `null` as a
  // value to write, so /api/members/sync's `name: null` (sent whenever the
  // name field was empty) upserted NULL over an existing members.name.
  // user_id is always included since it's now always resolved above.
  const payload: Record<string, unknown> = {
    clerk_id: clerkUserId,
    tenant_id: tenantId,
    user_id: userId,
    status: 'active',
    updated_at: new Date().toISOString(),
  }
  setIdentityField(payload, 'name', name)
  setIdentityEmail(payload, 'email', email)
  setIdentityField(payload, 'phone', phone)
  if (isNewMember && memberSource) {
    payload.source = memberSource
  }

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
