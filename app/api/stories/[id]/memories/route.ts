import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { getMemoriesForStory, moveMemoryInStory } from '@/services/crm/story-containments'

/**
 * GET /api/stories/[id]/memories — a story's memories in display order
 * (real-story-view-1a-static-list). Backs StoryView.tsx (components/shells/
 * membership/v2/StoryView.tsx), the first real "open a story and see its
 * memories" surface. Requires a signed-in account, same as PATCH/DELETE
 * /api/stories/[id] — access is owned-OR-subscribed (getMemoriesForStory's
 * own hasStoryAccess check), not owner-only, since a collaborator invited
 * into a story should be able to view it too.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/[id]/memories] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const result = await getMemoriesForStory(tenantId, userId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ memories: result.data })
}

/**
 * PATCH /api/stories/[id]/memories — { memoryId, direction: 'up' | 'down' }.
 * Moves one memory up or down in the story's ordered list
 * (real-story-view-1c-reorder). A plain two-field body, not this codebase's
 * PATCH-with-action-string convention (PATCH /api/sessions/[id]/memories/
 * [memoryId] etc.) — that convention exists to multiplex several distinct
 * actions onto one route; this route has exactly one PATCH-able operation,
 * so an action string would be a layer of indirection with nothing to
 * dispatch on. Requires a signed-in account (unlike GET above, which only
 * needs one to compute per-caller ownership/subscription state) — this is a
 * real write against a story the caller owns or is subscribed to, not
 * something session-id-alone should ever gate the way the anonymous-safe
 * memory actions on PATCH /api/sessions/[id]/memories/[memoryId] are (see
 * that route's own doc comment) — moveMemoryInStory's own access check
 * (owned-OR-subscribed, via getMemoriesForStory) still applies on top of
 * this sign-in requirement, same as assign_story's shape on that route.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/[id]/memories] PATCH tenant resolution failed for host:', req.headers.get('host'))
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

  const { memoryId, direction } = body as { memoryId?: unknown; direction?: unknown }
  if (typeof memoryId !== 'string' || !memoryId.trim()) {
    return NextResponse.json({ error: 'memoryId is required' }, { status: 400 })
  }
  if (direction !== 'up' && direction !== 'down') {
    return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 400 })
  }

  const result = await moveMemoryInStory(tenantId, userId, id, memoryId, direction)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
