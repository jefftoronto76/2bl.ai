import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { listMemories, deleteMemoriesForAnchors, createMemoryFromAnchor, type MemorySourceKind } from '@/services/crm/memories'
import { resolveMemberId } from '@/services/crm/feedback'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

const VALID_SOURCE_KINDS: readonly MemorySourceKind[] = ['conversation', 'photo', 'video', 'audio', 'document']

/**
 * GET /api/sessions/[id]/memories — lists every non-discarded memory for a
 * session, tenant-scoped. Backs the fetch-on-mount hydration the memories
 * hook runs, mirroring GET .../feedback exactly.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/memories] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const result = await listMemories(tenantId, id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ memories: result.data })
}

/**
 * POST /api/sessions/[id]/memories — { anchor_message_id, source_kind }, the
 * manual bookmark or the [SAVE_MEMORY] marker. No model call — reads the
 * anchor message's own content verbatim via createMemoryFromAnchor
 * (services/crm/memories.ts). Not cancellable in v1 (accepted from the
 * original design spec).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/memories] tenant resolution failed for host:', req.headers.get('host'))
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'tenant_resolution_failed', host: req.headers.get('host') },
    })
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'invalid_request_body' },
    })
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { anchor_message_id, source_kind, member_id } = body as {
    anchor_message_id?: unknown
    source_kind?: unknown
    member_id?: unknown
  }

  if (typeof anchor_message_id !== 'string' || !anchor_message_id) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'missing_anchor_message_id' },
    })
    return NextResponse.json({ error: 'anchor_message_id is required' }, { status: 400 })
  }
  if (typeof source_kind !== 'string' || !VALID_SOURCE_KINDS.includes(source_kind as MemorySourceKind)) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'invalid_source_kind', source_kind },
    })
    return NextResponse.json({ error: `source_kind must be one of: ${VALID_SOURCE_KINDS.join(', ')}` }, { status: 400 })
  }

  const memberId = await resolveMemberId(tenantId, typeof member_id === 'string' ? member_id : null)

  const result = await createMemoryFromAnchor(tenantId, {
    sessionId: id,
    anchorMessageId: anchor_message_id,
    memberId,
    sourceKind: source_kind as MemorySourceKind,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ memory: result.data })
}

/**
 * DELETE /api/sessions/[id]/memories?messageIds=id1,id2 — hard-deletes every
 * memory anchored to one of the given message ids. Called by the chat engine
 * right after a visitor edits or resends a message truncates the transcript
 * forward from that point — mirrors DELETE .../feedback's role, keyed by
 * message id (the ids truncateAfter dropped) rather than an index cutoff.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/memories] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const messageIdsRaw = searchParams.get('messageIds')
  const messageIds = messageIdsRaw ? messageIdsRaw.split(',').map(s => s.trim()).filter(Boolean) : []

  const result = await deleteMemoriesForAnchors(tenantId, id, messageIds)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
