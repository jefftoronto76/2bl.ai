// Covers the upload-url route, including the dedup feature: a client-supplied
// contentHash (SHA-256, computed client-side since bytes never reach this
// server) is checked against existing media_items for the same member+chat.
// A match reuses the existing row instead of creating an independent one; a
// match against a previously-failed row is reprocessed directly.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'
import { AuditAction } from '@/services/audit/types'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockCreateMediaItem = vi.fn()
const mockFindDuplicateMediaItem = vi.fn()
const mockUpdateMediaItem = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()
const mockProcessMediaItem = vi.fn()
const mockBuildMediaStoragePath = vi.fn()
const mockGenerateSignedUploadUrl = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/services/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: (...args: unknown[]) => mockSingle(...args),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/services/media', () => ({
  createMediaItem: (...args: unknown[]) => mockCreateMediaItem(...args),
  findDuplicateMediaItem: (...args: unknown[]) => mockFindDuplicateMediaItem(...args),
  updateMediaItem: (...args: unknown[]) => mockUpdateMediaItem(...args),
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
}))

vi.mock('@/services/media/storage', () => ({
  buildMediaStoragePath: (...args: unknown[]) => mockBuildMediaStoragePath(...args),
  generateSignedUploadUrl: (...args: unknown[]) => mockGenerateSignedUploadUrl(...args),
}))

vi.mock('@/services/media/processor', () => ({
  processMediaItem: (...args: unknown[]) => mockProcessMediaItem(...args),
}))

// after() requires a real Next.js request-scoped context that a route
// handler invoked directly in Vitest doesn't have — same shim as the other
// processMediaItem trigger routes' own test files.
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
}))

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request
}

function makeInvalidJsonRequest(): Request {
  return {
    json: async () => {
      throw new SyntaxError('Unexpected token')
    },
  } as unknown as Request
}

function makeExistingItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'existing-item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'document',
    original_filename: 'letter.pdf',
    storage_path: 'tenant-1/media/member-1/existing-item-1/letter.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    status: 'ready',
    derived_content: 'already extracted',
    classification: 'letter',
    error_message: null,
    processed_at: '2026-08-05T00:00:00.000Z',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

const validBody = {
  filename: 'letter.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  chatId: 'chat-1',
}

const HASH = 'a'.repeat(64)
const FIXED_UUID = '11111111-1111-4111-8111-111111111111' as `${string}-${string}-${string}-${string}-${string}`

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockSingle.mockReset().mockResolvedValue({ data: { id: 'member-1' }, error: null })
  mockCreateMediaItem.mockReset().mockResolvedValue({ id: FIXED_UUID })
  mockFindDuplicateMediaItem.mockReset().mockResolvedValue(null)
  mockUpdateMediaItem.mockReset().mockResolvedValue(undefined)
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockProcessMediaItem.mockReset().mockResolvedValue(undefined)
  mockBuildMediaStoragePath.mockReset().mockReturnValue(`tenant-1/media/member-1/${FIXED_UUID}/letter.pdf`)
  mockGenerateSignedUploadUrl.mockReset().mockResolvedValue({ signedUrl: 'https://signed.example/upload', token: 'tok' })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(FIXED_UUID)
})

describe('POST /api/media/upload-url — existing validation, unaffected by dedup', () => {
  it('returns 401 when there is no authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const res = await POST(makeInvalidJsonRequest())
    expect(res.status).toBe(400)
  })

  it('returns 400 when a required field is missing', async () => {
    const res = await POST(makeRequest({ ...validBody, filename: undefined }))
    expect(res.status).toBe(400)
  })

  it('rejects HEIC with a friendly message', async () => {
    const res = await POST(makeRequest({ ...validBody, filename: 'photo.heic', mimeType: 'image/heic' }))
    expect(res.status).toBe(415)
  })

  it('rejects an oversized file', async () => {
    const res = await POST(makeRequest({ ...validBody, fileSize: 51 * 1024 * 1024 }))
    expect(res.status).toBe(413)
  })

  it('returns 403 when the member record cannot be resolved', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/media/upload-url — normal upload, no contentHash supplied', () => {
  it('creates a new item as before when no contentHash is sent (client hashing unavailable)', async () => {
    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedUrl: 'https://signed.example/upload', mediaItemId: FIXED_UUID })
    expect(mockFindDuplicateMediaItem).not.toHaveBeenCalled()
    expect(mockCreateMediaItem).toHaveBeenCalledWith(expect.objectContaining({ id: FIXED_UUID, content_hash: null }))
  })
})

