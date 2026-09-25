// services/chat/server/turn-context/shadow.test.ts
//
// The two things the Phase 2 brief singles out: the comparison logic (can a
// mismatch be triaged from the audit row alone, with no prompt text in it?)
// and the fail-open guarantee (can anything the shadow does reach the real
// turn?). Since Phase 3a the shadow side is the legacy assembly: runShadowTurn
// is handed the live resolution and re-runs the six legacy resolvers itself,
// so those resolvers are what these tests mock.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ResolvedTurnPrompt, TurnContextRequest } from './types'
import type { LegacySegmentInputs } from './shadow'

const { QUESTION_MODE_CONTEXT } = vi.hoisted(() => ({
  QUESTION_MODE_CONTEXT: 'CONTEXT: This visitor arrived with a specific question in mind. …',
}))
const mockBase = vi.fn<(t: string | null) => Promise<string>>()
vi.mock('@/services/prompt/compiler', () => ({
  QUESTION_MODE_CONTEXT,
  getSystemPrompt: (t: string | null) => mockBase(t),
  getSystemPromptRecord: vi.fn(),
}))
vi.mock('@/services/auth/supabase-admin', () => ({ getAdminClient: () => ({}) }))

const mockLogEvent = vi.fn()
vi.mock('@/services/audit', () => ({ logEvent: (...a: unknown[]) => mockLogEvent(...a) }))

const mockBooking = vi.fn<(t: string) => Promise<string>>()
vi.mock('../booking', () => ({ getBookingCardSection: (t: string) => mockBooking(t) }))
const mockMember = vi.fn<(...a: unknown[]) => Promise<string | null>>()
vi.mock('../member-context', () => ({
  MARKER_INSTRUCTION_LEAD: 'On your first reply, silently append',
  getMemberContext: (...a: unknown[]) => mockMember(...a),
}))
const mockSession = vi.fn<(...a: unknown[]) => Promise<string | null>>()
vi.mock('../session-context', () => ({ getSessionContext: (...a: unknown[]) => mockSession(...a) }))
const mockMedia = vi.fn<(...a: unknown[]) => Promise<string>>()
vi.mock('../media-context', () => ({ resolveMediaContext: (...a: unknown[]) => mockMedia(...a) }))

/** Make the six legacy resolvers return exactly `i`. */
function legacyResolversReturn(i: LegacySegmentInputs) {
  mockBase.mockResolvedValue(i.basePrompt)
  mockBooking.mockResolvedValue(i.bookingSection)
  mockMember.mockResolvedValue(i.memberContext)
  mockSession.mockResolvedValue(i.sessionContext)
  mockMedia.mockResolvedValue(i.mediaContext)
}

import {
  buildLegacySegments,
  joinLegacySegments,
  compareAssembly,
  runShadowTurn,
  resolveLegacyInputs,
  SHADOW_TIMEOUT_MS,
  LEGACY_SEGMENT_IDS,
} from './shadow'

// ── Fixtures ────────────────────────────────────────────────────────────
const PII = { name: 'Sarah Chen', email: 'sarah@example.com' }
const BASE = '<identity>\nYou are Sage…\n</identity>'
const BOOKING = 'Booking cards — …\n[BOOKING: Discovery call | 20 min | Book | https://cal.example/x]'
const MEMBER = `Member's name is ${PII.name}. Email: ${PII.email}.`
const STORY = '<session_context>\n  <name>Trip</name>\n</session_context>'
const MEDIA = 'ATTACHED MEDIA:\n\n[beach.jpg (image)]\nA beach.'

const inputs = {
  basePrompt: BASE,
  bookingSection: '',
  memberContext: MEMBER,
  sessionContext: STORY,
  mediaContext: MEDIA,
  questionMode: false,
}

function resolvedFrom(blocks: Array<{ id: string; body: string }>, overrides: Partial<ResolvedTurnPrompt> = {}): ResolvedTurnPrompt {
  return {
    system: blocks.map(b => b.body).join('\n\n'),
    blocks,
    selection: { slotKey: 'base', ruleId: 'default-slot', compiledPromptId: 'cp-1', version: 23, fallback: false },
    injections: LEGACY_SEGMENT_IDS.map((id, i) => ({
      id, order: i * 10, priority: i * 10,
      status: blocks.some(b => b.id === id) ? 'injected' : 'skipped',
      ...(blocks.some(b => b.id === id) ? {} : { reason: 'empty' as const }),
      estTokens: 0, ms: 1,
    })),
    budget: { capTokens: 2000, enforce: false, usedTokens: 0, budgetedTokens: 0, overCap: false, droppedIds: [] },
    isFirstTurn: false,
    turnIndex: 1,
    ...overrides,
  }
}

