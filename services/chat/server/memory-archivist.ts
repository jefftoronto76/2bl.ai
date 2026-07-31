// services/chat/server/memory-archivist.ts
//
// The archivist call — a second, distinct model call from the conversational
// guide's own streamed reply (services/chat/server/stream.ts). Not
// cancellable in v1 (accepted from the original design spec). Reuses the
// tenant's resolved model config exactly like the guide's turn does, but
// calls generateText (one-shot, non-streaming) rather than streamText.
//
// Error handling is two mechanisms from one classification, per CLAUDE.md's
// Memories section:
//   1. Durable log — services/audit logEvent(), one row per call attempt,
//      success or failure, latency + outcome + (on failure) the classified
//      type + raw detail. For querying the spread over time.
//   2. Live signal — the classified MemoryErrorType (services/crm/memory-errors.ts)
//      returned to the caller so the route can surface a specific, on-brand
//      message to the visitor in the moment. Not persisted — there is no row
//      to attach it to on failure (see services/crm/memories.ts's module doc).
//
// Both come from the SAME classification, computed once, so the two views of
// one failure can't disagree with each other.

import { generateText } from 'ai'
import { getModelInstance, resolveModelConfig } from './stream'
import { getSessionMessages } from '@/services/crm/sessions'
import {
  createDraftMemory,
  updateDraftMemory,
  getMemory,
  type MemoryRow,
  type MemorySourceKind,
} from '@/services/crm/memories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { MEMORY_ARCHIVIST_SYSTEM, MEMORY_ARCHIVIST_MAX_TOKENS } from '@/services/prompt'
import type { MemoryErrorType } from '@/services/crm/memory-errors'

export type ArchivistResult =
  | { ok: true; memory: MemoryRow }
  | { ok: false; status: number; errorType?: MemoryErrorType; error: string }

interface RunArchivistParams {
  tenantId: string
  sessionId: string
  memberId: string | null
  /** Create mode: the message this memory is being written from. */
  anchorMessageId?: string
  sourceKind?: MemorySourceKind
  /** Rewrite mode: the existing draft being revised, plus the visitor's instruction. */
  memoryId?: string
  rewriteNote?: string
}

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/** Narrows an unknown persisted message to a transcript Turn, or null if malformed. */
function toTurn(raw: unknown): Turn | null {
  const obj = raw as Record<string, unknown>
  if (!obj || (obj.role !== 'user' && obj.role !== 'assistant') || typeof obj.content !== 'string') {
    return null
  }
  return { role: obj.role, content: obj.content }
}

/**
 * Duck-typed classification — deliberately not importing a specific AI SDK
 * error class, since the exact export path varies across `ai` versions and a
 * wrong import would break every archivist call, not just the error path.
 * Mirrors the taxonomy useChatTurn.ts's ChatTurnError already establishes for
 * the guide's own turn (429 -> rate_limited, transport failure -> network),
 * adapted to a direct provider call rather than a fetch to our own API.
 */
function classifyArchivistError(err: unknown): MemoryErrorType {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode
  if (statusCode === 429) return 'rate_limited'
  if (err instanceof TypeError) return 'network'
  const name = (err as { name?: unknown } | null)?.name
  if (name === 'AI_APICallError' && statusCode === undefined) return 'network'
  return 'unknown'
}

/** Extracts {title, passage} from the model's response — defensive, since models wrap JSON in prose more often than you'd like. */
function parseDraft(raw: string): { title: string; passage: string } | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { title?: unknown; passage?: unknown }
    if (typeof parsed.title !== 'string' || !parsed.title.trim()) return null
    if (typeof parsed.passage !== 'string' || !parsed.passage.trim()) return null
    return { title: parsed.title.trim(), passage: parsed.passage.trim() }
  } catch {
    return null
  }
}

function buildPrompt(transcript: Turn[], rewrite?: { note: string; prior: MemoryRow }): string {
  const body = transcript.map(t => (t.role === 'user' ? 'THEM: ' : 'GUIDE: ') + t.content).join('\n\n')
  if (!rewrite) return `${body}\n\nWrite up this memory now.`
  return (
    `${body}\n\nHere is the version you wrote before:\n\nTITLE: ${rewrite.prior.title}\n\n${rewrite.prior.body}` +
    `\n\nRewrite it, following this instruction from them: ${rewrite.note}`
  )
}

/**
 * Runs one archivist call end-to-end: builds the transcript context, calls
 * the model, classifies + logs the outcome, and — only on success — writes
 * the artifacts row (insert for create mode, update-in-place for rewrite).
 */
