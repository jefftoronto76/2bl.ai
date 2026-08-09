// Covers: (1) the race-condition fix — waitForStorageObject (existing
// coverage, preserved below), and (2) processMediaItem's full orchestration
// plus the processAudio/processImage/processDocument pipeline bodies —
// previously entirely untested beyond the shared waitForStorageObject helper.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AuditAction } from '@/services/audit/types'
import type { MediaItem } from './index'

const mockObjectExists = vi.fn()
const mockGenerateLongLivedSignedUrl = vi.fn()
const mockGenerateSignedDownloadUrl = vi.fn()

vi.mock('./storage', () => ({
  objectExists: (...args: unknown[]) => mockObjectExists(...args),
  generateLongLivedSignedUrl: (...args: unknown[]) => mockGenerateLongLivedSignedUrl(...args),
  generateSignedDownloadUrl: (...args: unknown[]) => mockGenerateSignedDownloadUrl(...args),
}))

const mockGetMediaItem = vi.fn()
const mockUpdateMediaItem = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()
const mockLogAiMediaEvent = vi.fn()
const mockLogSttMediaEvent = vi.fn()

vi.mock('./index', () => ({
  getMediaItem: (...args: unknown[]) => mockGetMediaItem(...args),
  updateMediaItem: (...args: unknown[]) => mockUpdateMediaItem(...args),
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
  logAiMediaEvent: (...args: unknown[]) => mockLogAiMediaEvent(...args),
  logSttMediaEvent: (...args: unknown[]) => mockLogSttMediaEvent(...args),
}))

const mockExtractText = vi.fn()
vi.mock('@/services/content/assets', () => ({
  extractText: (...args: unknown[]) => mockExtractText(...args),
}))

import { waitForStorageObject, STORAGE_WAIT_DELAYS_MS, processMediaItem } from './processor'

beforeEach(() => {
  mockObjectExists.mockReset()
  vi.useRealTimers()
})

describe('waitForStorageObject', () => {
  it('resolves immediately when the object already exists on the first check', async () => {
    mockObjectExists.mockResolvedValueOnce(true)

    await waitForStorageObject('tenant-1/media/member-1/item-1/dog.jpg')

    expect(mockObjectExists).toHaveBeenCalledTimes(1)
    expect(mockObjectExists).toHaveBeenCalledWith('tenant-1/media/member-1/item-1/dog.jpg')
  })

  it('retries with backoff and succeeds once the object shows up', async () => {
    vi.useFakeTimers()
    mockObjectExists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const promise = waitForStorageObject('path/to/object')
    await vi.runAllTimersAsync()
    await promise

    expect(mockObjectExists).toHaveBeenCalledTimes(3)
  })

  it('throws a clear error after exhausting every retry attempt', async () => {
    vi.useFakeTimers()
    mockObjectExists.mockResolvedValue(false)

    const promise = waitForStorageObject('path/to/missing-object')
    // Attach the rejection assertion before advancing timers so the rejection
    // is never briefly unhandled (avoids a spurious PromiseRejectionHandledWarning).
    const assertion = expect(promise).rejects.toThrow(
      `Storage object not available after ${STORAGE_WAIT_DELAYS_MS.length} attempts: path/to/missing-object`,
    )
    await vi.runAllTimersAsync()
    await assertion

    expect(mockObjectExists).toHaveBeenCalledTimes(STORAGE_WAIT_DELAYS_MS.length)
  })
})

// ---------------------------------------------------------------------------
// processMediaItem + processAudio/processImage/processDocument
// ---------------------------------------------------------------------------

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  throw new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response
}
function textResponse(body: string, ok: boolean, status: number): Response {
  return { ok, status, json: async () => JSON.parse(body), text: async () => body } as Response
}
function arrayBufferResponse(text: string, ok = true, status = 200): Response {
  const bytes = new TextEncoder().encode(text)
  return { ok, status, arrayBuffer: async () => bytes.buffer } as Response
}

function bufferResponse(buffer: Buffer, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as Response
}

