import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { validateMemberToken } from '@/services/members'
import { streamChat } from '@/services/chat/server'
import type { ChatMessage, ChatMode } from '@/services/chat/server'
import type { MediaAttachmentInput } from '@/services/chat/server/types'

async function resolveMemberId(
  tenantId: string | null,
  inviteToken: string | null,
): Promise<string | null> {
  if (!tenantId) return null

  const user = await getCurrentUser()
  if (user) {
    const supabase = getAdminClient()
    const { data: memberRow } = await supabase
      .from('members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('clerk_id', user.providerUserId)
      .maybeSingle()
    return (memberRow as { id: string } | null)?.id ?? null
  }

  if (inviteToken) {
    const row = await validateMemberToken(inviteToken)
    if (row && row.tenant_id === tenantId) return row.id
  }

  return null
}

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
    invite_token?: string | null
    prompt_type?: string | null
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

  const inviteToken =
    typeof body.invite_token === 'string' && body.invite_token.length > 0
      ? body.invite_token
      : null

  const memberId = await resolveMemberId(tenantId, inviteToken)

  return streamChat({
    messages,
    mode,
    sessionId: body.session_id ?? null,
    memberId,
    tenant: { tenantId },
    promptType: typeof body.prompt_type === 'string' && body.prompt_type.length > 0
      ? body.prompt_type
      : null,
    mediaItems,
    // Fires when the client disconnects (visitor hits Stop, or the tab
    // closes) — threaded through to streamChat so the actual Anthropic call
    // is cancelled instead of running to completion after nobody is
    // listening. See services/chat/server/stream.ts's abortSignal.
    signal: req.signal,
  })
}
