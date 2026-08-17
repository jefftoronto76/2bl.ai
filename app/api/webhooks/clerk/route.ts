import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { logAuthEvent } from '@/services/audit'
import { AuthEventType } from '@/services/audit/types'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { findUserByClerkId, getTenantFromRequest, syncMember, HEIRLOOM_TENANT_ID } from '@/services/auth'
import { linkInvitedMember } from '@/services/members'
import { acceptStoryInvite } from '@/services/crm/story-invites'
import { setIdentityField, setIdentityEmail } from '@/services/shared/identity'

// Clerk event types we care about → auth_events rows
const EVENT_TYPE_MAP: Record<string, AuthEventType | null> = {
  'user.created': AuthEventType.SIGN_UP,
  'user.updated': null,
  'user.deleted': AuthEventType.USER_DELETED,
  'session.created': AuthEventType.SESSION_CREATED,
  'session.revoked': AuthEventType.SESSION_REVOKED,
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook/clerk] CLERK_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Read raw body for signature verification — must happen before any parsing
  const rawBody = await req.text()

  const headersList = await headers()
  const svixId = headersList.get('svix-id')
  const svixTimestamp = headersList.get('svix-timestamp')
  const svixSignature = headersList.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  // Verify the signature — rejects replays and tampered payloads
  let payload: Record<string, unknown>
  try {
    const wh = new Webhook(secret)
    payload = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const eventType = payload.type as string
  const data = (payload.data ?? {}) as Record<string, unknown>

  // Acknowledge unmapped event types without logging — stops Clerk from retrying
  if (!(eventType in EVENT_TYPE_MAP)) {
    return NextResponse.json({ received: true })
  }

  const mappedType = EVENT_TYPE_MAP[eventType]
  const correlationId = headersList.get('x-correlation-id')

  // Extract fields from Clerk's payload shape — user vs. session events differ
  const clerkUserId =
    (data.user_id as string | undefined) ??
    (data.id as string | undefined) ??
    null

  const email =
    ((data.email_addresses as Array<{ email_address: string }> | undefined)?.[0]
      ?.email_address) ?? null

  const phone =
    ((data.phone_numbers as Array<{ phone_number: string }> | undefined)?.[0]
      ?.phone_number) ?? null

  const name =
    [data.first_name, data.last_name].filter(Boolean).join(' ') || null

  // Ghost-row guard: a user.created / user.updated payload carrying neither
  // an email nor a phone cannot produce a usable users/members row — creating
  // one leaves an identifier-less ghost (observed from failed sign-up
  // attempts). Skip creation when no users row exists yet; a later
  // user.updated that does carry an identifier passes the guard and
  // self-heals. Existing rows still update (a name-only update is legitimate).
  let ghostGuardSkipped = false
  if (
    (eventType === 'user.created' || eventType === 'user.updated') &&
    clerkUserId &&
    email == null &&
    phone == null
  ) {
    ghostGuardSkipped = (await findUserByClerkId(clerkUserId)) == null
    if (ghostGuardSkipped) {
      console.error(
        `[webhook/clerk] ghost-row guard: skipping users/members upsert for ${eventType} — payload has no email or phone (clerk_user_id: ${clerkUserId})`,
      )
    }
  }

  // Log to auth_events for event types that have a mapped auth event type.
  // Tenant attribution resolves from the webhook endpoint's host (the domain
  // the endpoint is registered under in the Clerk dashboard); null when the
  // host doesn't map to a tenants.domain row.
  if (mappedType) {
    await logAuthEvent({
      event_type: mappedType,
      tenant_id: await getTenantFromRequest(req),
      clerk_user_id: clerkUserId,
      email,
      outcome: 'success',
      correlation_id: correlationId,
      svix_event_id: svixId,
      metadata: {
        clerk_event_type: eventType,
        ...(ghostGuardSkipped && { ghost_guard_skipped: true }),
      },
    })
  }

  if (
    !ghostGuardSkipped &&
    (eventType === 'user.created' || eventType === 'user.updated') &&
    clerkUserId
  ) {
    const supabase = getAdminClient()

    // Upsert users row — creates on user.created, updates on user.updated
    // Same identity rule as every other write path. setIdentityEmail also
    // normalises case here, which it previously did not — this upsert wrote raw
    // case while linkInvitedMember lowercased the same column moments later in
    // the same request.
    const usersPayload: Record<string, unknown> = {
      clerk_id: clerkUserId,
    }
    setIdentityField(usersPayload, 'name', name)
    setIdentityEmail(usersPayload, 'email', email)
    setIdentityField(usersPayload, 'phone', phone)

    const { error: usersErr } = await supabase
      .from('users')
      .upsert(usersPayload, { onConflict: 'clerk_id' })

    if (usersErr) {
      console.error('[webhook/clerk] users upsert failed:', usersErr.message)
    }

    // Extract the invite token written to Clerk unsafeMetadata during sign-up
    // by the custom OTP flow (signUp.update({ unsafeMetadata: { heirloom_invite_token } })).
    const inviteToken =
      ((data.unsafe_metadata as Record<string, unknown> | undefined)
        ?.heirloom_invite_token as string | undefined) ?? null

    if (inviteToken) {
      console.log('[webhook/clerk] heirloom_invite_token present in unsafeMetadata', {
        clerkUserId,
        token: inviteToken.slice(0, 8) + '…',
      })
    } else {
      console.log('[webhook/clerk] heirloom_invite_token absent from unsafeMetadata (non-invite or GateView modal sign-up)', {
        clerkUserId,
        email,
      })
    }

    // Extract the story-invite token written to Clerk unsafeMetadata during
    // sign-up by the story-invite flow (signUp.update({ unsafeMetadata: {
    // heirloom_story_invite_token } })). Mutually exclusive with inviteToken
    // in practice — a visitor arrives via one query param, not both.
    const storyInviteToken =
      ((data.unsafe_metadata as Record<string, unknown> | undefined)
        ?.heirloom_story_invite_token as string | undefined) ?? null

    // When a story-invite token is present, become authoritative for this
    // signup: call the same acceptStoryInvite the client itself calls after
    // sign-up (services/crm/story-invites.ts), so whichever of {webhook,
    // client} runs first performs the correctly-scoped insert (source=
    // 'story_invite', primer copied from the link) and the other is a safe
    // no-op existing-member grant. Without this, the webhook previously
    // always won the race with a generic syncMember upsert that has no
    // concept of story invites — source stayed null and primer was dropped.
    let storyInviteAccepted = false
    if (storyInviteToken) {
      const user = await findUserByClerkId(clerkUserId)
      const result = user
        ? await acceptStoryInvite(storyInviteToken, clerkUserId, user.id, HEIRLOOM_TENANT_ID, name)
        : { ok: false as const, status: 500, error: 'could not resolve users.id after users upsert' }

      if (result.ok) {
        storyInviteAccepted = true
        console.log('[webhook/clerk] story invite accepted by webhook', { clerkUserId })
      } else {
        // Falls through to the linkInvitedMember/syncMember cascade below as
        // a safety net (e.g. token expired/revoked by the time the webhook
        // processed it) — same fallback shape as an absent inviteToken today.
        console.error('[webhook/clerk] story invite accept failed, falling back to syncMember', {
          clerkUserId,
          error: result.error,
        })
      }
    }

    if (storyInviteAccepted) {
      console.log('[webhook/clerk] skipping linkInvitedMember/syncMember — story invite accepted by webhook', {
        clerkUserId,
      })
    } else {
      // Link any pending invited members row to this Clerk user. Primary lookup
      // is by token (when present in unsafeMetadata); email is the fallback.
      // Returns true when an invited row was found and stamped — in that case skip
      // syncMember: the invited row already has the correct clerk_id so the upsert
      // conflict would fire, but avoiding the extra write is cleaner and prevents
      // a race where the upsert could clobber fields (e.g. status='invited'→'active'
      // already set; upsert would write 'active' again which is fine, but source and
      // used_at would not be set by syncMember). When false, no invited row matched
      // and syncMember creates a fresh active row as normal.
      const linked = await linkInvitedMember(clerkUserId, email ?? '', inviteToken, name)

      if (linked) {
        console.log('[webhook/clerk] skipping syncMember — invited row stamped by linkInvitedMember', {
          clerkUserId,
        })
      } else {
        // Upsert members row for Heirloom tenant (non-invite or fallback path)
        const membersResult = await syncMember({
          clerkUserId,
          tenantId: HEIRLOOM_TENANT_ID,
          name: name ?? undefined,
          email: email ?? undefined,
          phone: phone ?? undefined,
        })

        if (!membersResult.ok) {
          console.error('[webhook/clerk] members sync failed:', membersResult.error)
        }
      }
    }
  }

  if (eventType === 'user.deleted' && clerkUserId) {
    const supabase = getAdminClient()
    const user = await findUserByClerkId(clerkUserId)
    if (user) {
      const now = new Date().toISOString()
      const [usersResult, membersResult] = await Promise.all([
        supabase.from('users').update({ deleted_at: now, status: 'deleted' }).eq('id', user.id),
        supabase
          .from('members')
          .update({ status: 'deleted' })
          .eq('clerk_id', clerkUserId),
      ])
      if (usersResult.error) {
        console.error('[webhook/clerk] users soft-delete failed:', usersResult.error.message)
      }
      if (membersResult.error) {
        console.error('[webhook/clerk] members status update failed:', membersResult.error.message)
      }
    }
  }

  return NextResponse.json({ received: true })
}