// Real JPEGs, not JSON-mockable — EXIF/GPS data lives in binary bytes.
// Generated once via a throwaway script (sharp to build a minimal valid
// JPEG, piexifjs to inject a real GPS IFD — see the PR description for the
// exact generation steps) and committed as static fixtures; nothing in the
// build or runtime dependency tree needs either library.
const FIXTURES_DIR = join(__dirname, '__fixtures__')
const PHOTO_WITH_GPS = readFileSync(join(FIXTURES_DIR, 'photo-with-gps.jpg'))
const PHOTO_NO_GPS = readFileSync(join(FIXTURES_DIR, 'photo-no-gps.jpg'))
// Golden Gate Bridge viewpoint, San Francisco — the coordinates baked into photo-with-gps.jpg.
const KNOWN_GPS_LATITUDE = 37.8199
const KNOWN_GPS_LONGITUDE = -122.4783

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Routes fetchMock by URL for the image pipeline, now that processImage
 * makes two real calls per run: extractGpsCoordinates's own download of the
 * signed URL (photo bytes, for exifr), and the Anthropic vision call. Every
 * existing image-pipeline test below was written before GPS Extraction
 * shipped and only mocked the vision call — without this, the GPS fetch
 * would get back whatever the test set up for vision (usually a JSON body
 * with no `arrayBuffer()` method), which would throw inside
 * extractGpsCoordinates's own try/catch and log noise, harmlessly but
 * sloppily. Defaults the GPS fetch to "no GPS data" (the real
 * photo-no-gps.jpg fixture) so every pre-existing test's assertions (which
 * never checked latitude/longitude) stay meaningful without further changes.
 */
function mockImageFetch(visionResponse: Response, gpsResponse: Response = bufferResponse(PHOTO_NO_GPS)) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === ANTHROPIC_MESSAGES_URL) return visionResponse
    if (url === 'https://signed.example/short') return gpsResponse
    throw new Error(`unexpected fetch in image pipeline test: ${url}`)
  })
}

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'audio',
    original_filename: 'memo.m4a',
    storage_path: 'tenant-1/media/member-1/item-1/memo.m4a',
    file_size_bytes: 1024,
    mime_type: 'audio/m4a',
    status: 'pending',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function resetSharedMocks() {
  mockGetMediaItem.mockReset()
  mockUpdateMediaItem.mockReset().mockResolvedValue(undefined)
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockLogAiMediaEvent.mockReset().mockResolvedValue(undefined)
  mockLogSttMediaEvent.mockReset().mockResolvedValue(undefined)
  mockObjectExists.mockReset().mockResolvedValue(true)
  mockGenerateLongLivedSignedUrl.mockReset().mockResolvedValue('https://signed.example/long')
  mockGenerateSignedDownloadUrl.mockReset().mockResolvedValue('https://signed.example/short')
  mockExtractText.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
}

describe('processMediaItem — orchestration', () => {
  beforeEach(() => {
    resetSharedMocks()
    process.env.DEEPGRAM_API_KEY = 'deepgram-test-key'
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DEEPGRAM_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it('is a no-op when the item no longer exists', async () => {
    mockGetMediaItem.mockResolvedValue(null)
    await processMediaItem(makeItem())
    expect(mockUpdateMediaItem).not.toHaveBeenCalled()
  })

  it('is a no-op (idempotency guard) when the item is not pending', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ status: 'processing' }))
    await processMediaItem(makeItem())
    expect(mockUpdateMediaItem).not.toHaveBeenCalled()
  })

  it('sets status to processing before dispatching to the type-specific pipeline', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio' }))
    fetchMock.mockImplementation(async () =>
      jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] } }),
    )

    await processMediaItem(makeItem())

    expect(mockUpdateMediaItem).toHaveBeenNthCalledWith(1, 'item-1', { status: 'processing' })
    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'hello' }),
    )
  })

  it('marks the item failed with a matching error for an unsupported type', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'unknown' as unknown as MediaItem['type'] }))

    await processMediaItem(makeItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: expect.stringContaining('Unsupported media type') }),
    )
  })

  it('marks the item failed and logs MEDIA_PROCESS_FAILED with the right pipeline_step when a pipeline throws', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio' }))
    delete process.env.DEEPGRAM_API_KEY

    await processMediaItem(makeItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: 'DEEPGRAM_API_KEY is not configured' }),
    )
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_PROCESS_FAILED,
        metadata: expect.objectContaining({ pipeline_step: 'deepgram_transcription' }),
      }),
    )
  })

  it('marks the item failed when the storage object never becomes available', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio' }))
    mockObjectExists.mockResolvedValue(false)
    vi.useFakeTimers()

    const promise = processMediaItem(makeItem())
    await vi.runAllTimersAsync()
    await promise

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({
        status: 'failed',
        error_message: expect.stringContaining('Storage object not available'),
      }),
    )
    vi.useRealTimers()
  })
})

