import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Build the entire Supabase mock inside vi.hoisted so it's available ────────
// inside the vi.mock factory (which runs before module imports).
const supabaseMocks = vi.hoisted(() => {
  const eqMock = vi.fn()
  const maybySingleMock = vi.fn()
  const createSignedUrlMock = vi.fn()

  const qb: Record<string, unknown> = {}
  ;(qb as any).select = () => qb
  ;(qb as any).eq = (...args: unknown[]) => { eqMock(...args); return qb }
  ;(qb as any).maybeSingle = maybySingleMock

  const supabaseMock = {
    from: () => qb,
    storage: {
      from: () => ({ createSignedUrl: createSignedUrlMock }),
    },
  }

  return { eqMock, maybySingleMock, createSignedUrlMock, supabaseMock }
})

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => supabaseMocks.supabaseMock,
}))

// Also mock the AI SDK so runChatStream doesn't blow up if imported
vi.mock('ai', () => ({ streamText: vi.fn() }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn(() => ({})) }))

import { resolveMediaBlocks } from './stream'
import type { ChatMessage } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const msg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
  role,
  content,
})

const IMAGE_MARKER =
  '[MEDIA_UPLOAD: photo.jpg | media-id-1 | image]'
const AUDIO_MARKER =
  '[MEDIA_UPLOAD: voice.m4a | media-id-2 | audio]'
const FAILED_MARKER =
  '[MEDIA_UPLOAD_FAILED: broken.jpg]'

function makeItem(storagePath: string | null) {
  return { storage_path: storagePath }
}

