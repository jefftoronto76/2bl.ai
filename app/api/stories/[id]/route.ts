import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { discardStory, updateStoryDescription } from '@/services/crm/stories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * PATCH /api/stories/[id] — updates a story's description (StoryAdminPanel's
 * one editable field, story-admin-panel 2026-08-13). Body: { description:
 * string }. Same tenant_id + user_id ownership scoping as DELETE below
 * (updateStoryDescription, services/crm/stories.ts) — 404s whether the id
 * doesn't resolve or belongs to someone else, never distinguishing the two.
 * Response is shaped to the client's Story type (id/name/description),
 * matching GET/POST /api/stories's own relabeling.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/[id]] PATCH tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { description } = body as { description?: unknown }
  if (typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }

  const result = await updateStoryDescription(tenantId, userId, id, description.trim())
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.STORY_DESCRIPTION_UPDATED,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: 'user',
    target_type: 'story',
    target_id: id,
    outcome: 'success',
  })

  return NextResponse.json({
    story: {
      id: result.data.id,
      name: result.data.title,
      description: result.data.body || undefined,
    },
  })
}

/**
 * DELETE /api/stories/[id] — soft-deletes a story (discardStory,
 * services/crm/stories.ts — stamps discarded_at, same convention
 * discardMemory already uses on this same artifacts table). Requires a
 * signed-in account: a story is scoped to tenant_id + user_id (not
 * session_id — a story has none), so there's no anonymous-caller shape to
 * support here the way memories' session-scoped writes have.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/[id]] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const result = await discardStory(tenantId, userId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.STORY_DISCARDED,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: 'user',
    target_type: 'story',
    target_id: id,
    outcome: 'success',
  })

  return NextResponse.json({ ok: true })
}
