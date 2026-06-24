// app/api/admin/conversations/[id]/route.ts
//
// Hydrate one conversation (GET) and append/rename (PATCH) for the Composer
// drawer. Same auth/parse/delegate pattern as the sibling routes.

import { getAuthContext } from '@/services/auth'
import { getConversation, updateConversation, deleteConversation } from '@/services/prompt/conversations'
import { logEvent, AuditAction } from '@/services/audit'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations/:id] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const result = await getConversation(authCtx, id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json(result.data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations/:id] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  let body: {
    title?: string
    preview?: string | null
    messages?: { role: 'user' | 'assistant'; content: string; timestamp: number }[]
    promptSetId?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await updateConversation(authCtx, id, {
    title: body.title,
    preview: body.preview,
    messages: body.messages,
    promptSetId: body.promptSetId,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.CONVERSATION_UPDATE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'conversation',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
  })

  return Response.json(result.data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations/:id] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const result = await deleteConversation(authCtx, id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json(result.data)
}
