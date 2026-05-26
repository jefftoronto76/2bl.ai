// services/crm/session.ts
//
// Session lifecycle + token tracking. Server-only (service-role client). Owns
// the onFinish detection flows: token-usage accounting, calendar-offer
// detection, and first-name extraction via a Haiku call. Consumed by the chat
// orchestrator (services/chat/server/index.ts → handleSessionFinish). Logic
// moved verbatim from app/api/sage/route.ts — behavior unchanged.
//
// NOTE: the eventual Amendment-3 batched single-write and Amendment-5 pooled
// connection are deliberately NOT applied here; this is a behavior-preserving
// move. Those optimizations land as separate commits.

import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { ChatMessage, TokenUsage } from '@/services/chat/server/types'

// Internal model for first-name extraction. Always Anthropic Haiku — not a
// tenant-configurable choice, so it is not part of ModelConfig. This const is
// the single source for the extractor model ID.
const NAME_EXTRACTOR_MODEL = 'claude-haiku-4-5'

// Server-side first-name extraction. A single Haiku call against the last
// few turns of the conversation is cheaper to maintain than a regex tree and
// covers the four scenarios (visitor names self up-front, visitor responds
// to a name-ask, visitor ignores, visitor names self mid-conversation).
// Cost is bounded by the chat_sessions.visitor_name pre-check in onFinish:
// once captured, no further Haiku calls fire for that session.
const HAIKU_NAME_EXTRACTOR_SYSTEM =
  "You are extracting one piece of structured data. Given the conversation below, return ONLY the visitor's first name if they have clearly stated it. If the name is unstated or unclear, return the word EMPTY and nothing else. No punctuation, no explanation."

function isPlausibleName(candidate: string): boolean {
  if (candidate.length < 2 || candidate.length > 30) return false
  if (!/^[A-Z][a-zA-Z'-]+$/.test(candidate)) return false
  const upper = candidate.toUpperCase()
  if (
    upper === 'EMPTY' ||
    upper === 'NONE' ||
    upper === 'UNKNOWN' ||
    upper === 'VISITOR' ||
    upper === 'USER'
  ) {
    return false
  }
  return true
}

// Detects whether Sage offered a calendar/booking link in the streamed
// assistant message. Two shapes are covered: the structured booking card
// (always emitted on its own line at the end of a message) and a raw
// calendly.com URL in prose (escape hatch for the discovery-call link
// referenced from DEFAULT_SYSTEM_PROMPT).
function scanForCalendarOffer(text: string): boolean {
  return /\[BOOKING:[^\]]*\]/.test(text) || /calendly\.com/i.test(text)
}

// Extracts a plausible first name from a [NAME: x] marker in the assistant
// text, or null when the marker is absent/empty/implausible. Titlecases before
// the shape check (same as the Haiku path). Mirrors NAME_MARKER in
// services/chat/ui/v1/registry.ts; kept as a local regex (like
// scanForCalendarOffer) so the CRM service does not depend on the UI-v1 layer.
// Exported for unit testing.
export function detectVisitorNameMarker(text: string): string | null {
  const match = text.match(/\[NAME:\s*([^\]]*)\]/)
  if (!match) return null
  const raw = match[1].trim()
  if (raw.length === 0) return null
  const candidate = raw[0].toUpperCase() + raw.slice(1).toLowerCase()
  return isPlausibleName(candidate) ? candidate : null
}

