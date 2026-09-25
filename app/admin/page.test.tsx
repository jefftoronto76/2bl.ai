// Covers app/admin/page.tsx's timing instrumentation (admin page-load
// timing, 2026-09, measurement only). Pins the wiring: one PII-free
// ADMIN_PAGE_LOAD_TIMING event per render — success, auth failure, and
// data-fetch failure — and that inboundChats/ttftTrend stay concurrent.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuthContext = vi.fn()
const mockGetInboundChats = vi.fn()
const mockGetTtftTrend = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}))
vi.mock('@/services/crm/inbound', () => ({
  getInboundChats: (...args: unknown[]) => mockGetInboundChats(...args),
  getTtftTrend: (...args: unknown[]) => mockGetTtftTrend(...args),
}))
vi.mock('@mantine/core', () => ({ Box: () => null, Stack: () => null, Title: () => null }))
vi.mock('@/components/admin/primitives/Text', () => ({ Text: () => null }))
vi.mock('./InboundChartsDashboard', () => ({ InboundChartsDashboard: () => null }))
vi.mock('./InboundChatsTable', () => ({ InboundChatsTable: () => null }))
const mockAfter = vi.fn((task: () => unknown) => { void task() })
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => mockAfter(task),
}))
vi.mock('@/services/audit/audit', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }))

import AdminPage from './page'

function timingEvents() {
  return mockLogEvent.mock.calls.map(c => c[0]).filter(e => e.action === 'admin.page_load_timing')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetAuthContext.mockReset().mockResolvedValue({ tenant_id: 'tenant-1' })
  mockGetInboundChats.mockReset().mockResolvedValue([{ id: 'chat-1', visitor_name: 'Ada' }, { id: 'chat-2' }])
  mockGetTtftTrend.mockReset().mockResolvedValue([])
  mockLogEvent.mockReset()
  mockAfter.mockClear()
})

describe('AdminPage — timing instrumentation', () => {
  it('logs one success event with all three phases and the row count, no PII in metadata', async () => {
    await AdminPage()

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ path: 'app/admin/page.tsx', method: 'GET', status: 200, rowCount: 2 })
    expect(Object.keys(events[0].metadata.phases).sort()).toEqual(['auth', 'inboundChats', 'ttftTrend'])
    expect(events[0].tenant_id).toBe('tenant-1')
    expect(events[0].outcome).toBe('success')
    const serialized = JSON.stringify(events[0].metadata)
    for (const s of ['tenant-1', 'chat-1', 'Ada']) expect(serialized).not.toContain(s)
    expect(mockAfter).toHaveBeenCalledTimes(1)
  })

  it('logs one 401 event with a null tenant when getAuthContext throws', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('no auth'))

    await AdminPage()

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ status: 401, rowCount: 0 })
    expect(events[0].tenant_id).toBeNull()
    expect(events[0].outcome).toBe('failure')
    expect(Object.keys(events[0].metadata.phases)).toEqual(['auth'])
    expect(mockGetInboundChats).not.toHaveBeenCalled()
  })

  it('logs one 500 event with the tenant when a data fetch throws after auth', async () => {
    mockGetTtftTrend.mockRejectedValue(new Error('db down'))

    await AdminPage()

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ status: 500, rowCount: 0 })
    expect(events[0].tenant_id).toBe('tenant-1')
    expect(events[0].outcome).toBe('failure')
  })

  it('keeps inboundChats and ttftTrend concurrent — both start before either resolves', async () => {
    const resolvers: Array<() => void> = []
    const pending = <T,>(value: T) => new Promise<T>(r => resolvers.push(() => r(value)))
    mockGetInboundChats.mockImplementation(() => pending([]))
    mockGetTtftTrend.mockImplementation(() => pending([]))

    const render = AdminPage()
    // Let the auth phase settle so the Promise.all is reached.
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(mockGetInboundChats).toHaveBeenCalledTimes(1)
    expect(mockGetTtftTrend).toHaveBeenCalledTimes(1)
    expect(resolvers).toHaveLength(2)

    resolvers.forEach(r => r())
    await render
    expect(timingEvents()).toHaveLength(1)
  })
})
