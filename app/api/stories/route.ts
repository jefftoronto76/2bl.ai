import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { listStories, createDraftStory } from '@/services/crm/stories'
import { resolveMemberId } from '@/services/crm/feedback'

interface StoryResponse {
  id: string
  name: string
  description?: string
}

function toStoryResponse(story: { id: string; title: string; body: string }): StoryResponse {
  return {
    id: story.id,
    name: story.title,
    description: story.body || undefined,
  }
}

/**
 * GET /api/stories — the signed-in user's stories for this tenant, oldest
 * first. Anonymous requests (no Clerk session) or unresolvable tenants
 * return an empty list rather than an error, mirroring GET /api/sessions's
 * resilient-empty posture — a story has no session to scope by, so this
 * resolves userId directly via getCurrentUserId (same as GET /api/sessions),
 * not the resolveMemberId roundabout POST below uses for creation.
 */
export async function GET(req: Request) {
  const tenantId = await getTenantFromRequest(req)
  const userId = tenantId ? await getCurrentUserId() : null
  if (!tenantId || !userId) {
    return NextResponse.json({ stories: [] })
  }

  const result = await listStories(tenantId, userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ stories: result.data.map(toStoryResponse) })
}

/**
 * POST /api/stories — { name, description } from BeginStoryModal. name maps
 * to artifacts.title, description to artifacts.body (defaults to '', never
 * null). No media_item_id/anchor concept here — createDraftStory
 * (services/crm/stories.ts) is the sole creation path.
 */
export async function POST(req: Request) {
  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, description, member_id } = body as {
    name?: unknown
    description?: unknown
    member_id?: unknown
  }

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (description !== undefined && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }

  const memberId = await resolveMemberId(tenantId, typeof member_id === 'string' ? member_id : null)

  const result = await createDraftStory(tenantId, {
    memberId,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : '',
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ story: toStoryResponse(result.data) })
}
