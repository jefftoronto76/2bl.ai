// services/chat/server/turn-context/shadow.ts
//
// Phase 2 — shadow mode. streamChat keeps building and sending its own
// prompt; this module runs resolveTurnPrompt alongside it, compares the two
// strings byte-for-byte, and writes the decision record with `shadow: true`
// and a comparison summary. Nothing here ever influences the model input.
//
// Two hard rules, enforced in code rather than by convention:
//   1. runShadowTurn never rejects. Any failure at any stage — resolve,
//      timeout, compare, record — is logged (console + a failure-outcome
//      audit row) and swallowed. streamChat may `void` it or await it; either
//      way the real turn is unaffected.
//   2. Nothing about the prompt text leaves this module. The comparison
//      carries lengths, first-diff index, contentHash prefixes, and
//      per-segment verdicts only.
//
// Design: Design Handovers/traffic_cop_design_2026-09-05.md §7 Phase 2.

import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { QUESTION_MODE_CONTEXT } from '@/services/prompt/compiler'
import { contentHash } from '@/services/shared/log-safe'
import { resolveTurnPrompt } from './index'
import { SEGMENT_SEPARATOR, withTimeout } from './runner'
import { recordTurnContext } from './trace'
import type {
  ComparisonClassification,
  ResolvedTurnPrompt,
  SegmentComparison,
  SegmentSide,
  SegmentVerdict,
  ShadowComparison,
  TurnContextRequest,
} from './types'

/** Hard cap on the whole shadow run. Well above any observed resolver time; far below a Vercel function's lifetime. */
export const SHADOW_TIMEOUT_MS = 5000

/** The six legacy segments, in streamChat's assembly order, keyed by the provider that replaces each. */
export const LEGACY_SEGMENT_IDS = [
  'base-prompt',
  'booking',
  'member-context',
  'session-context',
  'media',
  'question-mode',
] as const
export type LegacySegmentId = (typeof LEGACY_SEGMENT_IDS)[number]

/** The six locals streamChat has in hand when it builds `systemPrompt`. */
export interface LegacySegmentInputs {
  basePrompt: string
  bookingSection: string
  memberContext: string | null
  sessionContext: string | null
  mediaContext: string
  questionMode: boolean
}

/**
 * Rebuilds the legacy segments with the exact expressions streamChat uses
 * (the MEMBER CONTEXT header, the `?? ''`, the question-mode ternary).
 * Deliberately a duplicate of that array rather than a refactor of it: the
 * live path stays literally untouched, and `compareAssembly`'s
 * `legacyReconstructionMatch` reports if this copy ever drifts from it.
 */
export function buildLegacySegments(inputs: LegacySegmentInputs): Record<LegacySegmentId, string> {
  return {
    'base-prompt': inputs.basePrompt,
    booking: inputs.bookingSection,
    'member-context': inputs.memberContext ? `MEMBER CONTEXT:\n${inputs.memberContext}` : '',
    'session-context': inputs.sessionContext ?? '',
    media: inputs.mediaContext,
    'question-mode': inputs.questionMode ? QUESTION_MODE_CONTEXT : '',
  }
}

/** streamChat's join, applied to the rebuilt segments. */
export function joinLegacySegments(segments: Record<LegacySegmentId, string>): string {
  return LEGACY_SEGMENT_IDS.map(id => segments[id])
    .filter(segment => segment.length > 0)
    .join(SEGMENT_SEPARATOR)
}

function side(body: string | undefined): SegmentSide {
  const present = typeof body === 'string' && body.length > 0
  return { present, length: present ? body.length : 0, hash: present ? contentHash(body) : null }
}

function verdictFor(legacy: SegmentSide, shadow: SegmentSide): SegmentVerdict {
  if (!legacy.present && !shadow.present) return 'both-absent'
  if (legacy.present && !shadow.present) return 'legacy-only'
  if (!legacy.present && shadow.present) return 'shadow-only'
  return legacy.hash === shadow.hash && legacy.length === shadow.length ? 'match' : 'differs'
}

function firstDifference(a: string, b: string): number | null {
  if (a === b) return null
  const limit = Math.min(a.length, b.length)
  for (let i = 0; i < limit; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return i
  }
  return limit
}

const collapseWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Pure. Compares what streamChat sent (`legacySystem`, plus its rebuilt
 * segments) against what the traffic cop would have sent.
 */
