// services/crm/session.ts
//
// Session lifecycle + token tracking. Server-only (service-role client). Owns
// the onFinish detection flows: token-usage accounting, calendar-offer
// detection, and first-name capture via the [NAME:] marker Sage emits.
// Consumed by the chat orchestrator (services/chat/server/index.ts →
// handleSessionFinish).
//
// NOTE: the eventual Amendment-3 batched single-write and Amendment-5 pooled
// connection are deliberately NOT applied here. Those optimizations land as
// separate commits.

import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { TokenUsage } from '@/services/chat/server/types'

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

function isPlausibleEmail(candidate: string): boolean {
  if (candidate.length < 6 || candidate.length > 254) return false
  // Single @, non-empty local part, and a dotted domain. Deliberately lenient —
  // the goal is to reject obvious non-emails (sentinels, prose), not to fully
  // validate RFC 5322.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
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
// the shape check. Mirrors NAME_MARKER in services/chat/ui/v1/registry.ts; kept
// as a local regex (like scanForCalendarOffer) so the CRM service does not
// depend on the UI-v1 layer. Exported for unit testing.
export function detectVisitorNameMarker(text: string): string | null {
  const match = text.match(/\[NAME:\s*([^\]]*)\]/)
  if (!match) return null
  const raw = match[1].trim()
  if (raw.length === 0) return null
  const candidate = raw[0].toUpperCase() + raw.slice(1).toLowerCase()
  return isPlausibleName(candidate) ? candidate : null
}

// Extracts a plausible email from an [EMAIL: x] marker in the assistant text,
// or null when the marker is absent/empty/implausible. Lowercases before the
// shape check. Mirrors EMAIL_MARKER in services/chat/ui/v1/registry.ts; kept as
// a local regex (like detectVisitorNameMarker) so the CRM service does not
// depend on the UI-v1 layer. Exported for unit testing.
export function detectVisitorEmailMarker(text: string): string | null {
  const match = text.match(/\[EMAIL:\s*([^\]]*)\]/)
  if (!match) return null
  const candidate = match[1].trim().toLowerCase()
  if (candidate.length === 0) return null
  return isPlausibleEmail(candidate) ? candidate : null
}

// ── Visitor-message contact watcher ────────────────────────────────────────
// Replaces the Heirloom [CONTACT:] card: instead of Sage emitting a marker that
// triggers a capture UI, the server scans the visitor's own message for a raw
// phone/email the moment they type it. These detectors run over free-text
// visitor input (not bracket markers), and the persist helpers self-guard
// against overwrite — so once a value is captured the watcher effectively stops
// for the rest of the session. Exported for unit testing.

// Extracts the first plausible email from arbitrary visitor prose, lowercased
// and with trailing sentence punctuation stripped, or null when none is found.
export function detectEmailInText(text: string): string | null {
  const match = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)
  if (!match) return null
  const candidate = match[0].toLowerCase().replace(/[.,;:!?)\]]+$/, '')
  return isPlausibleEmail(candidate) ? candidate : null
}

// Extracts the first plausible phone from arbitrary visitor prose, normalized to
// E.164, or null when none is found. Validation is digit-count based: a bare
// 10-digit number is treated as NANP (+1…), an 11-digit leading-1 number keeps
// its country code, and a value written with a leading + is taken as already
// international (8–15 digits). KNOWN v1 TRADEOFF: a stray 10-digit sequence in
// prose (e.g. an order number) can match; the persist self-guard means the
// first match wins for the session, so a false positive could pre-empt the real
// number. Accepted for v1 — tighten with contextual cues if it proves noisy.
export function detectPhoneInText(text: string): string | null {
  const match = text.match(/\+?\d[\d\s().-]{6,}\d/)
  if (!match) return null
  const raw = match[0].trimStart()
  const hadPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  if (hadPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return null
}

// ── Contact extraction (Haiku) ──────────────────────────────────────────────
// A single focused Anthropic call that extracts name, phone, and email from the
// visitor's message in one pass — the successor to the regex watchers above.
// claude-haiku-4-5 is cheap, fast, and well-suited to small structured-
// extraction tasks. The whole flow fails open: any API/parse error logs and
// returns the empty result so the conversation is never blocked.

const EXTRACTION_MODEL = 'claude-haiku-4-5'

const EXTRACTION_SYSTEM_PROMPT =
  'Extract the name, phone number, and email address from the text. ' +
  'Return ONLY valid JSON: { "name": ..., "phone": ..., "email": ... } ' +
  'with null for anything not found. No preamble, no explanation.'

export interface ExtractedContact {
  name: string | null
  phone: string | null
  email: string | null
}

const EMPTY_CONTACT: ExtractedContact = { name: null, phone: null, email: null }

// Coerce a parsed JSON field to a clean string or null. Rejects non-strings,
// blank strings, and the common textual stand-ins a model may emit for "absent"
// ("null" / "none" / "n/a") so they don't get persisted as real values.
function normalizeExtractedField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const lower = trimmed.toLowerCase()
  if (lower === 'null' || lower === 'none' || lower === 'n/a') return null
  return trimmed
}

