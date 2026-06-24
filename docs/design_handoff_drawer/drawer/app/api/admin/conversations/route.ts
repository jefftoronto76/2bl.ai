// app/api/admin/conversations/route.ts
//
// List + create for the Composer conversation drawer (handover §3).
// Thin consumer of services/prompt/conversations.ts — mirrors the shape of
// app/api/admin/topics/route.ts exactly (auth → parse → delegate → map).

import { getAuthContext } from '@/services/auth'
import { listConversations, createConversation } from '@/services/prompt/conversations'
// Optional, if you wire audit like blocks/save does:
// import { logEvent, AuditAction } from '@/services/audit'

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await listConversations(authCtx)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json(result.data)
}

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[conversations] auth failed:', err instanceof Error ? err.message : err)
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

  const result = await createConversation(authCtx, {
    title: body.title?.trim() || 'New conversation',
    preview: body.preview ?? null,
    messages: body.messages ?? [],
    promptSetId: body.promptSetId ?? null,
  })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  // void logEvent({ action: AuditAction.CONVERSATION_CREATE, tenant_id: authCtx.tenant_id,
  //   actor_id: authCtx.owner_id, target_type: 'conversation', target_id: result.data.id })

  return Response.json(result.data)
}