describe('processMediaItem — audio pipeline (processAudio)', () => {
  beforeEach(() => {
    resetSharedMocks()
    process.env.DEEPGRAM_API_KEY = 'deepgram-test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DEEPGRAM_API_KEY
  })

  it('fails the item when Deepgram returns a non-ok response', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio' }))
    fetchMock.mockImplementation(async () => textResponse('rate limited', false, 429))

    await processMediaItem(makeItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: expect.stringContaining('Deepgram API error: 429') }),
    )
  })

  it('sets derived_content to the transcript and classifies "interview" filenames as interview_recording', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio', original_filename: 'grandpa interview.m4a' }))
    fetchMock.mockImplementation(async () =>
      jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'my life story' }] }] } }),
    )

    await processMediaItem(makeItem({ original_filename: 'grandpa interview.m4a' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({
        status: 'ready',
        derived_content: 'my life story',
        classification: 'interview_recording',
      }),
    )
  })

  it('defaults to voice_memo classification when the filename does not mention "interview"', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio', original_filename: 'memo.m4a' }))
    fetchMock.mockImplementation(async () =>
      jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'hi' }] }] } }),
    )

    await processMediaItem(makeItem({ original_filename: 'memo.m4a' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ classification: 'voice_memo' }),
    )
  })

  it('fails before any fetch when DEEPGRAM_API_KEY is not configured', async () => {
    delete process.env.DEEPGRAM_API_KEY
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'audio' }))

    await processMediaItem(makeItem())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: 'DEEPGRAM_API_KEY is not configured' }),
    )
  })
})

describe('processMediaItem — image pipeline (processImage)', () => {
  beforeEach(() => {
    resetSharedMocks()
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ANTHROPIC_API_KEY
  })

  it('fails the item when Anthropic vision returns a non-ok response', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(textResponse('bad request', false, 400))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: expect.stringContaining('Anthropic vision error: 400') }),
    )
  })

  it('parses a valid JSON response into caption/classification/extracted_text', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(
      jsonResponse({
        content: [{ type: 'text', text: JSON.stringify({ caption: 'A dog', classification: 'photo', extracted_text: '' }) }],
      }),
    )

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'A dog', classification: 'photo' }),
    )
  })

  it('strips a ```json ... ``` markdown code fence before parsing — a real, observed vision-model failure mode', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    const fenced = '```json\n' + JSON.stringify({ caption: 'A dog', classification: 'photo', extracted_text: '' }) + '\n```'
    mockImageFetch(jsonResponse({ content: [{ type: 'text', text: fenced }] }))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'A dog', classification: 'photo' }),
    )
  })

  it('strips a plain ``` ... ``` fence (no "json" language tag) the same way', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    const fenced = '```\n' + JSON.stringify({ caption: 'A cat', classification: 'photo', extracted_text: '' }) + '\n```'
    mockImageFetch(jsonResponse({ content: [{ type: 'text', text: fenced }] }))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'A cat', classification: 'photo' }),
    )
  })

  it('falls back to a safe placeholder — never the raw response verbatim — when the text is still not valid JSON after fence-stripping, and logs why without leaking the raw text', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(jsonResponse({ content: [{ type: 'text', text: 'not json at all' }] }))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      // Never the raw model text ("not json at all") — a fixed, safe
      // placeholder instead, and still non-empty (createPhotoMemoryFromMedia's
      // 409 "not ready" gate treats an empty derived_content as unprocessed).
      expect.objectContaining({ status: 'ready', derived_content: 'A photo.', classification: 'photo' }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[media/processor] vision response was not valid JSON, even after fence-stripping',
      expect.objectContaining({ media_item_id: 'item-1', error_type: 'SyntaxError', raw_text_length: 'not json at all'.length }),
    )
    // Length/presence only — the raw text itself must never reach the log.
    // (JSON.parse's own SyntaxError message embeds a snippet of the invalid
    // input verbatim — this asserts the fix doesn't log err.message either.)
    const loggedMetadata = consoleErrorSpy.mock.calls[0][1] as Record<string, unknown>
    expect(JSON.stringify(loggedMetadata)).not.toContain('not json at all')
    consoleErrorSpy.mockRestore()
  })

  it('fails the item when no text block is returned', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(jsonResponse({ content: [{ type: 'image' }] }))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: 'No text block returned from Anthropic vision' }),
    )
  })
})

