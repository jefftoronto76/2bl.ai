import { describe, it, expect } from 'vitest'
import { createMarkerRegistry, BOOKING_MARKER } from './registry'

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
