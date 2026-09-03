// services/crm/session.piiLogging.test.ts
//
// D9 fix: raw name/email/phone values were being written straight into
// console.log calls across persistVisitorName/Email/Phone and the marker-
// detection log lines in handleSessionFinish, plus an indirect leak via
// text_tail (the assistant text's last 300 chars, which routinely contains
// the raw marker value since markers are emitted at the very end of the
// message). Covers both the pure redaction helper and a full onFinish run
// asserting no raw PII value appears anywhere in console output.

import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))
vi.mock('@/services/auth', () => ({
  updateClerkUserFirstName: vi.fn(async () => {}),
}))

import { handleSessionFinish, redactMarkersForLog } from './session'

type Row = Record<string, unknown>

function makeAdminClient(chatSessionRow: Row, memberRow: Row | null) {
  const client = {
    from(table: string) {
      if (table === 'chat_sessions') {
        return {
          select() {
            return { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: chatSessionRow, error: null }) }) }) }
          },
          update(obj: Row) {
            return { eq: () => ({ eq: async () => { Object.assign(chatSessionRow, obj); return { error: null } } }) }
          },
        }
      }
      if (table === 'members') {
        return {
          select() {
            return { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: memberRow, error: null }) }) }) }
          },
          update(obj: Row) {
            return {
              eq: () => ({
                eq: async () => {
                  if (memberRow) Object.assign(memberRow, obj)
                  return { error: null }
                },
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    },
  }
  return client
}

const RAW_NAME = 'Priyasomethingdistinct'
const RAW_EMAIL = 'priyasomethingdistinct@example.com'
const RAW_PHONE = '+15559876543'
const OLD_NAME = 'Oldnamesomethingdistinct'
const OLD_EMAIL = 'oldemailsomethingdistinct@example.com'
const OLD_PHONE = '+15551112222'

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

describe('redactMarkersForLog', () => {
  it('redacts a [NAME:] marker value, keeping the tag and surrounding text', () => {
    expect(redactMarkersForLog('Nice to meet you! [NAME: Jane]')).toBe('Nice to meet you! [NAME: <redacted>]')
  })

  it('redacts a [EMAIL:] marker value', () => {
    expect(redactMarkersForLog('[EMAIL: jane@example.com]')).toBe('[EMAIL: <redacted>]')
  })

  it('redacts a [PHONE:] marker value', () => {
    expect(redactMarkersForLog('[PHONE: +15551234567]')).toBe('[PHONE: <redacted>]')
  })

  it('redacts all three markers when present in the same text', () => {
    const input = 'Thanks! [NAME: Jane] [EMAIL: jane@example.com] [PHONE: +15551234567]'
    const result = redactMarkersForLog(input)
    expect(result).toBe('Thanks! [NAME: <redacted>] [EMAIL: <redacted>] [PHONE: <redacted>]')
  })

  it('leaves text with no markers unchanged', () => {
    expect(redactMarkersForLog('Just an ordinary reply.')).toBe('Just an ordinary reply.')
  })
})

describe('handleSessionFinish — D9, no raw PII in any console output', () => {
  it('never logs the raw captured name/email/phone when all three markers fire on a fresh session', async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeAdminClient({ visitor_name: null, email: null, phone: null, calendar_offered: true }, null)

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: `Nice to meet you! [NAME: ${RAW_NAME}] [EMAIL: ${RAW_EMAIL}] [PHONE: ${RAW_PHONE}]`,
      usage: null,
      memberId: null,
    })

    const output = capture.text()
    capture.restore()

    expect(output).not.toContain(RAW_NAME)
    expect(output).not.toContain(RAW_EMAIL)
    expect(output).not.toContain(RAW_PHONE)
    // Sanity check the run actually reached the log lines under test, so
    // this isn't passing merely because nothing logged at all.
    expect(output).toContain('[chat/session] onFinish: name marker detected')
    expect(output).toContain('[chat/session] visitor_name written')
  })

  it('never logs the raw existing or extracted values on the already-set skip path', async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeAdminClient(
      { visitor_name: OLD_NAME, email: OLD_EMAIL, phone: OLD_PHONE, calendar_offered: true },
      null,
    )

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: `[NAME: ${RAW_NAME}] [EMAIL: ${RAW_EMAIL}] [PHONE: ${RAW_PHONE}]`,
      usage: null,
      memberId: null,
    })

    const output = capture.text()
    capture.restore()

    for (const value of [RAW_NAME, RAW_EMAIL, RAW_PHONE, OLD_NAME, OLD_EMAIL, OLD_PHONE]) {
      expect(output).not.toContain(value)
    }
    expect(output).toContain('[chat/session] email already set, skipping write')
  })

  it("redacts marker values inside the onFinish entry log's text_tail", async () => {
    const capture = captureAllConsoleOutput()
    adminHolder.client = makeAdminClient({ visitor_name: null, email: null, phone: null, calendar_offered: true }, null)

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: `Nice to meet you! [NAME: ${RAW_NAME}]`,
      usage: null,
      memberId: null,
    })

    const output = capture.text()
    capture.restore()

    expect(output).not.toContain(RAW_NAME)
    expect(output).toContain('[NAME: <redacted>]')
  })
})