describe('processMediaItem — GPS extraction (extractGpsCoordinates, via processImage)', () => {
  beforeEach(() => {
    resetSharedMocks()
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ANTHROPIC_API_KEY
  })

  const VISION_OK = jsonResponse({
    content: [{ type: 'text', text: JSON.stringify({ caption: 'A view', classification: 'photo', extracted_text: '' }) }],
  })

  it('extracts real GPS EXIF data and writes correct decimal-degree lat/lng — proves extraction AND DMS-to-decimal conversion against a real fixture with known coordinates', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(VISION_OK, bufferResponse(PHOTO_WITH_GPS))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready' }),
    )
    const call = mockUpdateMediaItem.mock.calls.find(([, input]) => (input as { status?: string }).status === 'ready')
    const written = call?.[1] as { latitude: number; longitude: number }
    // Decimal degrees, not the raw DMS triplet the EXIF GPS IFD actually
    // stores (degrees/minutes/seconds) — a non-integer value confirms real
    // conversion happened, not just a passthrough of the DMS numerator.
    expect(written.latitude).toBeCloseTo(KNOWN_GPS_LATITUDE, 4)
    expect(written.longitude).toBeCloseTo(KNOWN_GPS_LONGITUDE, 4)
    expect(Number.isInteger(written.latitude)).toBe(false)
  })

  it('a photo with no GPS EXIF at all (the common case) completes normally with null coordinates, no error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(VISION_OK, bufferResponse(PHOTO_NO_GPS))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', latitude: null, longitude: null }),
    )
    // The no-GPS-data case is the expected common case, not a failure — no log.
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('corrupt/unparsable image bytes at the signed URL degrade to null coordinates and do NOT take down vision/caption processing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    const garbage = Buffer.from('this is not a jpeg at all, just plain text bytes', 'utf8')
    mockImageFetch(VISION_OK, bufferResponse(garbage))

    await processMediaItem(makeItem({ type: 'image' }))

    // Vision/caption processing completed successfully, unaffected.
    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'A view', latitude: null, longitude: null }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[media/processor] GPS extraction failed, continuing without coordinates',
      expect.objectContaining({ media_item_id: 'item-1' }),
    )
    consoleErrorSpy.mockRestore()
  })

  it('the signed URL failing to download for GPS purposes also degrades to null coordinates, without failing the item', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(VISION_OK, textResponse('not found', false, 404))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', latitude: null, longitude: null }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[media/processor] GPS extraction failed, continuing without coordinates',
      expect.objectContaining({ media_item_id: 'item-1' }),
    )
    consoleErrorSpy.mockRestore()
  })

  it('logs error_type only on GPS failure, never raw EXIF bytes or file content', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    const garbage = Buffer.from('this is not a jpeg at all, just plain text bytes', 'utf8')
    mockImageFetch(VISION_OK, bufferResponse(garbage))

    await processMediaItem(makeItem({ type: 'image' }))

    const loggedMetadata = consoleErrorSpy.mock.calls.find(
      (call) => call[0] === '[media/processor] GPS extraction failed, continuing without coordinates',
    )?.[1] as Record<string, unknown>
    expect(loggedMetadata).toBeDefined()
    expect(Object.keys(loggedMetadata).sort()).toEqual(['error_type', 'media_item_id'])
    expect(JSON.stringify(loggedMetadata)).not.toContain('plain text bytes')
    consoleErrorSpy.mockRestore()
  })

  it("logs gps_found: true/false (presence only, never raw coordinates) on the MEDIA_PROCESS_COMPLETED audit event", async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ type: 'image' }))
    mockImageFetch(VISION_OK, bufferResponse(PHOTO_WITH_GPS))

    await processMediaItem(makeItem({ type: 'image' }))

    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_PROCESS_COMPLETED,
        metadata: expect.objectContaining({ gps_found: true }),
      }),
    )
    const completedCall = mockLogMediaEvent.mock.calls.find(([p]) => p.action === AuditAction.MEDIA_PROCESS_COMPLETED)
    const metadata = completedCall?.[0]?.metadata as Record<string, unknown>
    expect(JSON.stringify(metadata)).not.toContain(String(KNOWN_GPS_LATITUDE))
    expect(JSON.stringify(metadata)).not.toContain(String(KNOWN_GPS_LONGITUDE))
  })
})

