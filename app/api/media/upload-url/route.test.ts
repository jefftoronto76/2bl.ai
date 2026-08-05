// First-ever test coverage for this route — the entry point that creates
// the media_items row (status=pending) and the signed Storage upload URL.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockCreateMediaItem = vi.fn()
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
}))

vi.mock('@/services/media/storage', () => ({
  buildMediaStoragePath: (...args: unknown[]) => mockBuildMediaStoragePath(...args),
  generateSignedUploadUrl: (...args: unknown[]) => mockGenerateSignedUploadUrl(...args),
}))

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request
}

function makeInvalidJsonRequest(): Request {
  return {
    json: async () => {
      throw new SyntaxError('Unexpected token')
    },
  } as unknown as Request
}

const validBody = {
  filename: 'letter.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  chatId: 'chat-1',
}

const FIXED_UUID = '11111111-1111-4111-8111-111111111111' as `${string}-${string}-${string}-${string}-${string}`

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockSingle.mockReset().mockResolvedValue({ data: { id: 'member-1' }, error: null })
  mockCreateMediaItem.mockReset().mockResolvedValue({ id: FIXED_UUID })
  mockBuildMediaStoragePath.mockReset().mockReturnValue(`tenant-1/media/member-1/${FIXED_UUID}/letter.pdf`)
  mockGenerateSignedUploadUrl.mockReset().mockResolvedValue({ signedUrl: 'https://signed.example/upload', token: 'tok' })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(FIXED_UUID)
})

describe('POST /api/media/upload-url', () => {
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

  it('returns 400 when filename is missing', async () => {
    const res = await POST(makeRequest({ ...validBody, filename: undefined }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('filename')
  })

  it('returns 400 when mimeType is missing', async () => {
    const res = await POST(makeRequest({ ...validBody, mimeType: undefined }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('mimeType')
  })

  it('returns 400 when fileSize is missing', async () => {
    const res = await POST(makeRequest({ ...validBody, fileSize: undefined }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('fileSize')
  })

  it('rejects HEIC with a friendly, user-facing message', async () => {
    const res = await POST(makeRequest({ ...validBody, filename: 'photo.heic', mimeType: 'image/heic' }))
    expect(res.status).toBe(415)
    expect((await res.json()).error).toContain('HEIC')
  })

  it('rejects an unsupported mime type', async () => {
    const res = await POST(makeRequest({ ...validBody, filename: 'video.mov', mimeType: 'video/quicktime' }))
    expect(res.status).toBe(415)
  })

  it('rejects a file over the 50MB limit', async () => {
    const res = await POST(makeRequest({ ...validBody, fileSize: 51 * 1024 * 1024 }))
    expect(res.status).toBe(413)
  })

  it('returns 403 when the member record cannot be resolved', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
    expect(mockCreateMediaItem).not.toHaveBeenCalled()
  })

  it('creates the media item and returns the signed upload URL on the happy path', async () => {
    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedUrl: 'https://signed.example/upload', mediaItemId: FIXED_UUID })

    expect(mockCreateMediaItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: FIXED_UUID,
        tenant_id: 'tenant-1',
        member_id: 'member-1',
        chat_id: 'chat-1',
        type: 'document',
        original_filename: 'letter.pdf',
        file_size_bytes: 1024,
        mime_type: 'application/pdf',
      }),
    )
  })

  it('classifies audio and image mime types correctly', async () => {
    await POST(makeRequest({ ...validBody, filename: 'memo.m4a', mimeType: 'audio/m4a' }))
    expect(mockCreateMediaItem).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio' }))

    await POST(makeRequest({ ...validBody, filename: 'dog.jpg', mimeType: 'image/jpeg' }))
    expect(mockCreateMediaItem).toHaveBeenCalledWith(expect.objectContaining({ type: 'image' }))
  })
})
