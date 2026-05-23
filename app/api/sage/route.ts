import { getTenantFromRequest } from '@/lib/get-tenant-from-request'
import { streamChat } from '@/services/chat/server'
import type { ChatMessage, ChatMode } from '@/services/chat/server'

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

  return streamChat({
    messages,
    mode,
    sessionId: body.session_id ?? null,
    tenant: { tenantId },
  })
}
