import { NextRequest } from 'next/server'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

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

  let body: { status?: string; body?: string; order?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: {
    status?: BlockStatus
    body?: string
    active?: boolean
    order?: number
    updated_by?: string
  } = {}

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

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 })
  }

  // Stamp updated_by on every real write. updated_at is auto-set by
  // the blocks_updated_at_trigger Postgres trigger — no client write.
  updates.updated_by = authCtx.owner_id

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('blocks')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', authCtx.tenant_id)
    .select('id, title, type, body, status, is_default, created_at')
    .single()

  if (error) {
    console.error('[blocks/patch] update failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
