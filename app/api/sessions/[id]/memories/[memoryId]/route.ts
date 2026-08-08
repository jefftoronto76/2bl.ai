import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { publishMemory, discardMemory, renameMemory, reviseMemoryBlocks } from '@/services/crm/memories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * PATCH /api/sessions/[id]/memories/[memoryId] — four actions on a memory:
 * { action: 'keep' } publishes it, { action: 'discard' } soft-discards it,
 * { action: 'retitle', title } corrects its title (the inline edit
 * affordance on MemoryCard/MemorySavedReceipt — works regardless of
 * draft/published status), { action: 'revise_blocks', blocks } replaces the
 * panel's block canvas (Memory Canvas V1 — validation, media_item_id
 * resolution, and audit logging all live in reviseMemoryBlocks itself, same
 * placement as createMemoryFromAnchor's, so this route just forwards the raw
 * `blocks` value and relays the result). Tenant + session scoped, same
 * anonymous-safe trust posture as the sibling feedback/memories routes.
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

  const { action, title, blocks } = body as { action?: unknown; title?: unknown; blocks?: unknown }
  if (action !== 'keep' && action !== 'discard' && action !== 'retitle' && action !== 'revise_blocks') {
    return NextResponse.json({ error: "action must be 'keep', 'discard', 'retitle', or 'revise_blocks'" }, { status: 400 })
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
