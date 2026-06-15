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

function isPlausiblePhone(candidate: string): boolean {
  // Deliberately lenient (mirrors isPlausibleEmail): must contain at least one
  // digit and be at least 7 characters. The goal is to reject obvious
  // non-phones (sentinels, single words), not to validate a numbering plan.
  if (candidate.length < 7) return false
  return /\d/.test(candidate)
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

// Extracts a plausible phone from a [PHONE: x] marker in the assistant text, or
// null when the marker is absent/empty/implausible. The value is kept verbatim
// (trimmed) — no normalization, so the visitor's own formatting is preserved.
// Mirrors PHONE_MARKER in services/chat/ui/v1/registry.ts; kept as a local
// regex (like detectVisitorEmailMarker) so the CRM service does not depend on
// the UI-v1 layer. Exported for unit testing.
export function detectVisitorPhoneMarker(text: string): string | null {
  const match = text.match(/\[PHONE:\s*([^\]]*)\]/)
  if (!match) return null
  const candidate = match[1].trim()
  if (candidate.length === 0) return null
  return isPlausiblePhone(candidate) ? candidate : null
}

// ── Visitor-message contact + name watcher ─────────────────────────────────
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

// Extracts a plausible first name from arbitrary visitor prose using
// strong-intent cue phrases ("my name is", "name's", "call me", "this is"),
// titlecased and run through isPlausibleName, or null when no match is found.
// Conservative by design: the regex is anchored on explicit self-introduction
// cues so stray capitalised words in ordinary sentences do not trigger a match.
// Exported for unit testing.
export function detectNameInText(text: string): string | null {
  const match = text.match(
    /(?:my name is|name's|call me|this is)\s+([A-Za-z][a-zA-Z'-]*)/i,
  )
  if (!match) return null
  const raw = match[1].trim()
  if (raw.length === 0) return null
  const candidate = raw[0].toUpperCase() + raw.slice(1).toLowerCase()
  return isPlausibleName(candidate) ? candidate : null
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

async function persistVisitorName(sessionId: string, name: string): Promise<boolean> {
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('visitor_name')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] visitor_name select failed:', selectError.message)
      return false
    }

    if (!data) {
      console.warn('[chat/session] visitor_name persist skipped — session not found:', sessionId)
      return false
    }

    if (data.visitor_name && data.visitor_name.length > 0) {
      console.log('[chat/session] visitor_name already set, skipping write:', {
        session_id: sessionId,
        existing: data.visitor_name,
        extracted: name,
      })
      return false
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ visitor_name: name })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] visitor_name update failed:', updateError.message)
      return false
    }

    console.log('[chat/session] visitor_name written:', { session_id: sessionId, name })
    return true
  } catch (err) {
    console.error('[chat/session] persistVisitorName threw:', err instanceof Error ? err.message : err)
    return false
  }
}

// Persists the visitor's email, self-guarding against overwrite. Returns true
// only when a new value was actually written; false when the field was already
// set, the session was missing, or any error occurred — so callers can decide
// whether a fallback path should still run.
async function persistVisitorEmail(sessionId: string, email: string): Promise<boolean> {
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('email')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] email select failed:', selectError.message)
      return false
    }

    if (!data) {
      console.warn('[chat/session] email persist skipped — session not found:', sessionId)
      return false
    }

    if (data.email && data.email.length > 0) {
      console.log('[chat/session] email already set, skipping write:', {
        session_id: sessionId,
        existing: data.email,
        extracted: email,
      })
      return false
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ email })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] email update failed:', updateError.message)
      return false
    }

    console.log('[chat/session] email written:', { session_id: sessionId, email })
    return true
  } catch (err) {
    console.error('[chat/session] persistVisitorEmail threw:', err instanceof Error ? err.message : err)
    return false
  }
}

