// app/api/admin/conversations/[id]/route.ts
//
// Hydrate one conversation (GET) and append/rename (PATCH) for the Composer
// drawer (handover §3). Same auth/parse/delegate pattern as the sibling routes.
// App Router dynamic segment: `params.id`.

import { getAuthContext } from '@/services/auth'
import { getConversation, updateConversation, deleteConversation } from '@/services/prompt/conversations'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations/:id] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await getConversation(authCtx, params.id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json(result.data)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations/:id] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const result = await updateConversation(authCtx, params.id, {
    title: body.title,
    preview: body.preview,
    messages: body.messages,
    promptSetId: body.promptSetId,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json(result.data)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations/:id] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await deleteConversation(authCtx, params.id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json(result.data)
}
