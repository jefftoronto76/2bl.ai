import { describe, it, expect } from 'vitest'
import {
  detectVisitorNameMarker,
  detectVisitorEmailMarker,
  detectEmailInText,
  detectPhoneInText,
} from './session'

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

describe('detectVisitorEmailMarker — server-side [EMAIL:] detection', () => {
  it('extracts an email from a marker', () => {
    expect(detectVisitorEmailMarker('[EMAIL: sam@example.com]')).toBe('sam@example.com')
  })

  it('extracts an email embedded in surrounding prose', () => {
    expect(detectVisitorEmailMarker("I'll follow up. [EMAIL: Sarah@Work.io]")).toBe('sarah@work.io')
  })

  it('lowercases the captured email', () => {
    expect(detectVisitorEmailMarker('[EMAIL: RON@EXAMPLE.COM]')).toBe('ron@example.com')
  })

  it('returns null when no marker is present', () => {
    expect(detectVisitorEmailMarker('What brings you here today?')).toBeNull()
  })

  it('returns null for an empty marker', () => {
    expect(detectVisitorEmailMarker('[EMAIL: ]')).toBeNull()
  })

  it('rejects a value with no @', () => {
    expect(detectVisitorEmailMarker('[EMAIL: notanemail]')).toBeNull()
  })

  it('rejects a value with no dotted domain', () => {
    expect(detectVisitorEmailMarker('[EMAIL: sam@localhost]')).toBeNull()
  })

  it('rejects a value with internal whitespace', () => {
    expect(detectVisitorEmailMarker('[EMAIL: sam @example.com]')).toBeNull()
  })

  it('rejects the EMPTY sentinel echoed into a marker', () => {
    expect(detectVisitorEmailMarker('[EMAIL: EMPTY]')).toBeNull()
  })
})

describe('detectEmailInText — free-text visitor email watcher', () => {
  it('extracts a bare email', () => {
    expect(detectEmailInText('sam@example.com')).toBe('sam@example.com')
  })

  it('extracts an email embedded in prose', () => {
    expect(detectEmailInText("Sure, it's Sarah@Work.io if you need it")).toBe('sarah@work.io')
  })

  it('lowercases the captured email', () => {
    expect(detectEmailInText('RON@EXAMPLE.COM')).toBe('ron@example.com')
  })

  it('strips trailing sentence punctuation', () => {
    expect(detectEmailInText('Reach me at sam@example.com.')).toBe('sam@example.com')
  })

  it('returns null when no email is present', () => {
    expect(detectEmailInText('What brings you here today?')).toBeNull()
  })

  it('returns null for a value with no dotted domain', () => {
    expect(detectEmailInText('ping me at sam@localhost')).toBeNull()
  })
})

describe('detectPhoneInText — free-text visitor phone watcher', () => {
  it('normalizes a bare 10-digit NANP number to E.164', () => {
    expect(detectPhoneInText('5551234567')).toBe('+15551234567')
  })

  it('extracts a formatted number from prose', () => {
    expect(detectPhoneInText('Call me at (555) 123-4567 anytime')).toBe('+15551234567')
  })

  it('keeps an 11-digit leading-1 number', () => {
    expect(detectPhoneInText('1-555-123-4567')).toBe('+15551234567')
  })

  it('treats a leading + as already international', () => {
    expect(detectPhoneInText('my number is +44 20 7946 0958')).toBe('+442079460958')
  })

  it('returns null when no phone is present', () => {
    expect(detectPhoneInText('What brings you here today?')).toBeNull()
  })

  it('returns null for too few digits', () => {
    expect(detectPhoneInText('I have 12345 reasons')).toBeNull()
  })
})
