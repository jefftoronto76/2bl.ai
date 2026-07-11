import { describe, it, expect } from 'vitest'
import { toInviteLink, inviteUrlFor, type InviteLinkRow } from './inviteLink'

function makeRow(overrides: Partial<InviteLinkRow> = {}): InviteLinkRow {
  return {
    token: 'tok_abc123',
    created_at: '2026-07-01T00:00:00.000Z',
    used_at: null,
    opened_at: null,
    opens: 0,
    revoked_at: null,
    expires_at: null,
    ...overrides,
  }
}

describe('toInviteLink', () => {
  it('returns null when token is null', () => {
    expect(toInviteLink(makeRow({ token: null }))).toBeNull()
  })

  it('derives reached = "sent" when neither opened_at nor used_at is set', () => {
    const invite = toInviteLink(makeRow())
    expect(invite?.reached).toBe('sent')
    expect(invite?.openedAt).toBeNull()
    expect(invite?.acceptedAt).toBeNull()
  })

  it('derives reached = "opened" when opened_at is set but used_at is not', () => {
    const invite = toInviteLink(makeRow({ opened_at: '2026-07-02T00:00:00.000Z', opens: 3 }))
    expect(invite?.reached).toBe('opened')
    expect(invite?.openedAt).toBe('2026-07-02T00:00:00.000Z')
    expect(invite?.opens).toBe(3)
    expect(invite?.acceptedAt).toBeNull()
  })

  it('derives reached = "accepted" when used_at is set, regardless of opened_at', () => {
    const invite = toInviteLink(
      makeRow({ opened_at: '2026-07-02T00:00:00.000Z', used_at: '2026-07-03T00:00:00.000Z' })
    )
    expect(invite?.reached).toBe('accepted')
    expect(invite?.acceptedAt).toBe('2026-07-03T00:00:00.000Z')
  })

  it('passes revokedAt through unchanged', () => {
    const invite = toInviteLink(makeRow({ revoked_at: '2026-07-04T00:00:00.000Z' }))
    expect(invite?.revokedAt).toBe('2026-07-04T00:00:00.000Z')
  })

  it('passes expiresAt through unchanged', () => {
    const invite = toInviteLink(makeRow({ expires_at: '2026-07-15T00:00:00.000Z' }))
    expect(invite?.expiresAt).toBe('2026-07-15T00:00:00.000Z')
  })

  it('defaults opens to 0 when null', () => {
    const invite = toInviteLink(makeRow({ opens: null }))
    expect(invite?.opens).toBe(0)
  })
})

describe('inviteUrlFor', () => {
  it('uses the tenant domain when present', () => {
    expect(inviteUrlFor('tok_abc', 'heirloom.2bl.ai', 'https://admin.2bl.ai')).toBe(
      'https://heirloom.2bl.ai/invite/tok_abc'
    )
  })

  it('falls back to origin when domain is absent', () => {
    expect(inviteUrlFor('tok_abc', null, 'https://admin.2bl.ai')).toBe(
      'https://admin.2bl.ai/invite/tok_abc'
    )
  })

  it('falls back to origin when domain is undefined', () => {
    expect(inviteUrlFor('tok_abc', undefined, 'https://admin.2bl.ai')).toBe(
      'https://admin.2bl.ai/invite/tok_abc'
    )
  })
})
