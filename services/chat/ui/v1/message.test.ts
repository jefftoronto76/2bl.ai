import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  normalizeTimestamp,
  createUIMessage,
  reviveUIMessage,
  reviveUIMessages,
  toChatMessage,
  toChatMessages,
} from './message'
import type { UIMessage } from './types'

// A fixed clock so the Date.now() fallback + default-timestamp paths are
// deterministic. 2026-05-29T12:00:00.000Z.
const NOW = 1_780_056_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('normalizeTimestamp', () => {
  it('passes a finite epoch-ms number through unchanged', () => {
    expect(normalizeTimestamp(1_716_854_400_000)).toBe(1_716_854_400_000)
    expect(normalizeTimestamp(0)).toBe(0)
  })

  it('converts a Date to epoch milliseconds', () => {
    const d = new Date('2026-05-28T00:00:00.000Z')
    expect(normalizeTimestamp(d)).toBe(d.getTime())
  })

  it('parses an ISO 8601 string (the Heirloom persisted shape)', () => {
    expect(normalizeTimestamp('2026-05-28T00:00:00.000Z')).toBe(
      Date.parse('2026-05-28T00:00:00.000Z'),
    )
  })

  it('parses a bare epoch-ms string that Date.parse would reject', () => {
    expect(normalizeTimestamp('1716854400000')).toBe(1_716_854_400_000)
  })

  it('falls back to now() for missing input', () => {
    expect(normalizeTimestamp(undefined)).toBe(NOW)
    expect(normalizeTimestamp(null)).toBe(NOW)
  })

  it('falls back to now() for unparseable strings and non-finite numbers', () => {
    expect(normalizeTimestamp('not a date')).toBe(NOW)
    expect(normalizeTimestamp(NaN)).toBe(NOW)
    expect(normalizeTimestamp(Infinity)).toBe(NOW)
  })

  it('falls back to now() for an invalid Date', () => {
    expect(normalizeTimestamp(new Date('nope'))).toBe(NOW)
  })
})

describe('createUIMessage', () => {
  it('builds a canonical message with a generated id and now() timestamp', () => {
    const m = createUIMessage('user', 'hello')
    expect(m.role).toBe('user')
    expect(m.content).toBe('hello')
    expect(m.timestamp).toBe(NOW)
    expect(typeof m.id).toBe('string')
    expect(m.id.length).toBeGreaterThan(0)
  })

  it('honors id and timestamp overrides', () => {
    const m = createUIMessage('assistant', 'hi', { id: 'fixed-id', timestamp: 123 })
    expect(m.id).toBe('fixed-id')
    expect(m.timestamp).toBe(123)
  })

  it('generates distinct ids across calls', () => {
    expect(createUIMessage('user', 'a').id).not.toBe(createUIMessage('user', 'b').id)
  })
})

