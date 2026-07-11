import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isStalled } from './LinkTimeline'
import type { InviteLink } from './types'

const NOW = new Date('2026-07-11T12:00:00.000Z')

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function makeInvite(overrides: Partial<InviteLink> = {}): InviteLink {
  return {
    token: 'tok_abc',
    reached: 'sent',
    sentAt: daysAgoIso(10),
    openedAt: null,
    acceptedAt: null,
    opens: 0,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }
}

describe('isStalled', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false when opened less than INVITE_STALL_DAYS ago', () => {
    const invite = makeInvite({ reached: 'opened', openedAt: daysAgoIso(1) })
    expect(isStalled(invite)).toBe(false)
  })

  it('returns true when opened at least INVITE_STALL_DAYS ago and not accepted', () => {
    const invite = makeInvite({ reached: 'opened', openedAt: daysAgoIso(3) })
    expect(isStalled(invite)).toBe(true)
  })

  it('returns false when the invite has been revoked, regardless of open age', () => {
    const invite = makeInvite({
      reached: 'opened',
      openedAt: daysAgoIso(10),
      revokedAt: daysAgoIso(1),
    })
    expect(isStalled(invite)).toBe(false)
  })

  it('returns false once the invite has been accepted', () => {
    const invite = makeInvite({
      reached: 'accepted',
      openedAt: daysAgoIso(10),
      acceptedAt: daysAgoIso(1),
    })
    expect(isStalled(invite)).toBe(false)
  })

  it('returns false when reached is still "sent" (never opened)', () => {
    const invite = makeInvite({ reached: 'sent' })
    expect(isStalled(invite)).toBe(false)
  })
})
