import { describe, it, expect } from 'vitest'
import {
  createMarkerRegistry,
  createDefaultRegistry,
  BOOKING_MARKER,
  NAME_MARKER,
  EMAIL_MARKER,
  PHONE_MARKER,
} from './registry'

function bookingRegistry() {
  const r = createMarkerRegistry()
  r.register(BOOKING_MARKER)
  return r
}

describe('MarkerRegistry — BOOKING parity with legacy parseBookingCards', () => {
  it('extracts a single booking card and strips it from prose', () => {
    const r = bookingRegistry()
    const { prose, markers } = r.parse(
      'Here you go.\n[BOOKING: Intro Call | A quick chat | Book now | https://x.com]',
    )
    expect(prose).toBe('Here you go.')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toEqual({
      type: 'BOOKING',
      fields: ['Intro Call', 'A quick chat', 'Book now', 'https://x.com'],
      raw: '[BOOKING: Intro Call | A quick chat | Book now | https://x.com]',
    })
  })

  it('trims each field', () => {
    const r = bookingRegistry()
    const { markers } = r.parse('[BOOKING:   Label  |  Desc |  CTA  |  https://u  ]')
    expect(markers[0].fields).toEqual(['Label', 'Desc', 'CTA', 'https://u'])
  })

  it('extracts multiple cards and clears the prose', () => {
    const r = bookingRegistry()
    const { prose, markers } = r.parse('[BOOKING: A | a | x | u1]\n[BOOKING: B | b | y | u2]')
    expect(markers).toHaveLength(2)
    expect(markers.map(m => m.fields[0])).toEqual(['A', 'B'])
    expect(prose).toBe('')
  })

  it('keeps prose before a complete card and strips a trailing incomplete fragment', () => {
    const r = bookingRegistry()
    const { prose, markers } = r.parse(
      'Done.\n[BOOKING: A | a | x | u1]\nMore.\n[BOOKING: still streaming',
    )
    expect(markers).toHaveLength(1)
    expect(prose).toBe('Done.\n\nMore.')
  })

  it('strips a trailing incomplete fragment with no completed cards', () => {
    const r = bookingRegistry()
    const { prose, markers } = r.parse('Sure thing.\n[BOOKING: partial still streaming')
    expect(markers).toHaveLength(0)
    expect(prose).toBe('Sure thing.')
  })

  it('collapses 3+ blank lines and trims', () => {
    const r = bookingRegistry()
    const { prose } = r.parse('\n\nHello\n\n\n\nWorld\n\n')
    expect(prose).toBe('Hello\n\nWorld')
  })

  it('leaves prose without markers unchanged (trimmed)', () => {
    const r = bookingRegistry()
    const { prose, markers } = r.parse('  Just text.  ')
    expect(markers).toHaveLength(0)
    expect(prose).toBe('Just text.')
  })
})

describe('MarkerRegistry — registration', () => {
  it('getDefinitions returns the registered BOOKING definition', () => {
    const r = bookingRegistry()
    const defs = r.getDefinitions()
    expect(defs).toHaveLength(1)
    expect(defs[0].type).toBe('BOOKING')
    expect(defs[0].dispatch).toBe('client')
    expect(defs[0].fieldCount).toBe(4)
  })

  it('re-registering the same type replaces rather than duplicates', () => {
    const r = bookingRegistry()
    r.register(BOOKING_MARKER)
    expect(r.getDefinitions()).toHaveLength(1)
  })

  it('getDefinitions returns a copy (callers cannot mutate internal state)', () => {
    const r = bookingRegistry()
    r.getDefinitions().pop()
    expect(r.getDefinitions()).toHaveLength(1)
  })
})

describe('NAME_MARKER definition', () => {
  it('is a single-field server-dispatch marker', () => {
    expect(NAME_MARKER.type).toBe('NAME')
    expect(NAME_MARKER.fieldCount).toBe(1)
    expect(NAME_MARKER.dispatch).toBe('server')
  })
})