const identicalBlocks = [
  { id: 'base-prompt', body: BASE },
  { id: 'member-context', body: `MEMBER CONTEXT:\n${MEMBER}` },
  { id: 'session-context', body: STORY },
  { id: 'media', body: MEDIA },
]

const request: TurnContextRequest = {
  tenantId: 'tenant-1', sessionId: 'session-1', memberId: 'member-1', memberStatus: 'active',
  messages: [{ role: 'user', content: 'Hi' }], mode: null, mediaItems: null, correlationId: null,
}
const ctx = { tenantId: 'tenant-1', sessionId: 'session-1', memberId: 'member-1', correlationId: 'corr-1' }

beforeEach(() => {
  mockLogEvent.mockReset()
  for (const m of [mockBase, mockBooking, mockMember, mockSession, mockMedia]) m.mockReset()
  legacyResolversReturn(inputs)
})

// ── Legacy reconstruction ───────────────────────────────────────────────
describe('buildLegacySegments / joinLegacySegments', () => {
  // Verbatim from streamChat's pre-Phase-3a concatenation — same recipe
  // assembly.golden.test.ts pins.
  function streamChatRecipe(i: LegacySegmentInputs): string {
    return [
      i.basePrompt,
      i.bookingSection,
      i.memberContext ? `MEMBER CONTEXT:\n${i.memberContext}` : '',
      i.sessionContext ?? '',
      i.mediaContext,
      i.questionMode ? QUESTION_MODE_CONTEXT : '',
    ].filter(s => s.length > 0).join('\n\n')
  }

  it.each([
    ['member story turn', inputs],
    ['sage visitor', { basePrompt: BASE, bookingSection: BOOKING, memberContext: null, sessionContext: null, mediaContext: '', questionMode: false }],
    ['question mode', { basePrompt: BASE, bookingSection: BOOKING, memberContext: null, sessionContext: null, mediaContext: '', questionMode: true }],
    ['base only', { basePrompt: BASE, bookingSection: '', memberContext: null, sessionContext: null, mediaContext: '', questionMode: false }],
  ])('joins to exactly what streamChat builds — %s', (_label, i) => {
    expect(joinLegacySegments(buildLegacySegments(i))).toBe(streamChatRecipe(i))
  })

  it('keys the six segments by provider id in prompt order', () => {
    expect(Object.keys(buildLegacySegments(inputs))).toEqual([...LEGACY_SEGMENT_IDS])
  })
})

