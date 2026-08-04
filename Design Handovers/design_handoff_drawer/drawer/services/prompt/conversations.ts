// services/prompt/conversations.ts
//
// Data-access for the Composer conversation-history drawer (handover §3).
// Same shape as services/content/topics.ts: thin, tenant-scoped, returns a
// Result the route maps to a Response. The API routes stay dumb (auth + parse +
// respond); all queries live here.
//
// NOTE ON SHAPE MAPPING: the client `Conversation` type (components/admin/
// prompt-builder/types.ts) uses camelCase + `updatedAt` as epoch ms. The DB is
// snake_case + timestamptz. These functions return the **client shape** so
// page.tsx can `setConversations(data)` with no mapping (it already does).

import { getAdminClient } from '@/services/auth/supabase-admin'

// Reuse the house Result type. services/content/types.ts exports AuthScope +
// ContentResult; import those rather than redeclaring if you prefer.
export interface AuthScope {
  owner_id: string
  tenant_id: string
}
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// What the drawer list needs (no messages — those hydrate on open).
export interface ConversationSummary {
  id: string
  title: string
  preview: string | null
  updatedAt: number
}

// Full row returned when a conversation is opened.
export interface ConversationFull extends ConversationSummary {
  messages: ChatMessage[]
  promptSetId: string | null
}

const toMs = (ts: string | null): number => (ts ? new Date(ts).getTime() : Date.now())

// ── GET /api/admin/conversations — list for the owner, newest first ──────────
export async function listConversations(authCtx: AuthScope): Promise<Result<ConversationSummary[]>> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_conversations')
    .select('id, title, preview, updated_at')
    .eq('tenant_id', authCtx.tenant_id)
    .eq('owner_id', authCtx.owner_id)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[conversations] list failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }
  const rows = (data ?? []).map(r => ({
    id: r.id, title: r.title, preview: r.preview, updatedAt: toMs(r.updated_at),
  }))
  return { ok: true, data: rows }
}

// ── GET /api/admin/conversations/:id — hydrate one (with messages) ───────────
export async function getConversation(authCtx: AuthScope, id: string): Promise<Result<ConversationFull>> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_conversations')
    .select('id, title, preview, messages, prompt_set_id, updated_at')
    .eq('tenant_id', authCtx.tenant_id)
    .eq('owner_id', authCtx.owner_id)   // owner scoping = the access guard
    .eq('id', id)
    .single()

  if (error) {
    console.error('[conversations] get failed:', error.message)
    return { ok: false, status: error.code === 'PGRST116' ? 404 : 500, error: error.message }
  }
  return {
    ok: true,
    data: {
      id: data.id, title: data.title, preview: data.preview,
      messages: (data.messages ?? []) as ChatMessage[],
      promptSetId: data.prompt_set_id, updatedAt: toMs(data.updated_at),
    },
  }
}

export interface UpsertConversationInput {
  title: string
  preview: string | null
  messages: ChatMessage[]
  promptSetId?: string | null
}

// ── POST /api/admin/conversations — create (lazy, on first send) ─────────────
export async function createConversation(authCtx: AuthScope, input: UpsertConversationInput): Promise<Result<ConversationSummary>> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_conversations')
    .insert({
      tenant_id: authCtx.tenant_id,
      owner_id: authCtx.owner_id,
      title: input.title,
      preview: input.preview,
      messages: input.messages,
      prompt_set_id: input.promptSetId ?? null,
    })
    .select('id, title, preview, updated_at')
    .single()

  if (error) {
    console.error('[conversations] create failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true, data: { id: data.id, title: data.title, preview: data.preview, updatedAt: toMs(data.updated_at) } }
}

// ── PATCH /api/admin/conversations/:id — append/replace transcript ───────────
// Simplest correct approach: client sends the full current messages array (the
// page already holds it). updated_at is bumped by the trigger.
export async function updateConversation(authCtx: AuthScope, id: string, input: Partial<UpsertConversationInput>): Promise<Result<ConversationSummary>> {
  const supabase = getAdminClient()
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.preview !== undefined) patch.preview = input.preview
  if (input.messages !== undefined) patch.messages = input.messages
  if (input.promptSetId !== undefined) patch.prompt_set_id = input.promptSetId

  const { data, error } = await supabase
    .from('prompt_conversations')
    .update(patch)
    .eq('tenant_id', authCtx.tenant_id)
    .eq('owner_id', authCtx.owner_id)
    .eq('id', id)
    .select('id, title, preview, updated_at')
    .single()

  if (error) {
    console.error('[conversations] update failed:', error.message)
    return { ok: false, status: error.code === 'PGRST116' ? 404 : 500, error: error.message }
  }
  return { ok: true, data: { id: data.id, title: data.title, preview: data.preview, updatedAt: toMs(data.updated_at) } }
}
