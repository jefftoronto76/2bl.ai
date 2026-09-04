// services/members/members.piiLogging.test.ts
//
// D9 fix: linkInvitedMember logged the raw visitor email across five call
// sites (entry, resolve-failure, token-lookup-skipped, email-find-failure,
// no-matching-row), and acceptInvite's orphan-name-rescue log line logged
// the raw rescued name. Covers both functions end-to-end, asserting no raw
// PII value appears anywhere in console output while confirming the run
// actually reached the log lines under test.

import { vi, describe, it, expect } from 'vitest'

const { adminHolder, logEventMock } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
  logEventMock: vi.fn(),
}))
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))
vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
}))
vi.mock('@/services/auth', () => ({
  deleteClerkUser: vi.fn(async () => {}),
}))

import { linkInvitedMember, acceptInvite, HEIRLOOM_TENANT_ID } from './members'

const RAW_EMAIL = 'priyasomethingdistinct@example.com'
const RAW_RESCUED_NAME = 'Rescuedsomethingdistinct'

function captureAllConsoleOutput() {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  return {
    text() {
      return [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
        .map((args) => JSON.stringify(args))
        .join('\n')
    },
    restore() {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    },
  }
}

// Mirrors members.test.ts's makeLinkClient shape (three calls: users upsert,
// members email-fallback find, members update).
function makeLinkClient({
  userRow,
  userError = null,
  inviteRow,
}: {
  userRow: unknown
  userError?: unknown
  inviteRow: unknown
}) {
  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          upsert(_payload: unknown, _opts: unknown) {
            return { select: () => ({ single: async () => ({ data: userRow, error: userError }) }) }
          },
        }
      }
      const terminal = { is: () => ({ maybeSingle: async () => ({ data: inviteRow, error: null }) }) }
      const afterFilter = { eq: () => terminal }
      return {
        select() {
          return { ilike: () => afterFilter, eq: () => afterFilter }
        },
        update(_payload: unknown) {
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
  return client
}

// Mirrors members.test.ts's makeAcceptInviteClient shape.
function makeAcceptInviteClient({ invitedRow, orphanRows }: { invitedRow: unknown; orphanRows: unknown[] }) {
  const client = {
    from(_table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                is: () => ({ is: () => ({ maybeSingle: async () => ({ data: invitedRow, error: null }) }) }),
                eq: () => ({ neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              }
            },
          }
        },
        delete() {
          return { eq: () => ({ eq: () => ({ neq: () => ({ select: async () => ({ data: orphanRows, error: null }) }) }) }) }
        },
        update(_payload: unknown) {
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
  return client
}

describe('linkInvitedMember — D9, no raw email in any console output', () => {
  it('never logs the raw email on the email-fallback lookup success path', async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeLinkClient({
      userRow: { id: 'user-1' },
      inviteRow: { id: 'member-1', tenant_id: HEIRLOOM_TENANT_ID, name: null },
    })

    await linkInvitedMember('clerk-1', RAW_EMAIL, null, null)

    const output = capture.text()
    capture.restore()

    expect(output).not.toContain(RAW_EMAIL)
    expect(output).toContain('[members] linkInvitedMember — called')
    expect(output).toContain('[members] linkInvitedMember — found invited row via email')
    expect(output).toContain('[members] linkInvitedMember — SUCCESS: stamped invited row')
  })

  it('never logs the raw email when no matching invited row is found', async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeLinkClient({ userRow: { id: 'user-2' }, inviteRow: null })

    const result = await linkInvitedMember('clerk-2', RAW_EMAIL, null, null)

    const output = capture.text()
    capture.restore()

    expect(result).toBe(false)
    expect(output).not.toContain(RAW_EMAIL)
    expect(output).toContain('[members] linkInvitedMember — EXIT: no matching invited row')
  })

  it('never logs the raw email in the token-lookup-skipped log line', async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeLinkClient({ userRow: { id: 'user-3' }, inviteRow: null })

    await linkInvitedMember('clerk-3', RAW_EMAIL, null, null)

    const output = capture.text()
    capture.restore()

    expect(output).not.toContain(RAW_EMAIL)
    expect(output).toContain('[members] linkInvitedMember — token lookup skipped')
  })
})

// Audit-metadata fix (audit_events is permanent storage, unlike a console
// log): MEMBER_USER_RESOLVE_FAILED's logEvent call wrote the raw email
// straight into metadata.
describe('linkInvitedMember — no raw email in audit_events metadata', () => {
  it('logs only a logSafeIdentity fingerprint for email in the MEMBER_USER_RESOLVE_FAILED metadata, with clerk_user_id for traceability', async () => {
    logEventMock.mockClear()
    adminHolder.client = makeLinkClient({
      userRow: null,
      userError: { message: 'upsert failed' },
      inviteRow: null,
    })

    const result = await linkInvitedMember('clerk-42', RAW_EMAIL, null, null)

    expect(result).toBe(false)
    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.user_resolve_failed')
    expect(arg.clerk_user_id).toBe('clerk-42')

    const metadata = arg.metadata as Record<string, unknown>
    expect(JSON.stringify(metadata)).not.toContain(RAW_EMAIL)
    const emailFingerprint = metadata.email as Record<string, unknown>
    expect(emailFingerprint.present).toBe(true)
    expect(emailFingerprint.hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('acceptInvite — D9, no raw rescued name in console output', () => {
  it('never logs the raw rescued orphan name', async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeAcceptInviteClient({
      invitedRow: { id: 'member-9', tenant_id: HEIRLOOM_TENANT_ID, name: null },
      orphanRows: [{ id: 'orphan-9', name: RAW_RESCUED_NAME }],
    })

    const result = await acceptInvite('tok', 'clerk-9', 'user-9')

    const output = capture.text()
    capture.restore()

    expect(result.ok).toBe(true)
    expect(output).not.toContain(RAW_RESCUED_NAME)
    expect(output).toContain('[acceptInvite] step 3 rescuing orphan name')
  })
})