// Parse the model's response into an ExtractedContact. Defensive against the
// model wrapping JSON in code fences or prose: extract the first {...} block,
// JSON.parse it, and normalize each field. Any failure returns EMPTY_CONTACT.
// Exported for unit testing.
export function parseExtraction(raw: string): ExtractedContact {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return EMPTY_CONTACT
    const parsed: unknown = JSON.parse(match[0])
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_CONTACT
    const obj = parsed as Record<string, unknown>
    return {
      name: normalizeExtractedField(obj.name),
      phone: normalizeExtractedField(obj.phone),
      email: normalizeExtractedField(obj.email),
    }
  } catch (err) {
    console.error(
      '[chat/session] contact extraction JSON parse failed:',
      err instanceof Error ? err.message : err,
    )
    return EMPTY_CONTACT
  }
}

// Run the focused Haiku extraction call on a single visitor message. Returns
// EMPTY_CONTACT for empty input (no API call) and on any error (fail open).
// Exported for unit testing.
export async function extractContactFields(visitorText: string): Promise<ExtractedContact> {
  if (!visitorText || visitorText.trim().length === 0) return EMPTY_CONTACT
  try {
    const { text } = await generateText({
      model: anthropic(EXTRACTION_MODEL),
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: visitorText,
      maxTokens: 128,
    })
    return parseExtraction(text)
  } catch (err) {
    console.error(
      '[chat/session] contact extraction call failed:',
      err instanceof Error ? err.message : err,
    )
    return EMPTY_CONTACT
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

async function persistVisitorEmail(sessionId: string, email: string): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('email')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] email select failed:', selectError.message)
      return
    }

    if (!data) {
      console.warn('[chat/session] email persist skipped — session not found:', sessionId)
      return
    }

    if (data.email && data.email.length > 0) {
      console.log('[chat/session] email already set, skipping write:', {
        session_id: sessionId,
        existing: data.email,
        extracted: email,
      })
      return
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ email })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] email update failed:', updateError.message)
      return
    }

    console.log('[chat/session] email written:', { session_id: sessionId, email })
  } catch (err) {
    console.error('[chat/session] persistVisitorEmail threw:', err instanceof Error ? err.message : err)
  }
}

async function persistVisitorPhone(sessionId: string, phone: string): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('phone')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] phone select failed:', selectError.message)
      return
    }

    if (!data) {
      console.warn('[chat/session] phone persist skipped — session not found:', sessionId)
      return
    }

    if (data.phone && data.phone.length > 0) {
      console.log('[chat/session] phone already set, skipping write:', {
        session_id: sessionId,
        existing: data.phone,
        extracted: phone,
      })
      return
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ phone })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] phone update failed:', updateError.message)
      return
    }

    console.log('[chat/session] phone written:', { session_id: sessionId, phone })
  } catch (err) {
    console.error('[chat/session] persistVisitorPhone threw:', err instanceof Error ? err.message : err)
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
 * null (e.g. the greeting turn before a session exists). Sequence: main-turn
 * token usage → calendar-offer detection → [EMAIL:] marker capture + persist →
 * visitor-message phone/email watcher → visitor_name pre-check → [NAME:] marker
 * capture + persist.
 *
 * `visitorText` is the latest visitor message for this turn (raw, as typed).
 * The contact watcher scans it for a phone/email; null skips the watcher (e.g.
 * the synthetic greeting turn).
 */
export async function handleSessionFinish(params: {
  sessionId: string | null
  text: string
  usage: TokenUsage | null
  visitorText?: string | null
}): Promise<void> {
  const { sessionId, text, usage, visitorText } = params

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

  // [EMAIL:] marker — captured independently of the name flow below (which
  // early-returns). persistVisitorEmail self-guards against overwriting an
  // already-captured email, so no function-level pre-check is needed here.
  const markerEmail = detectVisitorEmailMarker(text)
  if (markerEmail) {
    console.log('[chat/session] onFinish: email marker detected:', markerEmail)
    await persistVisitorEmail(sessionId, markerEmail)
  } else {
    console.log('[chat/session] onFinish: no email marker in assistant text')
  }

  // Visitor-message contact watcher — scans the visitor's own message (not
  // Sage's reply) for a raw phone/email and persists on first match. Runs
  // before the name pre-check below (which early-returns), mirroring the
  // [EMAIL:] block above. persistVisitorPhone/persistVisitorEmail self-guard
  // against overwrite, so once captured the watcher stops for the session.
  if (visitorText && visitorText.length > 0) {
    const phone = detectPhoneInText(visitorText)
    if (phone) {
      console.log('[chat/session] onFinish: phone detected in visitor message')
      await persistVisitorPhone(sessionId, phone)
    }
    const email = detectEmailInText(visitorText)
    if (email) {
      console.log('[chat/session] onFinish: email detected in visitor message')
      await persistVisitorEmail(sessionId, email)
    }
  }

  // Pre-check: skip name detection entirely if visitor_name is already
  // populated, so a later turn never re-scans or overwrites a captured name.
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

  // [NAME:] marker — the sole name-capture path. When Sage emits [NAME: x] and
  // x is plausible, persist it. No marker → do nothing (the prior Haiku
  // fallback was removed in PR 3 once marker emission was proven in production).
  const markerName = detectVisitorNameMarker(text)
  if (markerName) {
    console.log('[chat/session] onFinish: name marker detected:', markerName)
    await persistVisitorName(sessionId, markerName)
    return
  }

  console.log('[chat/session] onFinish: no name marker in assistant text')
}
