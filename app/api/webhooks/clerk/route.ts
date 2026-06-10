import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { logAuthEvent } from '@/services/audit'
import { AuthEventType } from '@/services/audit/types'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { findUserByClerkId } from '@/services/auth/findUserByClerkId'

// Clerk event types we care about → auth_events rows
const EVENT_TYPE_MAP: Record<string, AuthEventType | null> = {
  'user.created': AuthEventType.SIGN_UP,
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

  const mappedType = EVENT_TYPE_MAP[eventType]

  // Acknowledge unmapped event types without logging — stops Clerk from retrying
  if (!mappedType) {
    return NextResponse.json({ received: true })
  }

  const correlationId = headersList.get('x-correlation-id')

  // Extract fields from Clerk's payload shape — user vs. session events differ
  const clerkUserId =
    (data.user_id as string | undefined) ??
    (data.id as string | undefined) ??
    null

  const email =
    ((data.email_addresses as Array<{ email_address: string }> | undefined)?.[0]
      ?.email_address) ?? null

  await logAuthEvent({
    event_type: mappedType,
    clerk_user_id: clerkUserId,
    email,
    outcome: 'success',
    correlation_id: correlationId,
    svix_event_id: svixId,
    metadata: { clerk_event_type: eventType },
  })

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
