import { describe, it, expect, vi, beforeEach } from 'vitest'

interface LoggedEvent {
  action: string
  outcome?: string
  metadata: { path: string; durationMs: number; source: string }
}

const { getCurrentUserMock, logEventMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  logEventMock: vi.fn(async (_input: unknown) => {}),
}))

vi.mock('./providers/clerk/server', () => ({
  getCurrentUser: getCurrentUserMock,
}))
vi.mock('@/services/audit', () => ({
  logEvent: logEventMock,
  AuditAction: { AUTH_CURRENT_USER_TIMING: 'auth.current_user_timing' },
}))

import { getCurrentUserTimed } from './get-current-user-timed'

const USER = { providerUserId: 'clerk-1', isPlatformAdmin: false } as const

beforeEach(() => {
  getCurrentUserMock.mockReset()
  logEventMock.mockClear()
})

describe('getCurrentUserTimed', () => {
  it('returns exactly what getCurrentUser() returns, unmodified', async () => {
    getCurrentUserMock.mockResolvedValue(USER)
    const result = await getCurrentUserTimed('app/api/media/route.ts')
    expect(result).toBe(USER)
  })

  it('returns null unmodified when getCurrentUser() returns null (no session)', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const result = await getCurrentUserTimed('app/api/media/route.ts')
    expect(result).toBeNull()
  })

  it('logs one AUTH_CURRENT_USER_TIMING event per call with the given path, a numeric durationMs, and source: clerk_call — no PII', async () => {
    getCurrentUserMock.mockResolvedValue(USER)
    await getCurrentUserTimed('app/api/members/sync/route.ts')

    expect(logEventMock).toHaveBeenCalledTimes(1)
    const call = logEventMock.mock.calls[0]![0] as LoggedEvent
    expect(call.action).toBe('auth.current_user_timing')
    expect(call.outcome).toBe('success')
    expect(call.metadata).toEqual({
      path: 'app/api/members/sync/route.ts',
      durationMs: expect.any(Number),
      source: 'clerk_call',
    })
    expect(call.metadata.durationMs).toBeGreaterThanOrEqual(0)
    // No PII: only the three documented keys, nothing identity-shaped.
    expect(Object.keys(call.metadata).sort()).toEqual(['durationMs', 'path', 'source'])
  })

  it('propagates a rejection from getCurrentUser() rather than swallowing it, and still logs the attempt as a failure', async () => {
    getCurrentUserMock.mockRejectedValue(new Error('clerk down'))

    await expect(getCurrentUserTimed('app/api/sage/route.ts')).rejects.toThrow('clerk down')

    expect(logEventMock).toHaveBeenCalledTimes(1)
    const call = logEventMock.mock.calls[0]![0] as LoggedEvent
    expect(call.outcome).toBe('failure')
    expect(call.metadata.path).toBe('app/api/sage/route.ts')
  })

  it('never blocks the caller on the audit write — logs fire-and-forget', async () => {
    getCurrentUserMock.mockResolvedValue(USER)
    let resolveLog: () => void = () => {}
    logEventMock.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveLog = resolve }))

    const result = await getCurrentUserTimed('app/admin/layout.tsx')

    expect(result).toBe(USER)
    resolveLog()
  })
})