describe('POST /api/media/upload-url — dedup, no existing match (near-duplicate is NOT merged)', () => {
  it('creates a new item when a contentHash is sent but nothing matches (e.g. same filename, different content)', async () => {
    mockFindDuplicateMediaItem.mockResolvedValue(null)

    const res = await POST(makeRequest({ ...validBody, contentHash: HASH }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedUrl: 'https://signed.example/upload', mediaItemId: FIXED_UUID })
    expect(mockFindDuplicateMediaItem).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      chatId: 'chat-1',
      contentHash: HASH,
    })
    expect(mockCreateMediaItem).toHaveBeenCalledWith(expect.objectContaining({ id: FIXED_UUID, content_hash: HASH }))
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })
})

describe('POST /api/media/upload-url — dedup, genuine match found', () => {
  it('reuses a ready match: returns duplicate:true, does not create a new row or reprocess', async () => {
    const existing = makeExistingItem({ status: 'ready' })
    mockFindDuplicateMediaItem.mockResolvedValue(existing)

    const res = await POST(makeRequest({ ...validBody, contentHash: HASH }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mediaItemId: 'existing-item-1', duplicate: true, status: 'ready' })
    expect(mockCreateMediaItem).not.toHaveBeenCalled()
    expect(mockGenerateSignedUploadUrl).not.toHaveBeenCalled()
    expect(mockUpdateMediaItem).not.toHaveBeenCalled()
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('reuses a pending/processing match without reprocessing (already in flight)', async () => {
    mockFindDuplicateMediaItem.mockResolvedValue(makeExistingItem({ status: 'processing' }))

    const res = await POST(makeRequest({ ...validBody, contentHash: HASH }))

    expect(await res.json()).toEqual({ mediaItemId: 'existing-item-1', duplicate: true, status: 'processing' })
    expect(mockUpdateMediaItem).not.toHaveBeenCalled()
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('reuses a failed match by resetting it to pending and reprocessing directly (retry-by-reupload)', async () => {
    const existing = makeExistingItem({ status: 'failed', error_message: 'boom' })
    mockFindDuplicateMediaItem.mockResolvedValue(existing)

    const res = await POST(makeRequest({ ...validBody, contentHash: HASH }))

    expect(res.status).toBe(200)
    // The response reports 'pending' (not the pre-reset 'failed') — the item
    // was just reset to pending and reprocessing kicked off, so that's its
    // real current status, matching what updateMediaItem just wrote.
    expect(await res.json()).toEqual({ mediaItemId: 'existing-item-1', duplicate: true, status: 'pending' })
    expect(mockCreateMediaItem).not.toHaveBeenCalled()
    expect(mockUpdateMediaItem).toHaveBeenCalledWith('existing-item-1', {
      status: 'pending',
      error_message: null,
      derived_content: null,
      classification: null,
      processed_at: null,
    })
    expect(mockProcessMediaItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'existing-item-1' }))
  })

  it('still returns 200 even if the reprocess call rejects — fire-and-forget must not fail the request', async () => {
    mockFindDuplicateMediaItem.mockResolvedValue(makeExistingItem({ status: 'failed' }))
    mockProcessMediaItem.mockRejectedValue(new Error('boom'))

    const res = await POST(makeRequest({ ...validBody, contentHash: HASH }))

    expect(res.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('logs a MEDIA_UPLOAD_DEDUPED audit event with the matched previous status', async () => {
    mockFindDuplicateMediaItem.mockResolvedValue(makeExistingItem({ status: 'ready' }))

    await POST(makeRequest({ ...validBody, contentHash: HASH }))

    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_UPLOAD_DEDUPED,
        media_item_id: 'existing-item-1',
        metadata: expect.objectContaining({ matched_previous_status: 'ready', reprocessed: false }),
      }),
    )
  })
})