export function compareAssembly(
  legacySystem: string,
  legacySegments: Record<LegacySegmentId, string>,
  resolved: ResolvedTurnPrompt,
): ShadowComparison {
  const shadowSystem = resolved.system
  const match = legacySystem === shadowSystem
  const whitespaceOnly = !match && collapseWhitespace(legacySystem) === collapseWhitespace(shadowSystem)

  const shadowBodies = new Map(resolved.blocks.map(b => [b.id, b.body]))
  const shadowStatus = new Map(resolved.injections.map(d => [d.id, d.status]))

  // Legacy ids first, in prompt order; then any provider the shadow knows
  // about that the legacy assembly never had (a future variable).
  const ids: string[] = [...LEGACY_SEGMENT_IDS]
  for (const block of resolved.blocks) if (!ids.includes(block.id)) ids.push(block.id)

  const segments: SegmentComparison[] = ids.map(id => {
    const legacy = side((legacySegments as Record<string, string>)[id])
    const shadow = { ...side(shadowBodies.get(id)), ...(shadowStatus.has(id) ? { status: shadowStatus.get(id) } : {}) }
    return { id, verdict: verdictFor(legacy, shadow), legacy, shadow }
  })

  const diffSegmentIds = segments
    .filter(s => s.verdict !== 'match' && s.verdict !== 'both-absent')
    .map(s => s.id)

  let classification: ComparisonClassification
  if (match) {
    classification = 'identical'
  } else if (whitespaceOnly) {
    classification = 'whitespace-only'
  } else if (segments.some(s => s.verdict === 'legacy-only' || s.verdict === 'shadow-only')) {
    classification = 'segment-presence'
  } else if (segments.some(s => s.verdict === 'differs')) {
    classification = 'segment-content'
  } else {
    // Every segment matches individually but the whole doesn't: the only
    // remaining explanation inside this model is a different order.
    const legacyOrder = LEGACY_SEGMENT_IDS.filter(id => legacySegments[id].length > 0)
    const shadowOrder = resolved.blocks.map(b => b.id)
    const sameSet = legacyOrder.length === shadowOrder.length && legacyOrder.every(id => shadowOrder.includes(id))
    classification = sameSet && legacyOrder.join() !== shadowOrder.join() ? 'ordering' : 'unknown'
  }

  return {
    match,
    legacyLength: legacySystem.length,
    shadowLength: shadowSystem.length,
    firstDiffIndex: firstDifference(legacySystem, shadowSystem),
    whitespaceOnly,
    legacyHash: contentHash(legacySystem),
    shadowHash: contentHash(shadowSystem),
    legacyReconstructionMatch: joinLegacySegments(legacySegments) === legacySystem,
    segments,
    diffSegmentIds,
    classification,
  }
}

// ── The shadow run ──────────────────────────────────────────────────────

export type ShadowStage = 'resolve' | 'timeout' | 'compare' | 'record'

export type ShadowOutcome =
  | { ok: true; comparison: ShadowComparison }
  | { ok: false; stage: ShadowStage }

export interface ShadowTurnParams {
  request: TurnContextRequest
  /** Exactly what streamChat handed to runChatStream. */
  legacySystem: string
  legacyInputs: LegacySegmentInputs
  ctx: {
    tenantId: string | null
    sessionId: string | null
    memberId: string | null
    correlationId: string | null
  }
  timeoutMs?: number
}

class ShadowStageError extends Error {
  constructor(readonly stage: ShadowStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = cause instanceof Error ? cause.name : 'UnknownError'
  }
}

function describe(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message.slice(0, 200) }
  return { name: 'UnknownError', message: String(err).slice(0, 200) }
}

/**
 * Run the traffic cop in the shadow of a real turn. Never rejects; never
 * throws synchronously. Safe to `void` and safe to `await`.
 */
export async function runShadowTurn(params: ShadowTurnParams): Promise<ShadowOutcome> {
  const { request, legacySystem, legacyInputs, ctx } = params
  const timeoutMs = params.timeoutMs ?? SHADOW_TIMEOUT_MS
  let stage: ShadowStage = 'resolve'

  try {
    const resolved = await withTimeout(
      Promise.resolve().then(() => resolveTurnPrompt(request)),
      timeoutMs,
      'shadow',
    ).catch(err => {
      if (err instanceof Error && err.name === 'ProviderTimeoutError') throw new ShadowStageError('timeout', err)
      throw new ShadowStageError('resolve', err)
    })

    stage = 'compare'
    const comparison = compareAssembly(legacySystem, buildLegacySegments(legacyInputs), resolved)

    stage = 'record'
    recordTurnContext(resolved, { ...ctx, shadow: true, parity: comparison.match, comparison })

    return { ok: true, comparison }
  } catch (err) {
    const failedStage = err instanceof ShadowStageError ? err.stage : stage
    const error = describe(err)
    console.error('[chat/turn-context] shadow run failed — real turn unaffected', { stage: failedStage, ...error })
    try {
      void logEvent({
        action: AuditAction.CHAT_TURN_CONTEXT_RESOLVED,
        tenant_id: ctx.tenantId,
        actor_type: ctx.memberId ? 'user' : 'anonymous',
        target_type: 'chat_session',
        target_id: ctx.sessionId,
        correlation_id: ctx.correlationId,
        outcome: 'failure',
        metadata: { shadow: true, stage: failedStage, error },
      })
    } catch {
      // The failure logger failing is the one thing left to swallow.
    }
    return { ok: false, stage: failedStage }
  }
}