export async function runMemoryArchivist(params: RunArchivistParams): Promise<ArchivistResult> {
  const { tenantId, sessionId, memberId } = params
  const isRewrite = typeof params.memoryId === 'string'

  const sessionResult = await getSessionMessages(tenantId, sessionId)
  if (!sessionResult.ok) return { ok: false, status: sessionResult.status, error: sessionResult.error }

  const rawMessages = Array.isArray(sessionResult.data.messages) ? sessionResult.data.messages : []

  let transcript: Turn[]
  let anchorMessageId: string
  let sourceKind: MemorySourceKind
  let priorDraft: MemoryRow | null = null

  if (isRewrite) {
    const memoryResult = await getMemory(tenantId, sessionId, params.memoryId as string)
    if (!memoryResult.ok) return { ok: false, status: memoryResult.status, error: memoryResult.error }
    priorDraft = memoryResult.data
    anchorMessageId = priorDraft.anchor_message_id
    sourceKind = priorDraft.source_kind
  } else {
    if (!params.anchorMessageId || !params.sourceKind) {
      return { ok: false, status: 400, error: 'anchor_message_id and source_kind are required' }
    }
    anchorMessageId = params.anchorMessageId
    sourceKind = params.sourceKind
  }

  const anchorIdx = (rawMessages as unknown[]).findIndex(
    m => (m as { id?: unknown } | null)?.id === anchorMessageId,
  )
  if (anchorIdx === -1) {
    return { ok: false, status: 400, error: 'anchor_message_id does not match a message in this session' }
  }
  transcript = (rawMessages as unknown[]).slice(0, anchorIdx + 1).map(toTurn).filter((t): t is Turn => t !== null)

  const config = await resolveModelConfig(tenantId)
  const model = getModelInstance(config.provider, config.chatModel)
  const prompt = buildPrompt(
    transcript,
    isRewrite && priorDraft && params.rewriteNote ? { note: params.rewriteNote, prior: priorDraft } : undefined,
  )

  const startedAt = Date.now()
  let rawText: string
  try {
    const result = await generateText({
      model,
      system: MEMORY_ARCHIVIST_SYSTEM,
      prompt,
      maxTokens: MEMORY_ARCHIVIST_MAX_TOKENS,
    })
    rawText = result.text
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const errorType = classifyArchivistError(err)
    const errorDetail = err instanceof Error ? err.message : String(err)
    void logEvent({
      action: AuditAction.MEMORY_ARCHIVIST_RUN,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      target_id: isRewrite ? (params.memoryId as string) : null,
      outcome: 'failure',
      metadata: { latency_ms: latencyMs, classified_type: errorType, error_detail: errorDetail, mode: isRewrite ? 'rewrite' : 'create' },
    })
    console.error('[memory-archivist] call failed:', errorType, errorDetail)
    return { ok: false, status: 502, errorType, error: 'Archivist call failed' }
  }

  const draft = parseDraft(rawText)
  const latencyMs = Date.now() - startedAt

  if (!draft) {
    void logEvent({
      action: AuditAction.MEMORY_ARCHIVIST_RUN,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      target_id: isRewrite ? (params.memoryId as string) : null,
      outcome: 'failure',
      metadata: { latency_ms: latencyMs, classified_type: 'malformed_response', mode: isRewrite ? 'rewrite' : 'create' },
    })
    console.error('[memory-archivist] malformed response, no valid {title, passage} parsed')
    return { ok: false, status: 502, errorType: 'malformed_response', error: 'Archivist returned an unparseable response' }
  }

  // The archivist call itself succeeded — log success here regardless of
  // whether the subsequent DB write below also succeeds; that's a distinct
  // failure class (persistence, not the model call) and is reported through
  // its own status/error, not a MemoryErrorType.
  void logEvent({
    action: AuditAction.MEMORY_ARCHIVIST_RUN,
    tenant_id: tenantId,
    actor_type: memberId ? 'user' : 'anonymous',
    target_type: 'memory',
    target_id: isRewrite ? (params.memoryId as string) : null,
    outcome: 'success',
    metadata: { latency_ms: latencyMs, mode: isRewrite ? 'rewrite' : 'create' },
  })

  if (isRewrite) {
    const updateResult = await updateDraftMemory(tenantId, sessionId, params.memoryId as string, draft.title, draft.passage)
    if (!updateResult.ok) return { ok: false, status: updateResult.status, error: updateResult.error }
    return { ok: true, memory: updateResult.data }
  }

  const createResult = await createDraftMemory(tenantId, {
    sessionId,
    anchorMessageId,
    memberId,
    sourceKind,
    title: draft.title,
    body: draft.passage,
  })
  if (!createResult.ok) return { ok: false, status: createResult.status, error: createResult.error }
  return { ok: true, memory: createResult.data }
}
