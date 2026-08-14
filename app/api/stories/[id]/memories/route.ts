import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { getMemoriesForStory } from '@/services/crm/story-containments'

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
