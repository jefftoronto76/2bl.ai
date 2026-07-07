import { NextRequest } from 'next/server'
import { getAuthContext } from '@/services/auth'
import { updateBlock, type BlockUpdate } from '@/services/prompt/blocks'
import { BLOCK_TYPES } from '@/services/prompt/block-types'
import { logEvent, AuditAction } from '@/services/audit'

const VALID_STATUSES = ['active', 'disabled', 'deleted'] as const
type BlockStatus = typeof VALID_STATUSES[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks/patch] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: { status?: string; title?: string; body?: string; order?: number; type?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: BlockUpdate = {}

  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) {
      return Response.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    updates.title = title
  }

  if (typeof body.status === 'string') {
    if (!VALID_STATUSES.includes(body.status as BlockStatus)) {
      return Response.json({ error: 'Invalid status value' }, { status: 400 })
    }
    const status = body.status as BlockStatus
    updates.status = status
    // Keep the legacy active boolean in sync so the Composer context
    // doesn't surface disabled or deleted blocks to the AI.
    updates.active = status === 'active'
  }

  if (typeof body.body === 'string') {
    updates.body = body.body
  }

  if (body.order !== undefined) {
    if (typeof body.order !== 'number' || !Number.isFinite(body.order) || !Number.isInteger(body.order)) {
      return Response.json({ error: 'Invalid order value' }, { status: 400 })
    }
    updates.order = body.order
  }

  if (body.type !== undefined) {
    if (typeof body.type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(body.type)) {
      return Response.json({ error: 'Invalid block type' }, { status: 400 })
    }
    updates.type = body.type
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 })
  }

  const result = await updateBlock(authCtx, id, updates)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  // Derive the most descriptive action: a status=deleted write is a logical delete
  const action =
    updates.status === 'deleted' ? AuditAction.BLOCK_DELETE : AuditAction.BLOCK_UPDATE

  void logEvent({
    action,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'block',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
    changes: { after: updates },
    metadata: {},
  })

  return Response.json(result.data)
}