// ── Comparison ──────────────────────────────────────────────────────────
describe('compareAssembly', () => {
  const legacySegments = buildLegacySegments(inputs)
  const legacySystem = joinLegacySegments(legacySegments)

  it('identical: match, no diff index, every present segment matches, absent ones both-absent', () => {
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(identicalBlocks))
    expect(c).toMatchObject({ match: true, firstDiffIndex: null, whitespaceOnly: false, classification: 'identical', diffSegmentIds: [], legacyReconstructionMatch: true })
    expect(c.legacyHash).toBe(c.shadowHash)
    expect(c.legacyLength).toBe(c.shadowLength)
    expect(Object.fromEntries(c.segments.map(s => [s.id, s.verdict]))).toEqual({
      'base-prompt': 'match', booking: 'both-absent', 'member-context': 'match',
      'session-context': 'match', media: 'match', 'question-mode': 'both-absent',
    })
    expect(c.segments.find(s => s.id === 'booking')?.shadow.status).toBe('skipped')
  })

  it('one segment with different content: differs, correct first-diff index, segment-content', () => {
    const changed = identicalBlocks.map(b => b.id === 'member-context' ? { ...b, body: `MEMBER CONTEXT:\nMember's name is Sara Chen. Email: ${PII.email}.` } : b)
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(changed))
    expect(c.match).toBe(false)
    expect(c.classification).toBe('segment-content')
    expect(c.diffSegmentIds).toEqual(['member-context'])
    expect(c.segments.find(s => s.id === 'member-context')).toMatchObject({ verdict: 'differs', legacy: { present: true }, shadow: { present: true, status: 'injected' } })
    // "Sarah" vs "Sara" — the diff is at the 'h', inside the member block after base + separator + header.
    const expectedIndex = `${BASE}\n\nMEMBER CONTEXT:\nMember's name is Sara`.length
    expect(c.firstDiffIndex).toBe(expectedIndex)
    expect(c.legacyHash).not.toBe(c.shadowHash)
  })

  it('legacy has a segment the shadow lacks: legacy-only, segment-presence', () => {
    const missing = identicalBlocks.filter(b => b.id !== 'media')
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(missing))
    expect(c.classification).toBe('segment-presence')
    expect(c.diffSegmentIds).toEqual(['media'])
    expect(c.segments.find(s => s.id === 'media')).toMatchObject({ verdict: 'legacy-only', shadow: { present: false, hash: null, status: 'skipped' } })
    expect(c.firstDiffIndex).toBe(`${BASE}\n\nMEMBER CONTEXT:\n${MEMBER}\n\n${STORY}`.length)
  })

  it('shadow has a segment the legacy lacks (a future provider): shadow-only, listed after the six', () => {
    const extra = [...identicalBlocks, { id: 'date-time', body: 'Current date: Monday.' }]
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(extra))
    expect(c.classification).toBe('segment-presence')
    expect(c.diffSegmentIds).toEqual(['date-time'])
    expect(c.segments.map(s => s.id)).toEqual([...LEGACY_SEGMENT_IDS, 'date-time'])
    expect(c.segments.at(-1)).toMatchObject({ verdict: 'shadow-only', legacy: { present: false } })
  })

  it('whitespace-only drift is classified as such, not as a content difference', () => {
    const spaced = identicalBlocks.map(b => b.id === 'media' ? { ...b, body: MEDIA.replace('\n\n', '\n \n') } : b)
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(spaced))
    expect(c.match).toBe(false)
    expect(c.whitespaceOnly).toBe(true)
    expect(c.classification).toBe('whitespace-only')
    expect(c.diffSegmentIds).toEqual(['media'])
  })

  it('same blocks in a different order: ordering', () => {
    const reordered = [identicalBlocks[0], identicalBlocks[2], identicalBlocks[1], identicalBlocks[3]]
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(reordered))
    expect(c.match).toBe(false)
    expect(c.diffSegmentIds).toEqual([])
    expect(c.classification).toBe('ordering')
  })

  it('flags when the rebuilt legacy segments do not join to the legacy string actually sent', () => {
    const c = compareAssembly(legacySystem + '\n\nEXTRA', legacySegments, resolvedFrom(identicalBlocks))
    expect(c.legacyReconstructionMatch).toBe(false)
    expect(c.match).toBe(false)
  })

  it('carries no prompt text — only lengths, indexes, hashes, verdicts', () => {
    const c = compareAssembly(legacySystem, legacySegments, resolvedFrom(identicalBlocks))
    const serialized = JSON.stringify(c)
    for (const text of [BASE, MEMBER, STORY, MEDIA, PII.name, PII.email, 'MEMBER CONTEXT', 'identity']) {
      expect(serialized).not.toContain(text)
    }
    for (const s of c.segments) {
      if (s.legacy.hash) expect(s.legacy.hash).toMatch(/^[0-9a-f]{8}$/)
      if (s.shadow.hash) expect(s.shadow.hash).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  it('handles the degenerate empty-vs-empty case', () => {
    const empty = { basePrompt: '', bookingSection: '', memberContext: null, sessionContext: null, mediaContext: '', questionMode: false }
    const c = compareAssembly('', buildLegacySegments(empty), resolvedFrom([]))
    expect(c).toMatchObject({ match: true, classification: 'identical', legacyLength: 0, shadowLength: 0 })
    expect(c.segments.every(s => s.verdict === 'both-absent')).toBe(true)
  })
})

// ── The shadow run: fail-open ───────────────────────────────────────────
describe('runShadowTurn', () => {
  const live = () => resolvedFrom(identicalBlocks)

  it('re-runs the legacy resolvers with streamChat\'s old gates and arguments', async () => {
    await runShadowTurn({ request, resolved: live(), ctx })
    expect(mockBase).toHaveBeenCalledWith('tenant-1')
    expect(mockBooking).toHaveBeenCalledWith('tenant-1')
    expect(mockMember).toHaveBeenCalledWith('session-1', 'tenant-1', 'member-1', true)
    expect(mockSession).toHaveBeenCalledWith('session-1', 'tenant-1', true)
    expect(mockMedia).toHaveBeenCalledWith(null, 'tenant-1', 'member-1')
  })

  it('resolveLegacyInputs mirrors the old gates: no tenant → no booking; no session or member → no member context', async () => {
    const got = await resolveLegacyInputs({ ...request, tenantId: null, sessionId: null, memberId: null, mode: 'question' })
    expect(mockBooking).not.toHaveBeenCalled()
    expect(mockMember).not.toHaveBeenCalled()
    expect(got).toMatchObject({ bookingSection: '', memberContext: null, questionMode: true })
  })

  it('on success writes one shadow:true, live:true record with parity and the comparison, and resolves ok', async () => {
    const outcome = await runShadowTurn({ request, resolved: live(), ctx })

    expect(outcome).toMatchObject({ ok: true, comparison: { match: true, legacyReconstructionMatch: true } })
    expect(mockLogEvent).toHaveBeenCalledTimes(1)
    const event = mockLogEvent.mock.calls[0][0]
    expect(event).toMatchObject({
      action: 'chat.turn_context_resolved', outcome: 'success', tenant_id: 'tenant-1',
      target_type: 'chat_session', target_id: 'session-1', correlation_id: 'corr-1', actor_type: 'user',
    })
    expect(event.metadata).toMatchObject({ shadow: true, live: true, parity: true, comparison: { match: true, classification: 'identical' } })
  })

  it('records parity:false with the comparison on a mismatch', async () => {
    const outcome = await runShadowTurn({ request, resolved: resolvedFrom(identicalBlocks.filter(b => b.id !== 'media')), ctx })
    expect(outcome.ok).toBe(true)
    expect(mockLogEvent.mock.calls[0][0].metadata).toMatchObject({ shadow: true, live: true, parity: false, comparison: { classification: 'segment-presence', diffSegmentIds: ['media'] } })
  })

  it('a legacy resolver rejects: resolves (never rejects) with stage resolve and writes a failure-outcome row', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBase.mockRejectedValue(new Error('supabase exploded'))

    await expect(runShadowTurn({ request, resolved: live(), ctx })).resolves.toEqual({ ok: false, stage: 'resolve' })
    expect(mockLogEvent).toHaveBeenCalledTimes(1)
    expect(mockLogEvent.mock.calls[0][0]).toMatchObject({
      action: 'chat.turn_context_resolved', outcome: 'failure', target_id: 'session-1',
      metadata: { shadow: true, live: true, stage: 'resolve', error: { name: 'Error', message: 'supabase exploded' } },
    })
    // The failure row is still the live turn's decision record.
    expect(mockLogEvent.mock.calls[0][0].metadata).toMatchObject({
      selection: { slotKey: 'base', compiledPromptId: 'cp-1' },
      systemLength: live().system.length,
    })
    expect(mockLogEvent.mock.calls[0][0].metadata.injections).toHaveLength(6)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a legacy resolver throws synchronously: still stage resolve, still resolves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBooking.mockImplementation(() => { throw new TypeError('sync bug') })
    await expect(runShadowTurn({ request, resolved: live(), ctx })).resolves.toEqual({ ok: false, stage: 'resolve' })
    expect(mockLogEvent.mock.calls[0][0].metadata.error).toEqual({ name: 'TypeError', message: 'sync bug' })
    vi.restoreAllMocks()
  })

  describe('timeout', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

    it('a legacy resolver that never settles is cut off at timeoutMs with stage timeout', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSession.mockImplementation(() => new Promise(() => {}))

      const pending = runShadowTurn({ request, resolved: live(), ctx, timeoutMs: 100 })
      await vi.advanceTimersByTimeAsync(101)

      await expect(pending).resolves.toEqual({ ok: false, stage: 'timeout' })
      expect(mockLogEvent.mock.calls[0][0].metadata).toMatchObject({ shadow: true, stage: 'timeout', error: { name: 'ProviderTimeoutError' } })
    })

    it('defaults to SHADOW_TIMEOUT_MS (5 s)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSession.mockImplementation(() => new Promise(() => {}))
      const pending = runShadowTurn({ request, resolved: live(), ctx })
      await vi.advanceTimersByTimeAsync(SHADOW_TIMEOUT_MS - 1)
      let settled = false
      void pending.then(() => { settled = true })
      await Promise.resolve()
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      await expect(pending).resolves.toEqual({ ok: false, stage: 'timeout' })
      expect(SHADOW_TIMEOUT_MS).toBe(5000)
    })
  })

  it('compare throws (malformed resolved shape): stage compare, resolves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const malformed = { system: 'x' } as unknown as ResolvedTurnPrompt // no blocks/injections
    await expect(runShadowTurn({ request, resolved: malformed, ctx })).resolves.toEqual({ ok: false, stage: 'compare' })
    expect(mockLogEvent.mock.calls[0][0].metadata.stage).toBe('compare')
    vi.restoreAllMocks()
  })

  it('the audit logger itself throwing cannot escape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLogEvent.mockImplementation(() => { throw new Error('audit down') })
    await expect(runShadowTurn({ request, resolved: live(), ctx })).resolves.toEqual({ ok: false, stage: 'record' })
    vi.restoreAllMocks()
  })

  it('never puts prompt text or identity values into the audit row', async () => {
    const drifted = resolvedFrom(identicalBlocks.map(b => b.id === 'media' ? { ...b, body: MEDIA + ' extra' } : b))
    await runShadowTurn({ request, resolved: drifted, ctx })
    const serialized = JSON.stringify(mockLogEvent.mock.calls[0][0])
    for (const text of [BASE, MEMBER, STORY, MEDIA, PII.name, PII.email]) expect(serialized).not.toContain(text)
  })
})