// Persists the visitor's phone, self-guarding against overwrite. Returns true
// only when a new value was actually written; false when the field was already
// set, the session was missing, or any error occurred — so callers can decide
// whether a fallback path should still run.
async function persistVisitorPhone(sessionId: string, phone: string): Promise<boolean> {
  try {
    const supabase = getAdminClient()
    const { data, error: selectError } = await supabase
      .from('chat_sessions')
      .select('phone')
      .eq('id', sessionId)
      .maybeSingle()

    if (selectError) {
      console.error('[chat/session] phone select failed:', selectError.message)
      return false
    }

    if (!data) {
      console.warn('[chat/session] phone persist skipped — session not found:', sessionId)
      return false
    }

    if (data.phone && data.phone.length > 0) {
      console.log('[chat/session] phone already set, skipping write:', {
        session_id: sessionId,
        existing: data.phone,
        extracted: phone,
      })
      return false
    }

    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ phone })
      .eq('id', sessionId)

    if (updateError) {
      console.error('[chat/session] phone update failed:', updateError.message)
      return false
    }

    console.log('[chat/session] phone written:', { session_id: sessionId, phone })
    return true
  } catch (err) {
    console.error('[chat/session] persistVisitorPhone threw:', err instanceof Error ? err.message : err)
    return false
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
 * [PHONE:] marker capture + persist → visitor-message regex fallback →
 * visitor_name pre-check → [NAME:] marker capture + persist.
 *
 * Phone and email each run the marker path first; the visitor-message regex
 * fallback for a field is short-circuited when the marker path already wrote it
 * (persist returned true), so a value Sage emitted as a marker is never
 * re-derived from free text. If the marker found nothing (or failed to write),
 * the regex fallback gets its chance.
 *
 * `visitorText` is the latest visitor message for this turn (raw, as typed).
 * The regex fallback scans it for a phone/email; null skips it (e.g. the
 * synthetic greeting turn).
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

  console.log('[chat/session] onFinish: received', {
    session_id: sessionId,
    text_length: text.length,
    text_tail: text.slice(-300),
    has_visitor_text: !!visitorText,
  })

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
  // already-captured email. `emailCaptured` records whether the marker path
  // actually wrote, so the regex fallback below can be short-circuited.
  let emailCaptured = false
  const markerEmail = detectVisitorEmailMarker(text)
  if (markerEmail) {
    console.log('[chat/session] onFinish: email marker detected:', markerEmail)
    emailCaptured = await persistVisitorEmail(sessionId, markerEmail)
  } else {
    console.log('[chat/session] onFinish: no email marker in assistant text')
  }

  // [PHONE:] marker — mirrors the [EMAIL:] block above. `phoneCaptured` records
  // whether the marker path actually wrote, gating the regex fallback below.
  let phoneCaptured = false
  const markerPhone = detectVisitorPhoneMarker(text)
  if (markerPhone) {
    console.log('[chat/session] onFinish: phone marker detected:', markerPhone)
    phoneCaptured = await persistVisitorPhone(sessionId, markerPhone)
  } else {
    console.log('[chat/session] onFinish: no phone marker in assistant text')
  }

  // Visitor-message contact watcher (regex fallback) — scans the visitor's own
  // message (not Sage's reply) for a raw phone/email. Per field, this runs ONLY
  // when the marker path above did not already capture it: a successful marker
  // write short-circuits the regex for that field, so a value Sage emitted as a
  // marker is never re-derived (and possibly mis-derived) from free text. When
  // the marker found nothing (or failed to write), the regex gets its chance.
  // Runs before the name pre-check below (which early-returns).
  if (visitorText && visitorText.length > 0) {
    if (phoneCaptured) {
      console.log('[chat/session] onFinish: phone captured via marker, skipping regex fallback')
    } else {
      const phone = detectPhoneInText(visitorText)
      if (phone) {
        console.log('[chat/session] onFinish: phone detected in visitor message')
        await persistVisitorPhone(sessionId, phone)
      }
    }

    if (emailCaptured) {
      console.log('[chat/session] onFinish: email captured via marker, skipping regex fallback')
    } else {
      const email = detectEmailInText(visitorText)
      if (email) {
        console.log('[chat/session] onFinish: email detected in visitor message')
        await persistVisitorEmail(sessionId, email)
      }
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

  // [NAME:] marker — primary name-capture path. `nameCaptured` records whether
  // it actually wrote, gating the regex fallback below (same short-circuit
  // pattern as phone/email above).
  let nameCaptured = false
  const markerName = detectVisitorNameMarker(text)
  if (markerName) {
    console.log('[chat/session] onFinish: name marker detected:', markerName)
    nameCaptured = await persistVisitorName(sessionId, markerName)
  } else {
    console.log('[chat/session] onFinish: no name marker in assistant text')
  }

  // Visitor-message name watcher (regex fallback) — scans the visitor's own
  // message for a self-introduction cue ("my name is", "name's", "call me",
  // "this is"). Only runs when the [NAME:] marker path did not capture: a
  // successful marker write short-circuits this, so a value Sage emitted as a
  // marker is never re-derived from free text.
  if (visitorText && visitorText.length > 0) {
    if (nameCaptured) {
      console.log('[chat/session] onFinish: name captured via marker, skipping regex fallback')
    } else {
      const name = detectNameInText(visitorText)
      if (name) {
        console.log('[chat/session] onFinish: name detected in visitor message')
        await persistVisitorName(sessionId, name)
      }
    }
  }
}