describe('EMAIL_MARKER definition', () => {
  it('is a single-field server-dispatch marker', () => {
    expect(EMAIL_MARKER.type).toBe('EMAIL')
    expect(EMAIL_MARKER.fieldCount).toBe(1)
    expect(EMAIL_MARKER.dispatch).toBe('server')
  })
})

describe('PHONE_MARKER definition', () => {
  it('is a single-field server-dispatch marker', () => {
    expect(PHONE_MARKER.type).toBe('PHONE')
    expect(PHONE_MARKER.fieldCount).toBe(1)
    expect(PHONE_MARKER.dispatch).toBe('server')
  })
})

describe('createDefaultRegistry — NAME/EMAIL/PHONE stripping + BOOKING coexistence', () => {
  it('registers BOOKING, NAME, EMAIL, and PHONE', () => {
    const defs = createDefaultRegistry().getDefinitions()
    expect(defs.map(d => d.type).sort()).toEqual(['BOOKING', 'EMAIL', 'NAME', 'PHONE'])
  })

  it('strips a [NAME: x] marker from prose and extracts the field', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse('Nice to meet you, Sam. [NAME: Sam]')
    expect(prose).toBe('Nice to meet you, Sam.')
    const name = markers.find(m => m.type === 'NAME')
    expect(name).toBeDefined()
    expect(name?.fields).toEqual(['Sam'])
  })

  it('strips a trailing incomplete [NAME: fragment mid-stream', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse('Got it.\n[NAME: Sam')
    expect(markers.filter(m => m.type === 'NAME')).toHaveLength(0)
    expect(prose).toBe('Got it.')
  })

  it('strips NAME and BOOKING from the same message', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse(
      'Hi Sam. [NAME: Sam]\n[BOOKING: Intro | chat | Book | https://x.com]',
    )
    expect(prose).toBe('Hi Sam.')
    expect(markers.map(m => m.type).sort()).toEqual(['BOOKING', 'NAME'])
  })

  it('strips an [EMAIL: x] marker from prose and extracts the field', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse("Thanks! I'll reach out. [EMAIL: sam@example.com]")
    expect(prose).toBe("Thanks! I'll reach out.")
    const email = markers.find(m => m.type === 'EMAIL')
    expect(email).toBeDefined()
    expect(email?.fields).toEqual(['sam@example.com'])
  })

  it('strips a trailing incomplete [EMAIL: fragment mid-stream', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse('Got it.\n[EMAIL: sam@')
    expect(markers.filter(m => m.type === 'EMAIL')).toHaveLength(0)
    expect(prose).toBe('Got it.')
  })

  it('strips a [PHONE: x] marker from prose and extracts the field', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse("Perfect, I'll text you. [PHONE: +1 555 123 4567]")
    expect(prose).toBe("Perfect, I'll text you.")
    const phone = markers.find(m => m.type === 'PHONE')
    expect(phone).toBeDefined()
    expect(phone?.fields).toEqual(['+1 555 123 4567'])
  })

  it('strips a trailing incomplete [PHONE: fragment mid-stream', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse('Got it.\n[PHONE: +1 555')
    expect(markers.filter(m => m.type === 'PHONE')).toHaveLength(0)
    expect(prose).toBe('Got it.')
  })

  it('strips NAME, EMAIL, and BOOKING from the same message', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse(
      'Hi Sam. [NAME: Sam] [EMAIL: sam@example.com]\n[BOOKING: Intro | chat | Book | https://x.com]',
    )
    expect(prose).toBe('Hi Sam.')
    expect(markers.map(m => m.type).sort()).toEqual(['BOOKING', 'EMAIL', 'NAME'])
  })

  it('strips NAME, EMAIL, PHONE, and BOOKING from the same message', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse(
      'Hi Sam. [NAME: Sam] [EMAIL: sam@example.com] [PHONE: +15551234567]\n[BOOKING: Intro | chat | Book | https://x.com]',
    )
    expect(prose).toBe('Hi Sam.')
    expect(markers.map(m => m.type).sort()).toEqual(['BOOKING', 'EMAIL', 'NAME', 'PHONE'])
  })
})
