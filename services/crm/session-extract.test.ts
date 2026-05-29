import { vi, describe, it, expect, beforeEach } from 'vitest'

// Hoisted mock for the AI SDK's generateText so the extraction call never hits
// the network. anthropic() is stubbed to a plain identifier (no API key needed).
const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }))
vi.mock('ai', () => ({ generateText: generateTextMock }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: (id: string) => ({ id }) }))

import { extractContactFields, parseExtraction } from './session'

describe('parseExtraction — model-response → ExtractedContact', () => {
  it('parses a full JSON object', () => {
    expect(parseExtraction('{"name":"Sam","phone":"+15551234567","email":"sam@example.com"}')).toEqual({
      name: 'Sam',
      phone: '+15551234567',
      email: 'sam@example.com',
    })
  })

  it('keeps found fields and nulls the absent ones', () => {
    expect(parseExtraction('{"name":"Sam","phone":null,"email":null}')).toEqual({
      name: 'Sam',
      phone: null,
      email: null,
    })
  })

  it('extracts JSON wrapped in a ```json code fence', () => {
    const raw = '```json\n{"name":null,"phone":"5551234567","email":null}\n```'
    expect(parseExtraction(raw)).toEqual({ name: null, phone: '5551234567', email: null })
  })

  it('extracts JSON embedded in surrounding prose', () => {
    const raw = 'Here is the result: {"name":"Ron","phone":null,"email":"ron@x.io"} — done.'
    expect(parseExtraction(raw)).toEqual({ name: 'Ron', phone: null, email: 'ron@x.io' })
  })

  it('normalizes the literal string "null"/"none"/"N/A" to null', () => {
    expect(parseExtraction('{"name":"none","phone":"N/A","email":"null"}')).toEqual({
      name: null,
      phone: null,
      email: null,
    })
  })

  it('nulls blank-string and non-string fields', () => {
    expect(parseExtraction('{"name":"   ","phone":1234567890,"email":""}')).toEqual({
      name: null,
      phone: null,
      email: null,
    })
  })

  it('returns all-null on malformed JSON', () => {
    expect(parseExtraction('{not json at all')).toEqual({ name: null, phone: null, email: null })
  })

  it('returns all-null when there is no JSON object at all', () => {
    expect(parseExtraction('I could not find any contact details.')).toEqual({
      name: null,
      phone: null,
      email: null,
    })
  })

  it('returns all-null when the JSON parses to a non-object', () => {
    expect(parseExtraction('[1, 2, 3]')).toEqual({ name: null, phone: null, email: null })
  })
})

describe('extractContactFields — focused Haiku extraction call', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  it('returns the parsed fields from the model response', async () => {
    generateTextMock.mockResolvedValue({
      text: '{"name":"Sam","phone":"+15551234567","email":"sam@example.com"}',
    })
    await expect(extractContactFields('Hi, I am Sam, reach me at +1 555 123 4567')).resolves.toEqual({
      name: 'Sam',
      phone: '+15551234567',
      email: 'sam@example.com',
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('fails open to all-null when the API call throws', async () => {
    generateTextMock.mockRejectedValue(new Error('upstream 529'))
    await expect(extractContactFields('my number is 555-123-4567')).resolves.toEqual({
      name: null,
      phone: null,
      email: null,
    })
  })

  it('skips the API call entirely for empty input', async () => {
    await expect(extractContactFields('   ')).resolves.toEqual({ name: null, phone: null, email: null })
    expect(generateTextMock).not.toHaveBeenCalled()
  })
})
