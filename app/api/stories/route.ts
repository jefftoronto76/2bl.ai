import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { listStories, createStory } from '@/services/crm/stories'
import { resolveMemberId } from '@/services/crm/feedback'

/**
 * GET /api/stories — the signed-in member's stories for this tenant, newest
 * first. Mirrors GET /api/sessions exactly (services/auth's getCurrentUserId
 * + tenant scoping, empty list for an anonymous/unresolvable-tenant request
 * rather than an error) — a story belongs to a member's whole account, not
 * to one conversation, so it's scoped the way the session list is, not the
 * way a session's own memories are (session_id scoped).
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

  return NextResponse.json({
    stories: result.data.map(s => ({
      id: s.id,
      name: s.title,
      description: s.body || undefined,
      hasActiveInviteOrSubscribers: s.hasActiveInviteOrSubscribers,
    })),
  })
}

/**
 * POST /api/stories — { name, description? }, the "Begin a new story" modal
 * (BeginStoryModal.tsx via ChatHero.tsx's handleCreateStory). name -> title,
 * description -> body (see createStory's own doc comment, services/crm/
 * stories.ts, for why body over metadata). Requires a linked account, same
 * ACCOUNT_REQUIRED_ERROR-shaped 401 createDraftMemory already uses for the
 * same reason (services/crm/memories.ts) — a story is a real, named
 * membership object, not something an anonymous visitor can create.
 *
 * memberId is always server-resolved (resolveMemberId, services/crm/
 * feedback.ts, from the signed-in Clerk session) — no client-supplied
 * member_id accepted here, unlike POST .../memories, since nothing in this
 * flow needs the anonymous-visitor fallback that route supports.
 *
 * Response is shaped to the client's Story type (components/shells/
 * membership/v2/types.ts: id/name/description) rather than the service
 * layer's StoryRow (id/title/body) — the same title/body -> name/description
 * relabeling BeginStoryModal's own props already use.
 */
export async function POST(req: Request) {
  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[stories] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, description } = body as { name?: unknown; description?: unknown }
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (description !== undefined && typeof description !== 'string') {
    return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
  }

  const memberId = await resolveMemberId(tenantId, null)

  const result = await createStory(tenantId, {
    memberId,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : '',
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    story: {
      id: result.data.id,
      name: result.data.title,
      description: result.data.body || undefined,
      hasActiveInviteOrSubscribers: result.data.hasActiveInviteOrSubscribers,
    },
  })
}
