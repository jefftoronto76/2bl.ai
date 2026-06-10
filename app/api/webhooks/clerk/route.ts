import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { logAuthEvent } from '@/services/audit'
import { AuthEventType } from '@/services/audit/types'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { findUserByClerkId } from '@/services/auth/findUserByClerkId'
import { syncMember, HEIRLOOM_TENANT_ID } from '@/services/auth/sync-member'

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

  // Log to auth_events for event types that have a mapped auth event type
  if (mappedType) {
    await logAuthEvent({
      event_type: mappedType,
      clerk_user_id: clerkUserId,
      email,
      outcome: 'success',
      correlation_id: correlationId,
      svix_event_id: svixId,
      metadata: { clerk_event_type: eventType },
    })
  }

  if ((eventType === 'user.created' || eventType === 'user.updated') && clerkUserId) {
    const supabase = getAdminClient()

    // Upsert users row — creates on user.created, updates on user.updated
    const usersPayload: Record<string, unknown> = {
      clerk_id: clerkUserId,
    }
    if (name != null) usersPayload.name = name
    if (email != null) usersPayload.email = email
    if (phone != null) usersPayload.phone = phone

    const { error: usersErr } = await supabase
      .from('users')
      .upsert(usersPayload, { onConflict: 'clerk_id' })

    if (usersErr) {
      console.error('[webhook/clerk] users upsert failed:', usersErr.message)
    }

    // Upsert members row for Heirloom tenant
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

  if (eventType === 'user.deleted' && clerkUserId) {
    const supabase = getAdminClient()
    const user = await findUserByClerkId(clerkUserId)
    if (user) {
      const now = new Date().toISOString()
      const [usersResult, membersResult] = await Promise.all([
        supabase.from('users').update({ deleted_at: now }).eq('id', user.id),
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
