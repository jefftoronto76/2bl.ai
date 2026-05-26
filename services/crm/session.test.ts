import { describe, it, expect } from 'vitest'
import { detectVisitorNameMarker } from './session'

describe('detectVisitorNameMarker — server-side [NAME:] detection', () => {
  it('extracts and titlecases a name from a marker', () => {
    expect(detectVisitorNameMarker('[NAME: ronald]')).toBe('Ronald')
  })

  it('extracts a name embedded in surrounding prose', () => {
    expect(detectVisitorNameMarker('Lovely to meet you! [NAME: Sarah]')).toBe('Sarah')
  })

  it('preserves an already-titlecased name', () => {
    expect(detectVisitorNameMarker('[NAME: Sam]')).toBe('Sam')
  })

  it('returns null when no marker is present', () => {
    expect(detectVisitorNameMarker('What brings you here today?')).toBeNull()
  })

  it('returns null for an empty marker', () => {
    expect(detectVisitorNameMarker('[NAME: ]')).toBeNull()
  })

  it('rejects an implausible single-character name', () => {
    expect(detectVisitorNameMarker('[NAME: x]')).toBeNull()
  })

  it('rejects a multi-word value (shape check fails after titlecasing)', () => {
    // "[NAME: firstname]" is a first name only; a space fails isPlausibleName,
    // so detection falls through to the Haiku fallback at the call site.
    expect(detectVisitorNameMarker('[NAME: John Smith]')).toBeNull()
  })

  it('rejects the EMPTY sentinel echoed into a marker', () => {
    expect(detectVisitorNameMarker('[NAME: EMPTY]')).toBeNull()
  })
})
