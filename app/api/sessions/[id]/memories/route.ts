import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth'
import { listMemories, deleteMemoriesForAnchors, type MemorySourceKind } from '@/services/crm/memories'
import { resolveMemberId } from '@/services/crm/feedback'
import { runMemoryArchivist } from '@/services/chat/server/memory-archivist'

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
 * POST /api/sessions/[id]/memories — triggers one archivist call. Two modes:
 *  - create: { mode: 'create', anchor_message_id, source_kind } — the manual
 *    bookmark or an accepted inline offer.
 *  - rewrite: { mode: 'rewrite', memory_id, rewrite_note } — re-runs the
 *    archivist against the same anchor with the prior draft as context.
 * Not cancellable in v1 (accepted from the original design spec) — this
 * request runs to completion or failure, no abort wiring.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/[id]/memories] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { mode, anchor_message_id, source_kind, memory_id, rewrite_note, member_id } = body as {
    mode?: unknown
    anchor_message_id?: unknown
    source_kind?: unknown
    memory_id?: unknown
    rewrite_note?: unknown
    member_id?: unknown
  }

  if (mode !== 'create' && mode !== 'rewrite') {
    return NextResponse.json({ error: "mode must be 'create' or 'rewrite'" }, { status: 400 })
  }

  const memberId = await resolveMemberId(tenantId, typeof member_id === 'string' ? member_id : null)

  if (mode === 'create') {
    if (typeof anchor_message_id !== 'string' || !anchor_message_id) {
      return NextResponse.json({ error: 'anchor_message_id is required' }, { status: 400 })
    }
    if (typeof source_kind !== 'string' || !VALID_SOURCE_KINDS.includes(source_kind as MemorySourceKind)) {
      return NextResponse.json({ error: `source_kind must be one of: ${VALID_SOURCE_KINDS.join(', ')}` }, { status: 400 })
    }

    const result = await runMemoryArchivist({
      tenantId,
      sessionId: id,
      memberId,
      anchorMessageId: anchor_message_id,
      sourceKind: source_kind as MemorySourceKind,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, error_type: result.errorType }, { status: result.status })
    }
    return NextResponse.json({ memory: result.memory })
  }

  // mode === 'rewrite'
  if (typeof memory_id !== 'string' || !memory_id) {
    return NextResponse.json({ error: 'memory_id is required' }, { status: 400 })
  }
  if (typeof rewrite_note !== 'string' || !rewrite_note.trim()) {
    return NextResponse.json({ error: 'rewrite_note is required' }, { status: 400 })
  }

  const result = await runMemoryArchivist({
    tenantId,
    sessionId: id,
    memberId,
    memoryId: memory_id,
    rewriteNote: rewrite_note.trim(),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, error_type: result.errorType }, { status: result.status })
  }
  return NextResponse.json({ memory: result.memory })
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
