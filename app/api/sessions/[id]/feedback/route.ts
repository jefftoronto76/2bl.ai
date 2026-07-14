import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { upsertFeedback, listFeedback, resolveMemberId } from '@/services/crm/feedback'

/**
 * GET /api/sessions/[id]/feedback — lists every message_feedback row for a
 * session, tenant-scoped. Backs the thumbs/rating hydration fetch that
 * MessageList (Heirloom) and WidgetShell (jefflougheed) run on mount so a
 * reloaded conversation shows previously-set ratings.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const result = await listFeedback(tenantId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ feedback: result.data })
}

/**
 * POST /api/sessions/[id]/feedback — upserts one message's rating + reason
 * chips + note, keyed on (session_id, message_index). `rating: null` clears
 * the rating (the toggle-off case — re-tapping the active thumb). Public,
 * anonymous-safe (same trust posture as PATCH /api/sessions/[id]): the
 * session must belong to the host-resolved tenant, but there is no Clerk
 * auth requirement — jefflougheed visitors have no members-table identity
 * at all.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { message_index, rating, tags, detail, member_id } = body as {
    message_index?: unknown
    rating?: unknown
    tags?: unknown
    detail?: unknown
    member_id?: unknown
  }

  if (typeof message_index !== 'number' || !Number.isInteger(message_index) || message_index < 0) {
    return NextResponse.json({ error: 'message_index must be a non-negative integer' }, { status: 400 })
  }
  if (rating !== 'up' && rating !== 'down' && rating !== null) {
    return NextResponse.json({ error: "rating must be 'up', 'down', or null" }, { status: 400 })
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some(t => typeof t !== 'string'))) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 })
  }
  if (detail !== undefined && detail !== null && typeof detail !== 'string') {
    return NextResponse.json({ error: 'detail must be a string or null' }, { status: 400 })
  }

  const memberId = await resolveMemberId(tenantId, typeof member_id === 'string' ? member_id : null)

  const result = await upsertFeedback(tenantId, id, {
    messageIndex: message_index,
    rating,
    tags: tags as string[] | undefined,
    detail: detail as string | null | undefined,
    memberId,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
