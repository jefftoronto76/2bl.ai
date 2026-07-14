import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInboundChatsFilters } from './useInboundChatsFilters'
import type { ChatSession } from '@/services/crm/inbound'

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    visitor_name: 'Jane Doe',
    email: 'jane@example.com',
    messages: [],
    status: 'in_progress',
    updated_at: '2026-07-10T12:00:00.000Z',
    created_at: '2026-07-10T12:00:00.000Z',
    derived_status: 'in_progress',
    input_tokens: 100,
    output_tokens: 200,
    user_id: null,
    ttft_ms: null,
    feedback: [],
    feedback_counts: { up: 0, down: 0 },
    ...overrides,
  }
}

describe('useInboundChatsFilters', () => {
  it('1. defaults to no filters and the full row set', () => {
    const rows = [makeSession()]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    expect(result.current.query).toBe('')
    expect(result.current.statusFilter).toBe('all')
    expect(result.current.negativeOnly).toBe(false)
    expect(result.current.slowOnly).toBe(false)
    expect(result.current.hasActiveFilter).toBe(false)
    expect(result.current.filtered).toEqual(rows)
  })

  it('2. filters by visitor name or email, case-insensitively', () => {
    const rows = [
      makeSession({ id: 'a', visitor_name: 'Alice Example', email: 'alice@x.com' }),
      makeSession({ id: 'b', visitor_name: 'Bob Sample', email: 'bob@y.com' }),
    ]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    act(() => result.current.setQuery('ALICE'))
    expect(result.current.filtered.map((r) => r.id)).toEqual(['a'])

    act(() => result.current.setQuery('y.com'))
    expect(result.current.filtered.map((r) => r.id)).toEqual(['b'])
  })

  it('3. computes per-status counts and filters by status', () => {
    const rows = [
      makeSession({ id: 'a', derived_status: 'in_progress' }),
      makeSession({ id: 'b', derived_status: 'active' }),
      makeSession({ id: 'c', derived_status: 'abandoned' }),
      makeSession({ id: 'd', derived_status: 'abandoned' }),
    ]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    expect(result.current.counts).toEqual({ all: 4, in_progress: 1, active: 1, abandoned: 2 })

    act(() => result.current.setStatusFilter('abandoned'))
    expect(result.current.filtered.map((r) => r.id)).toEqual(['c', 'd'])
  })

  it('4. negativeOnly keeps only sessions with a thumbs-down', () => {
    const rows = [
      makeSession({ id: 'a', feedback_counts: { up: 1, down: 0 } }),
      makeSession({ id: 'b', feedback_counts: { up: 0, down: 2 } }),
    ]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    act(() => result.current.setNegativeOnly(true))
    expect(result.current.filtered.map((r) => r.id)).toEqual(['b'])
  })

  it('5. slowOnly keeps only sessions with ttft_ms over 1000', () => {
    const rows = [
      makeSession({ id: 'a', ttft_ms: 400 }),
      makeSession({ id: 'b', ttft_ms: 1500 }),
      makeSession({ id: 'c', ttft_ms: null }),
    ]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    act(() => result.current.setSlowOnly(true))
    expect(result.current.filtered.map((r) => r.id)).toEqual(['b'])
  })

  it('6. date range filters inclusively by updated_at (falling back to created_at)', () => {
    const rows = [
      makeSession({ id: 'a', updated_at: '2026-07-01T00:00:00.000Z', created_at: '2026-07-01T00:00:00.000Z' }),
      makeSession({ id: 'b', updated_at: '2026-07-10T00:00:00.000Z', created_at: '2026-07-10T00:00:00.000Z' }),
      makeSession({ id: 'c', updated_at: null, created_at: '2026-07-15T00:00:00.000Z' }),
    ]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    act(() => {
      result.current.setDateFrom('2026-07-05')
      result.current.setDateTo('2026-07-12')
    })
    expect(result.current.filtered.map((r) => r.id)).toEqual(['b'])
  })

  it('7. hasActiveFilter reflects any non-default filter, clearAll resets everything', () => {
    const rows = [makeSession()]
    const { result } = renderHook(() => useInboundChatsFilters(rows))
    act(() => result.current.setQuery('foo'))
    expect(result.current.hasActiveFilter).toBe(true)

    act(() => result.current.clearAll())
    expect(result.current.query).toBe('')
    expect(result.current.statusFilter).toBe('all')
    expect(result.current.negativeOnly).toBe(false)
    expect(result.current.slowOnly).toBe(false)
    expect(result.current.dateFrom).toBe('')
    expect(result.current.dateTo).toBe('')
    expect(result.current.hasActiveFilter).toBe(false)
  })
})
