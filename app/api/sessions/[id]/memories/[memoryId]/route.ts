import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId } from '@/services/auth'
import { publishMemory, discardMemory, renameMemory, reviseMemoryBlocks } from '@/services/crm/memories'
import { assignMemoryToStory } from '@/services/crm/story-containments'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * PATCH /api/sessions/[id]/memories/[memoryId] — five actions on a memory:
 * { action: 'keep' } publishes it, { action: 'discard' } soft-discards it,
 * { action: 'retitle', title } corrects its title (the inline edit
 * affordance on MemoryCard/MemorySavedReceipt — works regardless of
 * draft/published status), { action: 'revise_blocks', blocks } replaces the
 * panel's block canvas (Memory Canvas V1 — validation, media_item_id
 * resolution, and audit logging all live in reviseMemoryBlocks itself, same
 * placement as createMemoryFromAnchor's, so this route just forwards the raw
 * `blocks` value and relays the result), { action: 'assign_story', story_id }
 * assigns the memory to a story (MemoryCardView's "+" via StoryPicker —
 * assign-memory-to-story, 2026-08-13). The first four stay anonymous-safe,
 * session-scoped only, matching the sibling feedback/memories routes'
 * trust posture; assign_story is the one action that requires a signed-in
 * account (a story belongs to a member, not a session) — same 401 shape
 * PATCH /api/stories/[id] already uses for its own account requirement.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memoryId: string }> },
) {
  const { id, memoryId } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/memories/[memoryId]] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { action, title, blocks, story_id: storyId } = body as {
    action?: unknown
    title?: unknown
    blocks?: unknown
    story_id?: unknown
  }
  if (action !== 'keep' && action !== 'discard' && action !== 'retitle' && action !== 'revise_blocks' && action !== 'assign_story') {
    return NextResponse.json(
      { error: "action must be 'keep', 'discard', 'retitle', 'revise_blocks', or 'assign_story'" },
      { status: 400 },
    )
  }

  if (action === 'assign_story') {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    if (typeof storyId !== 'string' || !storyId.trim()) {
      return NextResponse.json({ error: 'story_id is required' }, { status: 400 })
    }
    const result = await assignMemoryToStory(tenantId, userId, memoryId, storyId.trim())
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  }

  if (action === 'retitle') {
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    const result = await renameMemory(tenantId, id, memoryId, title.trim())
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ memory: result.data })
  }

  if (action === 'revise_blocks') {
    const result = await reviseMemoryBlocks(tenantId, id, memoryId, blocks)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ memory: result.data })
  }

  if (action === 'keep') {
    const result = await publishMemory(tenantId, id, memoryId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    void logEvent({
      action: AuditAction.MEMORY_KEPT,
      tenant_id: tenantId,
      target_type: 'memory',
      target_id: memoryId,
    })
    return NextResponse.json({ memory: result.data })
  }

  const result = await discardMemory(tenantId, id, memoryId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  void logEvent({
    action: AuditAction.MEMORY_DISCARDED,
    tenant_id: tenantId,
    target_type: 'memory',
    target_id: memoryId,
  })
  return NextResponse.json({ ok: true })
}
