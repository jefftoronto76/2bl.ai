import { describe, it, expect } from 'vitest'
import { titleSourceFromContent } from './mediaMarkerPatterns'

describe('titleSourceFromContent', () => {
  it('returns a plain caption untouched', () => {
    expect(titleSourceFromContent('Grandma at the lake, 1962')).toBe('Grandma at the lake, 1962')
  })

  it('strips a MEDIA_UPLOAD marker and keeps an accompanying caption', () => {
    const content = '[MEDIA_UPLOAD: IMG_1906.jpeg | 3180f20f-bae7-403f-b37a-3c90 | image]\nfound this in the attic'
    expect(titleSourceFromContent(content)).toBe('found this in the attic')
  })

  it('falls back to a type-aware label for an image-only MEDIA_UPLOAD marker — never the raw bracket text', () => {
    const content = '[MEDIA_UPLOAD: IMG_1906.jpeg | 3180f20f-bae7-403f-b37a-3c90 | image]'
    const result = titleSourceFromContent(content)
    expect(result).toBe('Photo shared')
    expect(result).not.toContain('[')
    expect(result).not.toContain('MEDIA_UPLOAD')
  })

  it('falls back to a type-aware label for an audio-only MEDIA_UPLOAD marker', () => {
    expect(titleSourceFromContent('[MEDIA_UPLOAD: memo.m4a | item-1 | audio]')).toBe('Audio shared')
  })

  it('falls back to a type-aware label for a document-only MEDIA_UPLOAD marker', () => {
    expect(titleSourceFromContent('[MEDIA_UPLOAD: notes.pdf | item-1 | document]')).toBe('Document shared')
  })

  it('falls back to a type-aware label for a MEDIA_UPLOAD_DUPLICATE-only marker', () => {
    expect(titleSourceFromContent('[MEDIA_UPLOAD_DUPLICATE: IMG_2041.jpeg | item-1 | image | ready]')).toBe(
      'Photo shared',
    )
  })

  it('falls back to a generic label for a MEDIA_UPLOAD_FAILED-only marker (no type field)', () => {
    const result = titleSourceFromContent('[MEDIA_UPLOAD_FAILED: broken.jpg]')
    expect(result).toBe('Attachment shared')
    expect(result).not.toContain('[')
  })

  it('returns an empty string for genuinely empty content, leaving the "New conversation"/undefined fallback to the caller', () => {
    expect(titleSourceFromContent('')).toBe('')
  })

  it('collapses internal whitespace left behind after stripping a marker with a caption on its own line', () => {
    const content = '[MEDIA_UPLOAD: a.jpg | id-1 | image]\n\n  two   spaces  '
    expect(titleSourceFromContent(content)).toBe('two spaces')
  })
})
