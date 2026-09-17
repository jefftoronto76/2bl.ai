import { getSession, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { validateMemberToken } from '@/services/members'
import { streamChat } from '@/services/chat/server'
import type { ChatMessage, ChatMode } from '@/services/chat/server'
import type { MediaAttachmentInput } from '@/services/chat/server/types'
import { resolveBlockedTurn, blockedTurnResponse } from '@/services/chat/server/turn-context/blocked-turn'

interface ResolvedMember {
  id: string
  /** members.status as stored — read by the Traffic Cop's account-status rule. */
  status: string | null
}

/**
 * Resolves the member behind this turn, if any: the signed-in Clerk user's
 * members row for this tenant, else the invite-token holder's row, else
 * null (anonymous). Returns the row's status alongside its id so the
 * account-status rule can decide *before* any model call whether this
 * member may chat at all.
 */
async function resolveMember(
  tenantId: string | null,
  inviteToken: string | null,
): Promise<ResolvedMember | null> {
  if (!tenantId) return null

  const user = await getSession()
  if (user) {
    const supabase = getAdminClient()
    const { data: memberRow } = await supabase
      .from('members')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('clerk_id', user.providerUserId)
      .maybeSingle()
    const row = memberRow as { id: string; status: string | null } | null
    return row ? { id: row.id, status: row.status ?? null } : null
  }

  if (inviteToken) {
    const row = await validateMemberToken(inviteToken)
    if (row && row.tenant_id === tenantId) return { id: row.id, status: row.status ?? null }
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

  const member = await resolveMember(tenantId, inviteToken)
  const memberId = member?.id ?? null
  const memberStatus = member?.status ?? null
  const sessionId =
    typeof body.session_id === 'string' && body.session_id.length > 0 ? body.session_id : null

  // Traffic Cop account-status rule: a suspended or deleted member gets a
  // fixed reply from the 'blocked' slot and never reaches streamChat — no
  // prompt assembly, no model call. Active members, invite holders, and
  // anonymous visitors fall through untouched.
  const blocked = await resolveBlockedTurn({
    tenantId,
    sessionId,
    memberId,
    memberStatus,
    messages,
    mode,
    mediaItems,
    correlationId: null,
  })
  if (blocked) return blockedTurnResponse(blocked.text)

  return streamChat({
    messages,
    mode,
    sessionId: body.session_id ?? null,
    memberId,
    memberStatus,
    tenant: { tenantId },
    promptType: typeof body.prompt_type === 'string' && body.prompt_type.length > 0
      ? body.prompt_type
      : null,
    mediaItems,
    // Best-effort fast path only — fires when the client disconnects (Stop,
    // or editMessage/resendMessage's hard-cancel of an in-flight turn) IF
    // this deployment's request pipeline propagates it, which is not
    // guaranteed (middleware reconstructs this request via header-forwarding
    // at the edge→function boundary). The reliable mechanism is
    // streamChat()'s stop_requested_at poll — see services/chat/server/index.ts
    // and System Docs/Utilities/Chat UI.md's "Stop / interrupted-turn protocol".
    signal: req.signal,
  })
}