async function extractNameWithHaiku(
  recentMessages: ChatMessage[],
): Promise<{ name: string | null; usage: TokenUsage | null }> {
  try {
    const conversationStr = recentMessages
      .map(m => `${m.role === 'user' ? 'Visitor' : 'Sage'}: ${m.content}`)
      .join('\n\n')

    const result = await generateText({
      model: anthropic(NAME_EXTRACTOR_MODEL),
      system: HAIKU_NAME_EXTRACTOR_SYSTEM,
      messages: [{ role: 'user', content: conversationStr }],
      maxTokens: 20,
    })

    const usage = {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    }

    const raw = result.text.trim()
    console.log('[chat/session] haiku extractor returned:', JSON.stringify(raw), '| usage:', usage)

    if (raw === 'EMPTY' || raw.length === 0) return { name: null, usage }

    // Titlecase before the shape check. Haiku tends to preserve the
    // visitor's casing ("ronald" stays "ronald"), but isPlausibleName
    // requires a single capital lead.
    const candidate = raw[0].toUpperCase() + raw.slice(1).toLowerCase()

    if (!isPlausibleName(candidate)) {
      console.log('[chat/session] haiku candidate rejected by shape check:', candidate)
      return { name: null, usage }
    }
    return { name: candidate, usage }
  } catch (err) {
    console.error('[chat/session] haiku extractor failed:', err instanceof Error ? err.message : err)
    return { name: null, usage: null }
  }
}

async function persistVisitorName(sessionId: string, name: string): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('visitor_name')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] visitor_name select failed:', selectError.message)
      return
    }

    if (!data) {
      console.warn('[chat/session] visitor_name persist skipped — session not found:', sessionId)
      return
    }

    if (data.visitor_name && data.visitor_name.length > 0) {
      console.log('[chat/session] visitor_name already set, skipping write:', {
        session_id: sessionId,
        existing: data.visitor_name,
        extracted: name,
      })
      return
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ visitor_name: name })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] visitor_name update failed:', updateError.message)
      return
    }

    console.log('[chat/session] visitor_name written:', { session_id: sessionId, name })
  } catch (err) {
    console.error('[chat/session] persistVisitorName threw:', err instanceof Error ? err.message : err)
  }
}

async function persistCalendarOffered(sessionId: string): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { error } = await supabase
      .from('chat_sessions')
      .update({ calendar_offered: true })
      .eq('id', sessionId)

    if (error) {
      console.error('[chat/session] calendar_offered update failed:', error.message)
      return
    }

    console.log('[chat/session] calendar_offered written:', { session_id: sessionId })
  } catch (err) {
    console.error(
      '[chat/session] persistCalendarOffered threw:',
      err instanceof Error ? err.message : err,
    )
  }
}

// Increments the cumulative input_tokens / output_tokens counters on the
// session row by the given deltas. Read-modify-write — fine for a single
// visitor's serialized turns; not safe under concurrent writes for the
// same session, but no caller produces that pattern.
async function persistTokenUsage(
  sessionId: string,
  inputDelta: number,
  outputDelta: number,
): Promise<void> {
  if (inputDelta <= 0 && outputDelta <= 0) return
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('input_tokens, output_tokens')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] token usage select failed:', selectError.message)
      return
    }

    if (!data) {
      console.warn('[chat/session] token usage skipped — session not found:', sessionId)
      return
    }

    const currentInput = typeof data.input_tokens === 'number' ? data.input_tokens : 0
    const currentOutput = typeof data.output_tokens === 'number' ? data.output_tokens : 0
    const nextInput = currentInput + Math.max(0, Math.floor(inputDelta))
    const nextOutput = currentOutput + Math.max(0, Math.floor(outputDelta))

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ input_tokens: nextInput, output_tokens: nextOutput })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] token usage update failed:', updateError.message)
      return
    }

    console.log('[chat/session] token usage written:', {
      session_id: sessionId,
      input_delta: inputDelta,
      output_delta: outputDelta,
      input_total: nextInput,
      output_total: nextOutput,
    })
  } catch (err) {
    console.error('[chat/session] persistTokenUsage threw:', err instanceof Error ? err.message : err)
  }
}

/**
 * onFinish detection flows for a streamed chat turn. No-ops when sessionId is
 * null (e.g. the greeting turn before a session exists). Sequence matches the
 * prior inline route logic exactly: main-turn token usage → calendar-offer
 * detection → visitor_name pre-check → Haiku name extraction + persist.
 */
