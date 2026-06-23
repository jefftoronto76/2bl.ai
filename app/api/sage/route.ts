import { getTenantFromRequest } from '@/services/auth'
import { streamChat } from '@/services/chat/server'
import type { ChatMessage, ChatMode } from '@/services/chat/server'
import type { MediaAttachmentInput } from '@/services/chat/server/types'

// Thin HTTP adapter over the chat service (services/chat/server). Owns only
// the HTTP concerns: the ANTHROPIC_API_KEY guard, host→tenant resolution, and
// JSON body parsing. All streaming, prompt assembly, booking injection, and
// session lifecycle live in the service. The wire format (Vercel AI SDK data
// stream) is unchanged — /api/sage stays frozen.
export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY is not configured', { status: 500 })
  }

  const tenantId = await getTenantFromRequest(req)
  console.log('[sage/route] resolved tenant_id:', tenantId)

  let body: {
    messages: { role: string; content: string }[]
    mode?: string | null
    session_id?: string | null
    member_id?: string | null
    media_items?: { mediaItemId: string; type: string; filename: string }[] | null
  }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const messages: ChatMessage[] = body.messages.map(m => ({
    role: m.role as ChatMessage['role'],
    content: m.content,
  }))
  const mode: ChatMode = body.mode === 'question' ? 'question' : null

  const mediaItems: MediaAttachmentInput[] | null =
    Array.isArray(body.media_items) && body.media_items.length > 0
      ? (body.media_items as MediaAttachmentInput[])
      : null

  return streamChat({
    messages,
    mode,
    sessionId: body.session_id ?? null,
    memberId: typeof body.member_id === 'string' && body.member_id.length > 0
      ? body.member_id
      : null,
    tenant: { tenantId },
    mediaItems,
  })
}