beforeEach(() => {
  supabaseMocks.eqMock.mockReset()
  supabaseMocks.maybySingleMock.mockReset()
  supabaseMocks.createSignedUrlMock.mockReset()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveMediaBlocks', () => {
  it('no markers → returns messages unchanged', async () => {
    const messages = [msg('user', 'hello'), msg('assistant', 'hi')]
    const result = await resolveMediaBlocks(messages, null)
    expect(result).toBe(messages)
  })

  it('audio marker only → returns unchanged (no image markers)', async () => {
    const messages = [msg('user', `${AUDIO_MARKER} what do you think?`)]
    const result = await resolveMediaBlocks(messages, null)
    expect(result).toBe(messages)
  })

  it('image marker, storage_path null → unchanged + console.warn', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({ data: makeItem(null), error: null })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', IMAGE_MARKER)]
    const result = await resolveMediaBlocks(messages, null)

    expect(result).toBe(messages)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat/stream] no storage_path'),
      'media-id-1',
    )
    warnSpy.mockRestore()
  })

  it('image marker, maybeSingle returns no data → unchanged + warn', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({ data: null, error: null })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', IMAGE_MARKER)]
    const result = await resolveMediaBlocks(messages, null)

    expect(result).toBe(messages)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat/stream] no storage_path'),
      'media-id-1',
    )
    warnSpy.mockRestore()
  })

  it('image marker, createSignedUrl returns error → unchanged + warn', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({
      data: makeItem('tenants/t1/photo.jpg'),
      error: null,
    })
    supabaseMocks.createSignedUrlMock.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', IMAGE_MARKER)]
    const result = await resolveMediaBlocks(messages, null)

    expect(result).toBe(messages)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat/stream] signed URL failed'),
      'media-id-1',
      'permission denied',
    )
    warnSpy.mockRestore()
  })

  it('happy path → last user message enriched with image block', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({
      data: makeItem('tenants/t1/photo.jpg'),
      error: null,
    })
    supabaseMocks.createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/signed/photo.jpg' },
      error: null,
    })

    const messages = [
      msg('assistant', 'previous reply'),
      msg('user', `${IMAGE_MARKER} Here is the photo.`),
    ]
    const result = await resolveMediaBlocks(messages, 'tenant-abc')

    // First message unchanged
    expect(result[0]).toBe(messages[0])

    // Second message enriched
    const enriched = result[1] as { role: string; content: unknown[] }
    expect(enriched.role).toBe('user')
    expect(Array.isArray(enriched.content)).toBe(true)

    const image = enriched.content.find((b: any) => b.type === 'image') as any
    expect(image?.image).toBe('https://storage.example.com/signed/photo.jpg')

    const text = enriched.content.find((b: any) => b.type === 'text') as any
    expect(text?.text).toBe('Here is the photo.')
  })

  it('prose is stripped of all [MEDIA_UPLOAD:…] markers', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({
      data: makeItem('tenants/t1/photo.jpg'),
      error: null,
    })
    supabaseMocks.createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    })

    const messages = [msg('user', `${IMAGE_MARKER} Some extra text`)]
    const result = await resolveMediaBlocks(messages, null)

    const enriched = result[0] as { content: unknown[] }
    const text = enriched.content.find((b: any) => b.type === 'text') as any
    expect(text?.text).not.toContain('[MEDIA_UPLOAD:')
    expect(text?.text).toBe('Some extra text')
  })

  it('[MEDIA_UPLOAD_FAILED:…] markers are stripped from prose', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({
      data: makeItem('path/img.jpg'),
      error: null,
    })
    supabaseMocks.createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    })

    const messages = [
      msg('user', `${IMAGE_MARKER} ${FAILED_MARKER} What do you see?`),
    ]
    const result = await resolveMediaBlocks(messages, null)

    const enriched = result[0] as { content: unknown[] }
    const text = enriched.content.find((b: any) => b.type === 'text') as any
    expect(text?.text).not.toContain('[MEDIA_UPLOAD_FAILED:')
    expect(text?.text).toBe('What do you see?')
  })

  it('multiple images, one URL fetch fails → still enriches with the successful one', async () => {
    const SECOND_IMAGE = '[MEDIA_UPLOAD: second.jpg | media-id-2 | image]'

    supabaseMocks.maybySingleMock
      // first image: success
      .mockResolvedValueOnce({ data: makeItem('path/first.jpg'), error: null })
      // second image: no storage_path
      .mockResolvedValueOnce({ data: makeItem(null), error: null })

    supabaseMocks.createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/first' },
      error: null,
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', `${IMAGE_MARKER} ${SECOND_IMAGE}`)]
    const result = await resolveMediaBlocks(messages, null)

    const enriched = result[0] as { content: unknown[] }
    const images = (enriched.content as any[]).filter((b) => b.type === 'image')
    expect(images).toHaveLength(1)
    expect(images[0].image).toBe('https://example.com/first')

    warnSpy.mockRestore()
  })

  it('all URL fetches fail → returns messages unchanged', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({ data: makeItem(null), error: null })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', IMAGE_MARKER)]
    const result = await resolveMediaBlocks(messages, null)

    expect(result).toBe(messages)
    warnSpy.mockRestore()
  })

  it('tenantId non-null → eq called with tenant_id', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({ data: makeItem(null), error: null })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', IMAGE_MARKER)]
    await resolveMediaBlocks(messages, 'tenant-xyz')

    const tenantEqCall = supabaseMocks.eqMock.mock.calls.find(
      (call) => call[0] === 'tenant_id',
    )
    expect(tenantEqCall).toBeDefined()
    expect(tenantEqCall![1]).toBe('tenant-xyz')
  })

  it('tenantId null → eq NOT called with tenant_id', async () => {
    supabaseMocks.maybySingleMock.mockResolvedValue({ data: makeItem(null), error: null })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const messages = [msg('user', IMAGE_MARKER)]
    await resolveMediaBlocks(messages, null)

    const tenantEqCall = supabaseMocks.eqMock.mock.calls.find(
      (call) => call[0] === 'tenant_id',
    )
    expect(tenantEqCall).toBeUndefined()
  })

  it('no user messages → returns unchanged', async () => {
    const messages = [msg('assistant', 'Hello there')]
    const result = await resolveMediaBlocks(messages, null)
    expect(result).toBe(messages)
  })
})