export async function handleSessionFinish(params: {
  sessionId: string | null
  text: string
  usage: TokenUsage | null
  conversationMessages: ChatMessage[]
}): Promise<void> {
  const { sessionId, text, usage, conversationMessages } = params

  if (!sessionId) {
    console.log('[chat/session] onFinish: no session_id, skipping detection flows')
    return
  }

  // Token usage — main streamText turn. Persisted before any other flow so
  // its short-circuits cannot bypass the metric.
  if (usage) {
    await persistTokenUsage(sessionId, usage.promptTokens, usage.completionTokens)
  }

  // Calendar offer detection. Pre-check bounds cost: once true for a session,
  // no further scans fire. Self-contained try/catch so a failure here does
  // not abort the visitor_name flow below.
  try {
    const { data, error } = await getAdminClient()
      .from('chat_sessions')
      .select('calendar_offered')
      .eq('id', sessionId)
      .maybeSingle()

    if (error) {
      console.error('[chat/session] onFinish: calendar_offered pre-check failed:', error.message)
    } else if (!data) {
      console.warn('[chat/session] onFinish: session not found for calendar pre-check:', sessionId)
    } else if (data.calendar_offered === true) {
      console.log('[chat/session] onFinish: calendar_offered already set, skipping scan')
    } else if (scanForCalendarOffer(text)) {
      console.log('[chat/session] onFinish: calendar offer detected in assistant text')
      await persistCalendarOffered(sessionId)
    }
  } catch (err) {
    console.error(
      '[chat/session] onFinish: calendar_offered detection threw:',
      err instanceof Error ? err.message : err,
    )
  }

  // Pre-check: skip the Haiku call entirely if visitor_name is already
  // populated. This is what bounds extraction cost to ~one call per session
  // in the steady state.
  try {
    const { data, error } = await getAdminClient()
      .from('chat_sessions')
      .select('visitor_name')
      .eq('id', sessionId)
      .maybeSingle()

    if (error) {
      console.error('[chat/session] onFinish: visitor_name pre-check failed:', error.message)
      return
    }
    if (!data) {
      console.warn('[chat/session] onFinish: session not found:', sessionId)
      return
    }
    if (typeof data.visitor_name === 'string' && data.visitor_name.length > 0) {
      console.log('[chat/session] onFinish: visitor_name already set, skipping extraction')
      return
    }
  } catch (err) {
    console.error('[chat/session] onFinish: pre-check threw:', err instanceof Error ? err.message : err)
    return
  }

  // [NAME:] marker — primary path. When Sage emits [NAME: x] and x is
  // plausible, persist it and skip the Haiku call. This runs alongside the
  // Haiku extractor below: the marker takes precedence and Haiku is the
  // fallback when the marker is absent or implausible. The Haiku path is
  // removed in PR 3 once marker emission is proven in production. Both write
  // the same column, guarded by the pre-check above — last write wins.
  const markerName = detectVisitorNameMarker(text)
  if (markerName) {
    console.log('[chat/session] onFinish: name marker detected:', markerName)
    await persistVisitorName(sessionId, markerName)
    return
  }

  // Last 4 turns: up to 3 trailing entries from the conversation we sent in,
  // plus the assistant message that just finished streaming.
  const recent: ChatMessage[] = [
    ...conversationMessages.slice(-3),
    { role: 'assistant' as const, content: text },
  ].slice(-4)

  const { name, usage: haikuUsage } = await extractNameWithHaiku(recent)
  if (haikuUsage) {
    await persistTokenUsage(sessionId, haikuUsage.promptTokens, haikuUsage.completionTokens)
  }
  if (!name) {
    console.log('[chat/session] onFinish: haiku extracted no name')
    return
  }
  console.log('[chat/session] onFinish: haiku extracted candidate:', name)
  await persistVisitorName(sessionId, name)
}
