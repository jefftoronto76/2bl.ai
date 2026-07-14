import { describe, it, expect } from 'vitest'
import { bufferMarkdown } from './bufferMarkdown'

describe('bufferMarkdown', () => {
  it('passes plain prose through unchanged', () => {
    const text = 'Just words with no markdown at all, and a stray - dash.'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('passes empty string through unchanged', () => {
    expect(bufferMarkdown('')).toBe('')
  })

  it('passes fully closed bold through unchanged', () => {
    const text = "Here's **bold** text."
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('buffers an unclosed bold run', () => {
    expect(bufferMarkdown("Here's **bold text")).toBe("Here's ")
  })

  it('buffers an unclosed single-asterisk italic run', () => {
    expect(bufferMarkdown('This is *emphasis in progress')).toBe('This is ')
  })

  it('passes fully closed italic through unchanged', () => {
    const text = 'This is *emphasis* done.'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('buffers an unclosed underscore bold run', () => {
    expect(bufferMarkdown('Some __strong text')).toBe('Some ')
  })

  it('does not mistake a bullet-list marker for an emphasis opener', () => {
    const text = '* Item one\n* Item two\n* Item three'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('does not mistake a bullet-list marker for an emphasis opener mid-stream', () => {
    const text = 'Here is a list:\n* Item one\n* Item two, still typ'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('buffers an unclosed inline code span', () => {
    expect(bufferMarkdown('Run `npm install')).toBe('Run ')
  })

  it('passes a fully closed inline code span through unchanged', () => {
    const text = 'Run `npm install` now.'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('buffers an unterminated code fence, including its opening line', () => {
    const text = 'Here:\n```js\nconst x = 1'
    expect(bufferMarkdown(text)).toBe('Here:\n')
  })

  it('passes a fully closed code fence through unchanged, even with backticks inside', () => {
    const text = 'Here:\n```js\nconst x = `template ${1}`\n```\nDone.'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('passes a fully closed link through unchanged', () => {
    const text = 'Check [Google](https://google.com) out.'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('buffers an unclosed link bracket', () => {
    expect(bufferMarkdown('Check [Google out')).toBe('Check ')
  })

  it('buffers a closed bracket with an in-progress URL', () => {
    expect(bufferMarkdown('Check [Google](https://google.co')).toBe('Check ')
  })

  it('buffers an in-progress marker bracket the same way as a link (Marker 09 flash)', () => {
    expect(
      bufferMarkdown('Sure, here you go.\n[BOOKING: Book a call | Talk to Jeff | Book now | https://cal'),
    ).toBe('Sure, here you go.\n')
  })

  it('passes a fully closed marker bracket through unchanged', () => {
    const text = 'Sure, here you go.\n[BOOKING: Book a call | Talk to Jeff | Book now | https://cal.com/x]'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('preserves multiple resolved tokens in sequence', () => {
    const text = '**Bold**, *italic*, `code`, and [a link](https://x.com) all in one line.'
    expect(bufferMarkdown(text)).toBe(text)
  })

  it('buffers only the trailing unresolved token, keeping earlier resolved ones intact', () => {
    const text = '**Bold** is done. Now *starting italic'
    expect(bufferMarkdown(text)).toBe('**Bold** is done. Now ')
  })
})
