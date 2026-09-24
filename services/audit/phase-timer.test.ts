// Unit coverage for the per-request phase timer (story-route timing,
// 2026-09) — measurement only: timed calls return/throw exactly as before,
// and each request logs ONE fire-and-forget event with PII-free metadata.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogEvent = vi.fn()
vi.mock('./audit', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }))

import { createPhaseTimer, timePhase } from './phase-timer'
import { AuditAction } from './types'

function fakeClock(...ticks: number[]) {
  let i = 0
  return () => ticks[Math.min(i++, ticks.length - 1)]
}

beforeEach(() => {
  mockLogEvent.mockReset()
})

describe('createPhaseTimer', () => {
  it('returns the wrapped value unchanged and records the phase duration', async () => {
    // start=0, phase t0=10, phase end=35
    const timer = createPhaseTimer(fakeClock(0, 10, 35))
    const value = await timer.time('tenant', async () => 'tenant-1')
    expect(value).toBe('tenant-1')
    expect(timer.phases).toEqual({ tenant: 25 })
    expect(timer.counts).toEqual({ tenant: 1 })
  })

  it('accumulates repeated calls to the same phase and counts them', async () => {
    const timer = createPhaseTimer(fakeClock(0, 0, 5, 5, 12, 12, 20))
    await timer.time('access', async () => 1)
    await timer.time('access', async () => 2)
    await timer.time('access', async () => 3)
    expect(timer.phases.access).toBe(5 + 7 + 8)
    expect(timer.counts.access).toBe(3)
  })

  it('rethrows the original error and still records the phase', async () => {
    const timer = createPhaseTimer(fakeClock(0, 0, 9))
    const boom = new Error('db down')
    await expect(timer.time('memories', async () => { throw boom })).rejects.toBe(boom)
    expect(timer.phases.memories).toBe(9)
  })

  it('works with thenables (Supabase query builders are PromiseLike, not Promises)', async () => {
    const timer = createPhaseTimer()
    const thenable: PromiseLike<{ data: number }> = { then: (res) => Promise.resolve({ data: 42 }).then(res) }
    await expect(timer.time('q', () => thenable)).resolves.toEqual({ data: 42 })
  })

  it('logs exactly one event with path/method/status/totalMs/phases/queryCounts/rowCount — and nothing else', async () => {
    const timer = createPhaseTimer(fakeClock(0, 1, 4, 100))
    await timer.time('auth', async () => 'user-secret-id')
    await timer.log(AuditAction.STORY_ROUTE_TIMING, { path: 'app/api/x/route.ts', method: 'GET', status: 200, rowCount: 3, tenantId: 'tenant-1' })

    expect(mockLogEvent).toHaveBeenCalledTimes(1)
    const event = mockLogEvent.mock.calls[0][0]
    expect(event.action).toBe('story.route_timing')
    expect(event.outcome).toBe('success')
    expect(Object.keys(event).sort()).toEqual(['action', 'metadata', 'outcome', 'tenant_id'])
    // Tenant goes in the column, never in metadata.
    expect(event.tenant_id).toBe('tenant-1')
    expect(JSON.stringify(event.metadata)).not.toContain('tenant-1')
    expect(event.metadata).toEqual({
      path: 'app/api/x/route.ts',
      method: 'GET',
      status: 200,
      totalMs: 100,
      phases: { auth: 3 },
      queryCounts: { auth: 1 },
      rowCount: 3,
    })
    // The timed call's return value never leaks into what's logged.
    expect(JSON.stringify(event)).not.toContain('user-secret-id')
  })

  it('marks 4xx/5xx statuses as failure outcomes and omits rowCount when not given', () => {
    const timer = createPhaseTimer()
    timer.log(AuditAction.STORY_ROUTE_TIMING, { path: 'p', method: 'GET', status: 401 })
    const event = mockLogEvent.mock.calls[0][0]
    expect(event.outcome).toBe('failure')
    expect(event.metadata).not.toHaveProperty('rowCount')
    expect(event.tenant_id).toBeNull()
  })
})

it('log() returns the insert promise so a route can pass it to after()', async () => {
  mockLogEvent.mockResolvedValue(undefined)
  const timer = createPhaseTimer()
  const result = timer.log(AuditAction.STORY_ROUTE_TIMING, { path: 'p', method: 'GET', status: 200 })
  expect(result).toBeInstanceOf(Promise)
  await expect(result).resolves.toBeUndefined()
})

describe('timePhase', () => {
  it('times through the timer when one is given', async () => {
    const timer = createPhaseTimer()
    await timePhase(timer, 'stories', async () => 'x')
    expect(timer.counts.stories).toBe(1)
  })

  it('just runs the call when no timer is given', async () => {
    await expect(timePhase(undefined, 'stories', async () => 'x')).resolves.toBe('x')
  })
})
