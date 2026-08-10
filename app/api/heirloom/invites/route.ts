// POST /api/heirloom/invites
// Member-facing collaborator-invite creation — the sidebar's per-story invite
// icon (SidebarV2.tsx → InviteCollaboratorsModal.tsx). Distinct from
// /api/admin/members/invite and /api/platform/members/invite: those are the
// ADMIN identity boundary (getAuthContext(), tenant_users membership). This
// route is called by a signed-in Heirloom END-CUSTOMER inviting someone to
// their own story, so it resolves identity the way
// /api/heirloom/invites/accept and /api/media/upload-url already do —
// getCurrentUser() for the Clerk session, then a direct `members` lookup by
// clerk_id, not getAuthContext().
//
// No invited_name/email/phone: unlike the admin invite form, this modal is a
// shareable "anyone with this link can join" magic link (InviteCollaboratorsModal
// has no recipient-identity fields) — createMemberInvite already supports a
// fully generic invite when those args are omitted.
//
// story_id: see createMemberInvite's doc comment (services/members/members.ts)
// — there is no `stories` table yet, so this is recorded only in the
// resulting audit event's metadata, not persisted as a real relationship.

import { getCurrentUser, getCurrentUserId } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { createMemberInvite, HEIRLOOM_TENANT_ID } from '@/services/members'
import { logEvent, AuditAction } from '@/services/audit'
import { inviteUrlFor } from '@/app/admin/members/inviteLink'

const PRIMER_MAX_LENGTH = 500

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()

  // Confirm the caller is a real Heirloom member before letting them mint an
  // invite — same strict resolve-then-403 pattern as /api/media/upload-url
  // (no silent fallback the way resolveMemberId's feedback-path helper has).
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', HEIRLOOM_TENANT_ID)
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()

  if (memberErr) {
    console.error('[heirloom/invites] member lookup failed:', memberErr.message)
    return Response.json({ error: 'Could not resolve member record' }, { status: 500 })
  }
  if (!memberRow) {
    console.warn('[heirloom/invites] 403 — no member row for caller', {
      clerkUserId: user.providerUserId,
    })
    return Response.json({ error: 'Member record not found' }, { status: 403 })
  }

  let body: { primer?: unknown; story_id?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // empty body handled below — both fields are optional
  }

  const rawPrimer = typeof body.primer === 'string' ? body.primer.trim().slice(0, PRIMER_MAX_LENGTH) : ''
  const storyId = typeof body.story_id === 'string' && body.story_id.trim().length > 0 ? body.story_id.trim() : null

  const actorId = await getCurrentUserId()

  // Fetch tenant domain + default_primer for invite URL construction and the
  // primer fallback, same as /api/admin/members/invite.
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('domain, default_primer')
    .eq('id', HEIRLOOM_TENANT_ID)
    .maybeSingle()

  if (tenantErr) {
    console.warn('[heirloom/invites] tenant lookup failed (non-fatal):', tenantErr.message)
  }

  const tenantDomain = (tenantRow as { domain: string | null; default_primer?: string | null } | null)?.domain ?? null
  const defaultPrimer = (tenantRow as { domain: string | null; default_primer?: string | null } | null)?.default_primer ?? null
  const resolvedPrimer = rawPrimer.length > 0 ? rawPrimer : defaultPrimer

  console.log('[heirloom/invites] POST entry', {
    clerkUserId: user.providerUserId,
    memberId: memberRow.id,
    hasPrimer: !!(resolvedPrimer && resolvedPrimer.trim()),
    hasStoryId: !!storyId,
  })

  const result = await createMemberInvite(
    HEIRLOOM_TENANT_ID,
    actorId,
    null,
    null,
    null,
    false,
    resolvedPrimer,
    storyId,
  )

  if (!result.ok) {
    console.error('[heirloom/invites] createMemberInvite failed:', result.error, {
      clerkUserId: user.providerUserId,
    })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_CREATED,
      tenant_id: HEIRLOOM_TENANT_ID,
      actor_id: actorId,
      actor_type: 'user',
      outcome: 'failure',
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: result.error },
    })
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { token, memberId } = result.data
  const inviteUrl = tenantDomain ? inviteUrlFor(token, tenantDomain) : null

  console.log('[heirloom/invites] success', {
    clerkUserId: user.providerUserId,
    memberId,
    hasInviteUrl: !!inviteUrl,
  })

  return Response.json({ token, member_id: memberId, invite_url: inviteUrl }, { status: 201 })
}
