import { describe, it, expect } from 'vitest'
import {
  createMarkerRegistry,
  createDefaultRegistry,
  BOOKING_MARKER,
  NAME_MARKER,
  EMAIL_MARKER,
  PHONE_MARKER,
  ACCOUNT_CREATE_MARKER,
  SAVE_MEMORY_MARKER,
  MEMORY_TITLE_MARKER,
  MEDIA_UPLOAD_MARKER,
  MEDIA_UPLOAD_FAILED_MARKER,
  MEDIA_UPLOAD_DUPLICATE_MARKER,
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

describe('ACCOUNT_CREATE_MARKER definition', () => {
  it('is a single-field client-dispatch marker', () => {
    expect(ACCOUNT_CREATE_MARKER.type).toBe('ACCOUNT_CREATE')
    expect(ACCOUNT_CREATE_MARKER.fieldCount).toBe(1)
    expect(ACCOUNT_CREATE_MARKER.dispatch).toBe('client')
  })
})

describe('SAVE_MEMORY_MARKER definition', () => {
  it('is a bare, zero-field client-dispatch marker — confirmed against the live prompt, unlike every other single-value marker here', () => {
    expect(SAVE_MEMORY_MARKER.type).toBe('SAVE_MEMORY')
    expect(SAVE_MEMORY_MARKER.fieldCount).toBe(0)
    expect(SAVE_MEMORY_MARKER.dispatch).toBe('client')
  })

  it('extracts a bare [SAVE_MEMORY] and strips it from prose, with no fields', () => {
    const r = createMarkerRegistry()
    r.register(SAVE_MEMORY_MARKER)
    const { prose, markers } = r.parse('That sounds like a wonderful memory. [SAVE_MEMORY]')
    expect(prose).toBe('That sounds like a wonderful memory.')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toEqual({ type: 'SAVE_MEMORY', fields: [], raw: '[SAVE_MEMORY]' })
  })

  it('never matches a colon-qualified variant — only the exact bare shape', () => {
    const r = createMarkerRegistry()
    r.register(SAVE_MEMORY_MARKER)
    const { prose, markers } = r.parse('Some reply. [SAVE_MEMORY: reason]')
    expect(markers).toHaveLength(0)
    // Not stripped either — an unrecognized bracket is left as-is, same as
    // any other non-registered marker shape.
    expect(prose).toBe('Some reply. [SAVE_MEMORY: reason]')
  })

  it('strips a trailing incomplete fragment even though the marker has no colon (regression: the shared incomplete-fragment regex used to require one)', () => {
    // The full type name has streamed in but the closing `]` hasn't yet —
    // the bare-marker equivalent of "[ACCOUNT_CREATE:" awaiting its field.
    const r = createMarkerRegistry()
    r.register(SAVE_MEMORY_MARKER)
    const { prose, markers } = r.parse('That sounds lovely. [SAVE_MEMORY')
    expect(prose).toBe('That sounds lovely.')
    expect(markers).toHaveLength(0)
  })

  it('a settled (non-streaming) message with a truncated bare marker never leaks raw bracket text', () => {
    // Simulates a stream that was interrupted right after the type name —
    // the exact case bufferMarkdown only protects while a message is still
    // actively streaming (active === true); once settled, parse()'s own
    // fragment stripping is the only remaining safety net.
    const r = createMarkerRegistry()
    r.register(SAVE_MEMORY_MARKER)
    const { prose } = r.parse('Here is what I heard. [SAVE_MEMORY')
    expect(prose).not.toContain('[')
  })

  it('existing colon-based markers are unaffected by the generalized incomplete-fragment regex', () => {
    const r = createMarkerRegistry()
    r.register(ACCOUNT_CREATE_MARKER)
    const { prose } = r.parse('Want to save your progress? [ACCOUNT_CREATE: claim_memb')
    expect(prose).toBe('Want to save your progress?')
  })
})

describe('MEMORY_TITLE_MARKER definition', () => {
  it('is a single-field server-dispatch marker', () => {
    expect(MEMORY_TITLE_MARKER.type).toBe('MEMORY_TITLE')
    expect(MEMORY_TITLE_MARKER.fieldCount).toBe(1)
    expect(MEMORY_TITLE_MARKER.dispatch).toBe('server')
  })

  it('extracts a [MEMORY_TITLE: x] marker and strips it from prose', () => {
    const r = createMarkerRegistry()
    r.register(MEMORY_TITLE_MARKER)
    const { prose, markers } = r.parse('That sounds lovely. [MEMORY_TITLE: The Lake House]')
    expect(prose).toBe('That sounds lovely.')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toEqual({ type: 'MEMORY_TITLE', fields: ['The Lake House'], raw: '[MEMORY_TITLE: The Lake House]' })
  })

  it('strips a trailing incomplete [MEMORY_TITLE: fragment mid-stream', () => {
    const r = createMarkerRegistry()
    r.register(MEMORY_TITLE_MARKER)
    const { prose, markers } = r.parse('Got it.\n[MEMORY_TITLE: The Lake')
    expect(markers).toHaveLength(0)
    expect(prose).toBe('Got it.')
  })
})

describe('MEDIA_UPLOAD_MARKER definition', () => {
  it('is a three-field client-dispatch marker', () => {
    expect(MEDIA_UPLOAD_MARKER.type).toBe('MEDIA_UPLOAD')
    expect(MEDIA_UPLOAD_MARKER.fieldCount).toBe(3)
    expect(MEDIA_UPLOAD_MARKER.dispatch).toBe('client')
  })

  it('extracts a [MEDIA_UPLOAD: filename | media_item_id | type] marker and strips it from prose', () => {
    const r = createMarkerRegistry()
    r.register(MEDIA_UPLOAD_MARKER)
    const { prose, markers } = r.parse(
      '[MEDIA_UPLOAD: Jeff_L.jpeg | c6791970-5a98-4681-a20c-32867de9d153 | image] This is a picture of me.',
    )
    expect(prose).toBe('This is a picture of me.')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toEqual({
      type: 'MEDIA_UPLOAD',
      fields: ['Jeff_L.jpeg', 'c6791970-5a98-4681-a20c-32867de9d153', 'image'],
      raw: '[MEDIA_UPLOAD: Jeff_L.jpeg | c6791970-5a98-4681-a20c-32867de9d153 | image]',
    })
  })

  it('strips multiple MEDIA_UPLOAD markers from the same message (several photos, one caption)', () => {
    const r = createMarkerRegistry()
    r.register(MEDIA_UPLOAD_MARKER)
    const { prose, markers } = r.parse(
      '[MEDIA_UPLOAD: a.jpg | media-a | image] [MEDIA_UPLOAD: b.jpg | media-b | image] Two photos.',
    )
    expect(prose).toBe('Two photos.')
    expect(markers).toHaveLength(2)
    expect(markers.map(m => m.fields[1])).toEqual(['media-a', 'media-b'])
  })
})

describe('MEDIA_UPLOAD_FAILED_MARKER definition', () => {
  it('is a single-field client-dispatch marker', () => {
    expect(MEDIA_UPLOAD_FAILED_MARKER.type).toBe('MEDIA_UPLOAD_FAILED')
    expect(MEDIA_UPLOAD_FAILED_MARKER.fieldCount).toBe(1)
    expect(MEDIA_UPLOAD_FAILED_MARKER.dispatch).toBe('client')
  })

  it('extracts a [MEDIA_UPLOAD_FAILED: filename] marker and strips it from prose', () => {
    const r = createMarkerRegistry()
    r.register(MEDIA_UPLOAD_FAILED_MARKER)
    const { prose, markers } = r.parse('[MEDIA_UPLOAD_FAILED: broken.jpg] Oops.')
    expect(prose).toBe('Oops.')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toEqual({ type: 'MEDIA_UPLOAD_FAILED', fields: ['broken.jpg'], raw: '[MEDIA_UPLOAD_FAILED: broken.jpg]' })
  })
})

describe('MEDIA_UPLOAD_DUPLICATE_MARKER definition', () => {
  it('is a four-field client-dispatch marker', () => {
    expect(MEDIA_UPLOAD_DUPLICATE_MARKER.type).toBe('MEDIA_UPLOAD_DUPLICATE')
    expect(MEDIA_UPLOAD_DUPLICATE_MARKER.fieldCount).toBe(4)
    expect(MEDIA_UPLOAD_DUPLICATE_MARKER.dispatch).toBe('client')
  })

  it('extracts a [MEDIA_UPLOAD_DUPLICATE: filename | media_item_id | type | status] marker and strips it from prose', () => {
    const r = createMarkerRegistry()
    r.register(MEDIA_UPLOAD_DUPLICATE_MARKER)
    const { prose, markers } = r.parse(
      '[MEDIA_UPLOAD_DUPLICATE: dog.jpg | c6791970-5a98-4681-a20c-32867de9d153 | image | ready] Same photo again?',
    )
    expect(prose).toBe('Same photo again?')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toEqual({
      type: 'MEDIA_UPLOAD_DUPLICATE',
      fields: ['dog.jpg', 'c6791970-5a98-4681-a20c-32867de9d153', 'image', 'ready'],
      raw: '[MEDIA_UPLOAD_DUPLICATE: dog.jpg | c6791970-5a98-4681-a20c-32867de9d153 | image | ready]',
    })
  })

  // Same class of bug MEDIA_UPLOAD_MARKER was registered here to prevent
  // (see its own doc comment, registry.ts) — a raw [MEDIA_UPLOAD_DUPLICATE: ...]
  // string must never leak into a memory's title/body via createMemoryFromAnchor,
  // which reads a message's raw stored content through this shared registry.
  it('strips cleanly from prose with no other markers registered alongside it', () => {
    const r = createMarkerRegistry()
    r.register(MEDIA_UPLOAD_DUPLICATE_MARKER)
    const { prose } = r.parse('[MEDIA_UPLOAD_DUPLICATE: dog.jpg | id-1 | image | failed]')
    expect(prose).toBe('')
    expect(prose).not.toContain('MEDIA_UPLOAD_DUPLICATE')
  })
})

describe('createDefaultRegistry — NAME/EMAIL/PHONE stripping + BOOKING coexistence', () => {
  it('registers BOOKING, NAME, EMAIL, PHONE, ACCOUNT_CREATE, SAVE_MEMORY, MEMORY_TITLE, MEDIA_UPLOAD, MEDIA_UPLOAD_FAILED, and MEDIA_UPLOAD_DUPLICATE', () => {
    const defs = createDefaultRegistry().getDefinitions()
    expect(defs.map(d => d.type).sort()).toEqual([
      'ACCOUNT_CREATE',
      'BOOKING',
      'EMAIL',
      'MEDIA_UPLOAD',
      'MEDIA_UPLOAD_DUPLICATE',
      'MEDIA_UPLOAD_FAILED',
      'MEMORY_TITLE',
      'NAME',
      'PHONE',
      'SAVE_MEMORY',
    ])
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

  // Regression: a photo message bookmarked via the whole-message "Keep this
  // as a memory" button (createMemoryFromAnchor, services/crm/memories.ts)
  // used to show this exact raw marker text as the memory's title AND body,
  // since MEDIA_UPLOAD was never registered here — see MEDIA_UPLOAD_MARKER's
  // own doc comment (registry.ts).
  it('strips [MEDIA_UPLOAD: ...] from a visitor upload message, leaving only the typed caption', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse(
      '[MEDIA_UPLOAD: Jeff_L.jpeg | c6791970-5a98-4681-a20c-32867de9d153 | image] This is a picture of me.',
    )
    expect(prose).toBe('This is a picture of me.')
    expect(markers.map(m => m.type)).toEqual(['MEDIA_UPLOAD'])
  })

  it('strips [MEDIA_UPLOAD_FAILED: ...] the same way', () => {
    const r = createDefaultRegistry()
    const { prose, markers } = r.parse('[MEDIA_UPLOAD_FAILED: broken.jpg] Sorry, try again?')
    expect(prose).toBe('Sorry, try again?')
    expect(markers.map(m => m.type)).toEqual(['MEDIA_UPLOAD_FAILED'])
  })
})
