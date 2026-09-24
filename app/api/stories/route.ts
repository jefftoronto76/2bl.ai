import { after, NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { listStories, createStory } from '@/services/crm/stories'
import { resolveMemberId } from '@/services/crm/feedback'
import { createPhaseTimer, AuditAction } from '@/services/audit'

const TIMING_PATH = 'app/api/stories/route.ts'

/**
 * GET /api/stories — the signed-in member's stories for this tenant, newest
 * first. Mirrors GET /api/sessions exactly (services/auth's getCurrentUserId
 * + tenant scoping, empty list for an anonymous/unresolvable-tenant request
 * rather than an error) — a story belongs to a member's whole account, not
 * to one conversation, so it's scoped the way the session list is, not the
 * way a session's own memories are (session_id scoped).
 *
 * Timing instrumentation (2026-09, measurement only): one STORY_ROUTE_TIMING
 * audit event per request, on every return path, with per-phase durations —
 * tenant, auth, then listStories' member, subscriptions, stories, and the
 * parallel enrichment step. Nothing about the handler's behavior changes.
 * See System Docs/Known Gaps.md.
 */
export async function GET(req: Request) {
  const timer = createPhaseTimer()
  const done = (res: NextResponse, rowCount?: number) => {
    // after(): keep the insert alive past the response on serverless.
    after(() => timer.log(AuditAction.STORY_ROUTE_TIMING, { path: TIMING_PATH, method: 'GET', status: res.status, rowCount, tenantId }))
    return res
  }

  const tenantId = await timer.time('tenant', () => getTenantFromRequest(req))
  const userId = tenantId ? await timer.time('auth', () => getCurrentUserId()) : null
  if (!tenantId || !userId) {
    return done(NextResponse.json({ stories: [] }), 0)
  }

  const result = await listStories(tenantId, userId, timer)
  if (!result.ok) {
    return done(NextResponse.json({ error: result.error }, { status: result.status }))
  }

  return done(NextResponse.json({
    stories: result.data.map(s => ({
      id: s.id,
      name: s.title,
      description: s.body || undefined,
      hasActiveInviteOrSubscribers: s.hasActiveInviteOrSubscribers,
      isOwner: s.isOwner,
      memoryCount: s.memoryCount,
      viewMode: s.viewMode,
    })),
  }), result.data.length)
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
      isOwner: result.data.isOwner,
      memoryCount: result.data.memoryCount,
      viewMode: result.data.viewMode,
    },
  })
}
