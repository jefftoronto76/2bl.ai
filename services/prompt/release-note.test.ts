import { describe, it, expect } from 'vitest'
import { SUMMARY_MAX, changedSince, suggestSummary, parseNote, type ChangedBlock } from './release-note'

function block(overrides: Partial<ChangedBlock> = {}): ChangedBlock {
  return {
    id: 'block-1',
    title: 'Untitled',
    type: 'identity',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('changedSince', () => {
  it('returns every block when lastCompiledAt is null (never compiled)', () => {
    const blocks = [block({ id: 'a' }), block({ id: 'b', updated_at: null })]
    expect(changedSince(blocks, null)).toEqual(blocks)
  })

  it('filters to blocks updated after lastCompiledAt', () => {
    const older = block({ id: 'older', updated_at: '2026-06-01T00:00:00.000Z' })
    const newer = block({ id: 'newer', updated_at: '2026-07-15T00:00:00.000Z' })
    const result = changedSince([older, newer], '2026-07-01T00:00:00.000Z')
    expect(result).toEqual([newer])
  })

  it('excludes a block with no updated_at', () => {
    const noTimestamp = block({ id: 'no-ts', updated_at: null })
    expect(changedSince([noTimestamp], '2026-07-01T00:00:00.000Z')).toEqual([])
  })

  it('returns empty array when nothing changed since the cut-off', () => {
    const b = block({ updated_at: '2026-06-01T00:00:00.000Z' })
    expect(changedSince([b], '2026-07-01T00:00:00.000Z')).toEqual([])
  })
})

describe('suggestSummary', () => {
  it('returns empty string for no changed blocks', () => {
    expect(suggestSummary([])).toBe('')
  })

  it('single type: "Update <type>"', () => {
    expect(suggestSummary([block({ type: 'guardrail' })])).toBe('Update guardrail')
  })

  it('two types joined with "and"', () => {
    const changed = [block({ type: 'identity' }), block({ id: 'b', type: 'guardrail' })]
    expect(suggestSummary(changed)).toBe('Update identity and guardrail')
  })

  it('more than two distinct types: comma list + "and" before the last', () => {
    const changed = [
      block({ id: 'a', type: 'identity' }),
      block({ id: 'b', type: 'guardrail' }),
      block({ id: 'c', type: 'knowledge' }),
    ]
    expect(suggestSummary(changed)).toBe('Update identity, guardrail and knowledge')
  })

  it('de-duplicates repeated types', () => {
    const changed = [
      block({ id: 'a', type: 'identity' }),
      block({ id: 'b', type: 'identity' }),
    ]
    expect(suggestSummary(changed)).toBe('Update identity')
  })
})

describe('parseNote', () => {
  it('parses a valid note with all fields', () => {
    const result = parseNote({ summary: 'Tighten escalation', why: 'Billing disputes', changed_block_ids: ['a', 'b'] })
    expect(result).toEqual({ summary: 'Tighten escalation', why: 'Billing disputes', changed_block_ids: ['a', 'b'] })
  })

  it('trims summary and why', () => {
    const result = parseNote({ summary: '  Tighten escalation  ', why: '  context  ' })
    expect(result?.summary).toBe('Tighten escalation')
    expect(result?.why).toBe('context')
  })

  it('defaults why to empty string when omitted', () => {
    const result = parseNote({ summary: 'Update guardrails' })
    expect(result?.why).toBe('')
  })

  it('defaults changed_block_ids to [] when omitted', () => {
    const result = parseNote({ summary: 'Update guardrails' })
    expect(result?.changed_block_ids).toEqual([])
  })

  it('filters non-string entries out of changed_block_ids', () => {
    const result = parseNote({ summary: 'Update guardrails', changed_block_ids: ['a', 42, null, 'b'] })
    expect(result?.changed_block_ids).toEqual(['a', 'b'])
  })

  it('rejects a missing summary', () => {
    expect(parseNote({})).toBeNull()
  })

  it('rejects an empty-after-trim summary', () => {
    expect(parseNote({ summary: '   ' })).toBeNull()
  })

  it('rejects a summary over SUMMARY_MAX chars', () => {
    const tooLong = 'x'.repeat(SUMMARY_MAX + 1)
    expect(parseNote({ summary: tooLong })).toBeNull()
  })

  it('accepts a summary exactly at SUMMARY_MAX chars', () => {
    const exact = 'x'.repeat(SUMMARY_MAX)
    expect(parseNote({ summary: exact })?.summary).toBe(exact)
  })

  it('rejects a non-object body', () => {
    expect(parseNote(null)).toBeNull()
    expect(parseNote('a string')).toBeNull()
    expect(parseNote(undefined)).toBeNull()
  })

  it('rejects a non-string summary', () => {
    expect(parseNote({ summary: 42 })).toBeNull()
  })
})
