import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { discardStory, updateStoryDescription, updateStoryViewMode } from '@/services/crm/stories'
import type { StoryRow } from '@/services/crm/stories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * PATCH /api/stories/[id] — updates a story's description (StoryAdminPanel's
 * one editable field, story-admin-panel 2026-08-13) and/or its Deck List/
 * Grid view preference (Story Deck & Memory Panel handover, Phase 3,
 * 2026-09). Body: { description?: string, view_mode?: 'list' | 'grid' } —
 * at least one of the two. The two real callers today (StoryAdminPanel's
 * description field, StoryView.tsx's view toggle) only ever send one or the
 * other, never both, but nothing stops a future caller sending both in one
 * request, so both are applied when present rather than picking just one.
 * Same tenant_id + user_id ownership scoping as DELETE below
 * (updateStoryDescription/updateStoryViewMode, services/crm/stories.ts) —
 * 404s whether the id doesn't resolve or belongs to someone else, never
 * distinguishing the two. Response is shaped to the client's Story type
 * (id/name/description/viewMode), matching GET/POST /api/stories's own
 * relabeling.
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

  const { description, view_mode: viewMode } = body as { description?: unknown; view_mode?: unknown }
  if (description === undefined && viewMode === undefined) {
    return NextResponse.json({ error: 'description or view_mode is required' }, { status: 400 })
  }
  if (description !== undefined && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }
  if (viewMode !== undefined && viewMode !== 'list' && viewMode !== 'grid') {
    return NextResponse.json({ error: "view_mode must be 'list' or 'grid'" }, { status: 400 })
  }

  let latest: StoryRow | null = null

  if (typeof description === 'string') {
    const result = await updateStoryDescription(tenantId, userId, id, description.trim())
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    latest = result.data
    void logEvent({
      action: AuditAction.STORY_DESCRIPTION_UPDATED,
      tenant_id: tenantId,
      actor_id: userId,
      actor_type: 'user',
      target_type: 'story',
      target_id: id,
      outcome: 'success',
    })
  }

  if (viewMode === 'list' || viewMode === 'grid') {
    const result = await updateStoryViewMode(tenantId, userId, id, viewMode)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    latest = result.data
    void logEvent({
      action: AuditAction.STORY_VIEW_MODE_UPDATED,
      tenant_id: tenantId,
      actor_id: userId,
      actor_type: 'user',
      target_type: 'story',
      target_id: id,
      outcome: 'success',
      metadata: { view_mode: viewMode },
    })
  }

  if (!latest) {
    // Unreachable: the check above requires description or view_mode to be
    // present, and every valid value for either assigns `latest` before
    // falling through here.
    return NextResponse.json({ error: 'description or view_mode is required' }, { status: 400 })
  }

  return NextResponse.json({
    story: {
      id: latest.id,
      name: latest.title,
      description: latest.body || undefined,
      viewMode: latest.viewMode,
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
