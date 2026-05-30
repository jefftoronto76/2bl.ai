import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatRelativeTime } from './time'

const NOW = new Date('2026-05-06T12:00:00.000Z')

function isoMinusMs(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('sub-60s bucket → "just now"', () => {
    it('0ms ago', () => {
      expect(formatRelativeTime(isoMinusMs(0))).toBe('just now')
    })

    it('30s ago', () => {
      expect(formatRelativeTime(isoMinusMs(30 * 1000))).toBe('just now')
    })

    it('59s ago — still just now', () => {
      expect(formatRelativeTime(isoMinusMs(59 * 1000))).toBe('just now')
    })

    it('future-dated input is treated as just now', () => {
      const future = new Date(NOW.getTime() + 60 * 1000).toISOString()
      expect(formatRelativeTime(future)).toBe('just now')
    })
  })

  describe('minute bucket', () => {
    it('60s → 1m ago', () => {
      expect(formatRelativeTime(isoMinusMs(60 * 1000))).toBe('1m ago')
    })

    it('5m ago', () => {
      expect(formatRelativeTime(isoMinusMs(5 * 60 * 1000))).toBe('5m ago')
    })

    it('59m ago — still minutes', () => {
      expect(formatRelativeTime(isoMinusMs(59 * 60 * 1000))).toBe('59m ago')
    })
  })

  describe('hour bucket', () => {
    it('60m → 1h ago', () => {
      expect(formatRelativeTime(isoMinusMs(60 * 60 * 1000))).toBe('1h ago')
    })

    it('12h ago', () => {
      expect(formatRelativeTime(isoMinusMs(12 * 60 * 60 * 1000))).toBe('12h ago')
    })

    it('23h ago — still hours', () => {
      expect(formatRelativeTime(isoMinusMs(23 * 60 * 60 * 1000))).toBe('23h ago')
    })
  })

  describe('day bucket', () => {
    it('24h → 1d ago', () => {
      expect(formatRelativeTime(isoMinusMs(24 * 60 * 60 * 1000))).toBe('1d ago')
    })

    it('2d ago', () => {
      expect(formatRelativeTime(isoMinusMs(2 * 24 * 60 * 60 * 1000))).toBe('2d ago')
    })

    it('6d ago — still days', () => {
      expect(formatRelativeTime(isoMinusMs(6 * 24 * 60 * 60 * 1000))).toBe('6d ago')
    })
  })

  describe('week bucket', () => {
    it('7d → 1w ago', () => {
      expect(formatRelativeTime(isoMinusMs(7 * 24 * 60 * 60 * 1000))).toBe('1w ago')
    })

    it('3w ago', () => {
      expect(formatRelativeTime(isoMinusMs(21 * 24 * 60 * 60 * 1000))).toBe('3w ago')
    })

    it('27d (just under 4w) — still weeks', () => {
      expect(formatRelativeTime(isoMinusMs(27 * 24 * 60 * 60 * 1000))).toBe('3w ago')
    })
  })

  describe('month bucket', () => {
    it('28d → 1mo ago', () => {
      expect(formatRelativeTime(isoMinusMs(28 * 24 * 60 * 60 * 1000))).toBe('1mo ago')
    })

    it('6mo ago', () => {
      expect(formatRelativeTime(isoMinusMs(6 * 28 * 24 * 60 * 60 * 1000))).toBe('6mo ago')
    })

    it('364d — still months (under 365d threshold)', () => {
      expect(formatRelativeTime(isoMinusMs(364 * 24 * 60 * 60 * 1000))).toBe('13mo ago')
    })
  })

  describe('year bucket', () => {
    it('365d → 1y ago', () => {
      expect(formatRelativeTime(isoMinusMs(365 * 24 * 60 * 60 * 1000))).toBe('1y ago')
    })

    it('3y ago', () => {
      expect(formatRelativeTime(isoMinusMs(3 * 365 * 24 * 60 * 60 * 1000))).toBe('3y ago')
    })
  })

  describe('invalid / empty input', () => {
    it('empty string returns ""', () => {
      expect(formatRelativeTime('')).toBe('')
    })

    it('null returns ""', () => {
      expect(formatRelativeTime(null)).toBe('')
    })

    it('undefined returns ""', () => {
      expect(formatRelativeTime(undefined)).toBe('')
    })

    it('garbage string returns ""', () => {
      expect(formatRelativeTime('not-a-date')).toBe('')
    })
  })

  describe('input shapes', () => {
    it('accepts a Date instance', () => {
      const d = new Date(NOW.getTime() - 5 * 60 * 1000)
      expect(formatRelativeTime(d)).toBe('5m ago')
    })

    it('accepts ISO with explicit offset', () => {
      // 2 hours before NOW, expressed in +05:00 timezone
      const localStr = '2026-05-06T15:00:00+05:00' // == 10:00:00Z
      expect(formatRelativeTime(localStr)).toBe('2h ago')
    })
  })
})