describe('reviveUIMessage', () => {
  it('revives a legacy jefflougheed shape (numeric timestamp)', () => {
    const m = reviveUIMessage({ id: 'a', role: 'user', content: 'hey', timestamp: 1_716_854_400_000 })
    expect(m).toEqual({ id: 'a', role: 'user', content: 'hey', timestamp: 1_716_854_400_000, error_type: null })
  })

  it('revives a legacy Heirloom shape (ISO-string timestamp)', () => {
    const m = reviveUIMessage({
      id: 'b',
      role: 'assistant',
      content: 'sure',
      timestamp: '2026-05-28T00:00:00.000Z',
    })
    expect(m.timestamp).toBe(Date.parse('2026-05-28T00:00:00.000Z'))
    expect(m.role).toBe('assistant')
  })

  it('coerces a missing id to a fresh uuid', () => {
    const m = reviveUIMessage({ role: 'user', content: 'x' })
    expect(typeof m.id).toBe('string')
    expect(m.id.length).toBeGreaterThan(0)
  })

  it('defaults an absent/invalid role to assistant and missing content to empty', () => {
    const m = reviveUIMessage({ id: 'c' })
    expect(m.role).toBe('assistant')
    expect(m.content).toBe('')
    expect(m.timestamp).toBe(NOW)
  })

  it('defaults timestamp to now() when absent', () => {
    expect(reviveUIMessage({ id: 'd', role: 'user', content: 'q' }).timestamp).toBe(NOW)
  })

  it('tolerates null / non-object input', () => {
    const m = reviveUIMessage(null)
    expect(m.role).toBe('assistant')
    expect(m.content).toBe('')
  })

  it('revives a valid persisted error_type', () => {
    const m = reviveUIMessage({ id: 'e', role: 'user', content: 'x', error_type: 'rate_limited' })
    expect(m.error_type).toBe('rate_limited')
  })

  it('discards an invalid/missing error_type as null', () => {
    expect(reviveUIMessage({ id: 'f', role: 'user', content: 'x', error_type: 'bogus' }).error_type).toBeNull()
    expect(reviveUIMessage({ id: 'g', role: 'user', content: 'x' }).error_type).toBeNull()
  })

  it('revives a valid stopped flag', () => {
    expect(reviveUIMessage({ id: 'h', role: 'assistant', content: 'cut off', stopped: true }).stopped).toBe(true)
    expect(reviveUIMessage({ id: 'i', role: 'assistant', content: 'ok', stopped: false }).stopped).toBe(false)
  })

  it('leaves stopped absent when missing or malformed', () => {
    expect(reviveUIMessage({ id: 'j', role: 'assistant', content: 'x' }).stopped).toBeUndefined()
    expect(reviveUIMessage({ id: 'k', role: 'assistant', content: 'x', stopped: 'yes' }).stopped).toBeUndefined()
  })

  it('revives a valid status and discards an invalid one', () => {
    expect(reviveUIMessage({ id: 'l', role: 'user', content: 'x', status: 'failed' }).status).toBe('failed')
    expect(reviveUIMessage({ id: 'm', role: 'user', content: 'x', status: 'bogus' }).status).toBeUndefined()
    expect(reviveUIMessage({ id: 'n', role: 'user', content: 'x' }).status).toBeUndefined()
  })

  it('revives a well-formed versions array and discards a malformed one', () => {
    expect(reviveUIMessage({ id: 'o', role: 'assistant', content: 'v2', versions: ['v0', 'v1'] }).versions).toEqual([
      'v0',
      'v1',
    ])
    expect(
      reviveUIMessage({ id: 'p', role: 'assistant', content: 'x', versions: ['ok', 42] }).versions,
    ).toBeUndefined()
    expect(reviveUIMessage({ id: 'q', role: 'assistant', content: 'x', versions: 'nope' }).versions).toBeUndefined()
  })

  it('revives a numeric versionIdx and discards a non-numeric one', () => {
    expect(reviveUIMessage({ id: 'r', role: 'assistant', content: 'x', versionIdx: 1 }).versionIdx).toBe(1)
    expect(
      reviveUIMessage({ id: 's', role: 'assistant', content: 'x', versionIdx: 'one' }).versionIdx,
    ).toBeUndefined()
    expect(reviveUIMessage({ id: 't', role: 'assistant', content: 'x', versionIdx: NaN }).versionIdx).toBeUndefined()
  })
})

describe('reviveUIMessages', () => {
  it('revives an array of mixed-shape rows', () => {
    const out = reviveUIMessages([
      { id: 'a', role: 'user', content: 'hi', timestamp: 1_716_854_400_000 },
      { id: 'b', role: 'assistant', content: 'yo', timestamp: '2026-05-28T00:00:00.000Z' },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].timestamp).toBe(1_716_854_400_000)
    expect(out[1].timestamp).toBe(Date.parse('2026-05-28T00:00:00.000Z'))
  })

  it('returns an empty array for non-array input', () => {
    expect(reviveUIMessages(undefined)).toEqual([])
    expect(reviveUIMessages(null)).toEqual([])
    expect(reviveUIMessages('nope')).toEqual([])
  })
})

describe('toChatMessage / toChatMessages', () => {
  const ui: UIMessage = { id: 'x', role: 'user', content: 'hello', timestamp: NOW }

  it('strips id and timestamp to the wire shape', () => {
    expect(toChatMessage(ui)).toEqual({ role: 'user', content: 'hello' })
  })

  it('maps an array to wire shapes', () => {
    const out = toChatMessages([ui, { id: 'y', role: 'assistant', content: 'hi', timestamp: NOW }])
    expect(out).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })

  it('round-trips revive → toChatMessage for a legacy row', () => {
    const revived = reviveUIMessage({ id: 'z', role: 'user', content: 'q', timestamp: '2026-05-28T00:00:00.000Z' })
    expect(toChatMessage(revived)).toEqual({ role: 'user', content: 'q' })
  })
})
