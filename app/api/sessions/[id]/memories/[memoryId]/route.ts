import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { publishMemory, discardMemory } from '@/services/crm/memories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

/**
 * PATCH /api/sessions/[id]/memories/[memoryId] — the two decisions available
 * on a draft card: { action: 'keep' } publishes it, { action: 'discard' }
 * soft-discards it. Tenant + session scoped, same anonymous-safe trust
 * posture as the sibling feedback/memories routes.
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

  const { action } = body as { action?: unknown }
  if (action !== 'keep' && action !== 'discard') {
    return NextResponse.json({ error: "action must be 'keep' or 'discard'" }, { status: 400 })
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
