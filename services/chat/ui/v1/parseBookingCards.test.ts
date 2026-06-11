import { describe, it, expect } from 'vitest'
import { parseBookingCards } from './parseBookingCards'

describe('parseBookingCards', () => {
  it('preserves the legacy { prose, cards } shape for BOOKING markers', () => {
    const { prose, cards } = parseBookingCards(
      'Here you go.\n[BOOKING: Intro Call | A quick chat | Book now | https://x.com]',
    )
    expect(prose).toBe('Here you go.')
    expect(cards).toEqual([
      {
        label: 'Intro Call',
        description: 'A quick chat',
        ctaLabel: 'Book now',
        url: 'https://x.com',
      },
    ])
  })

  it('returns all parsed markers, including non-BOOKING ones not surfaced as cards', () => {
    const { prose, cards, markers } = parseBookingCards(
      'Nice to meet you, Sam. [NAME: Sam]\n[BOOKING: Intro | chat | Book | https://x.com]',
    )
    expect(prose).toBe('Nice to meet you, Sam.')
    expect(cards).toHaveLength(1)
    expect(markers.map(m => m.type).sort()).toEqual(['BOOKING', 'NAME'])
    const name = markers.find(m => m.type === 'NAME')
    expect(name?.fields).toEqual(['Sam'])
    expect(name?.raw).toBe('[NAME: Sam]')
  })

  it('returns empty markers and cards for plain prose', () => {
    const { prose, cards, markers } = parseBookingCards('Just words.')
    expect(prose).toBe('Just words.')
    expect(cards).toEqual([])
    expect(markers).toEqual([])
  })
})