describe('processMediaItem — document pipeline (processDocument)', () => {
  const DOWNLOAD_URL = 'https://signed.example/doc'

  beforeEach(() => {
    resetSharedMocks()
    mockGenerateSignedDownloadUrl.mockResolvedValue(DOWNLOAD_URL)
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ANTHROPIC_API_KEY
  })

  function makeDocItem(overrides: Partial<MediaItem> = {}) {
    return makeItem({ type: 'document', mime_type: 'application/pdf', original_filename: 'letter.pdf', ...overrides })
  }

  /** Routes the file-download GET separately from the classification POST. */
  function routeFetch(classificationResponse: () => Response) {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === DOWNLOAD_URL) return arrayBufferResponse('fake document bytes')
      return classificationResponse()
    })
  }

  it('fails the item when extractText throws, and logs AI_MEDIA_REQUEST_FAILED for a PDF', async () => {
    mockGetMediaItem.mockResolvedValue(makeDocItem())
    routeFetch(() => jsonResponse({}))
    mockExtractText.mockRejectedValue(new Error('Anthropic API error: 500 boom'))

    await processMediaItem(makeDocItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: expect.stringContaining('Anthropic API error: 500') }),
    )
    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.AI_MEDIA_REQUEST_FAILED }),
    )
  })

  it('does not log AI_MEDIA_REQUEST_FAILED for a non-PDF extraction failure', async () => {
    mockGetMediaItem.mockResolvedValue(makeDocItem({ mime_type: 'text/plain', original_filename: 'notes.txt' }))
    routeFetch(() => jsonResponse({}))
    mockExtractText.mockRejectedValue(new Error('boom'))

    await processMediaItem(makeDocItem({ mime_type: 'text/plain' }))

    expect(
      mockLogAiMediaEvent.mock.calls.some(([arg]) => arg.action === AuditAction.AI_MEDIA_REQUEST_FAILED),
    ).toBe(false)
  })

  it('falls back to "document" classification when the classification sub-call fails, but the item still succeeds', async () => {
    mockGetMediaItem.mockResolvedValue(makeDocItem())
    mockExtractText.mockResolvedValue('Dear diary, ...')
    routeFetch(() => textResponse('server error', false, 500))

    await processMediaItem(makeDocItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'Dear diary, ...', classification: 'document' }),
    )
  })

  it('falls back to "document" classification when the classification request throws', async () => {
    mockGetMediaItem.mockResolvedValue(makeDocItem())
    mockExtractText.mockResolvedValue('Dear diary, ...')
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === DOWNLOAD_URL) return arrayBufferResponse('fake document bytes')
      throw new Error('network error')
    })

    await processMediaItem(makeDocItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', classification: 'document' }),
    )
  })

  it('uses the Haiku classification and the extracted text on the happy path', async () => {
    mockGetMediaItem.mockResolvedValue(makeDocItem())
    mockExtractText.mockResolvedValue('Dear diary, ...')
    routeFetch(() => jsonResponse({ content: [{ text: 'journal_entry' }] }))

    await processMediaItem(makeDocItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'ready', derived_content: 'Dear diary, ...', classification: 'journal_entry' }),
    )
  })

  it('fails the item when the file download itself returns a non-ok response', async () => {
    mockGetMediaItem.mockResolvedValue(makeDocItem())
    fetchMock.mockImplementation(async () => textResponse('not found', false, 404))

    await processMediaItem(makeDocItem())

    expect(mockUpdateMediaItem).toHaveBeenLastCalledWith(
      'item-1',
      expect.objectContaining({ status: 'failed', error_message: expect.stringContaining('Failed to download file: 404') }),
    )
    expect(mockExtractText).not.toHaveBeenCalled()
  })
})
