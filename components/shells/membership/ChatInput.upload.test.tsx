// Covers the duplicate-reuse status bug: ChatInput.tsx used to hardcode
// status: 'pending' on every addMediaItem() call, including when the server
// detected a duplicate upload and reused an item that was already 'ready' (or
// 'processing') — silently resetting an already-delivered ready item back to
// pending client-side. Fixed by carrying the server-reported real status
// through useMediaUpload's UploadResult instead of assuming every result
// means "brand new and pending".
//
// Unlike ChatInput.test.tsx (which fully mocks useMediaUpload and is scoped
// to the composer-reset-on-switch concern), this file drives the actual
// upload path through handleSend with a controllable `upload` mock so it can
// assert exactly what status addMediaItem is called with.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

let mockState: {
  sessionId: string | null
  isLoading: boolean
  isMember: boolean
  messages: unknown[]
}
const mockSendMessage = vi.fn()
const mockAddMediaItem = vi.fn()
const mockInjectAssistantMessage = vi.fn()
const mockStop = vi.fn()
const mockUpload = vi.fn()
const mockSetPendingEcho = vi.fn()

vi.mock('./chatStore', () => ({
  useChatStore: () => ({
    sendMessage: mockSendMessage,
    injectAssistantMessage: mockInjectAssistantMessage,
    state: mockState,
    addMediaItem: mockAddMediaItem,
    setPendingEcho: mockSetPendingEcho,
    stop: mockStop,
  }),
}))

vi.mock('@/services/media/useMediaUpload', () => ({
  useMediaUpload: () => ({ upload: mockUpload, isUploading: false, error: null }),
}))

import { ChatInput } from './ChatInput'

beforeEach(() => {
  mockState = { sessionId: 'session-a', isLoading: false, isMember: true, messages: [] }
  mockSendMessage.mockReset()
  mockAddMediaItem.mockReset()
  mockInjectAssistantMessage.mockReset()
  mockStop.mockReset()
  mockUpload.mockReset()
  mockSetPendingEcho.mockReset()

  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

function stageAttachment(container: HTMLElement, filename = 'photo.jpg') {
  const file = new File(['hello'], filename, { type: 'image/jpeg' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [file] } })
}

describe('ChatInput — addMediaItem receives the real upload status, not a hardcoded pending', () => {
  it('seeds addMediaItem with status "ready" when the upload resolves a duplicate reusing an already-ready item', async () => {
    mockUpload.mockResolvedValue({
      mediaItemId: 'existing-item-1',
      type: 'image',
      filename: 'photo.jpg',
      status: 'ready',
    })

    const { container } = render(<ChatInput />)
    stageAttachment(container);

    const sendButton = screen.getByRole('button', { name: 'Send message' })
    await act(async () => {
      fireEvent.click(sendButton)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockAddMediaItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing-item-1', status: 'ready' }),
    )
  })

  it('still seeds addMediaItem with status "pending" for a genuinely fresh (non-duplicate) upload', async () => {
    mockUpload.mockResolvedValue({
      mediaItemId: 'brand-new-item-1',
      type: 'image',
      filename: 'photo.jpg',
      status: 'pending',
    })

    const { container } = render(<ChatInput />)
    stageAttachment(container);

    const sendButton = screen.getByRole('button', { name: 'Send message' })
    await act(async () => {
      fireEvent.click(sendButton)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockAddMediaItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brand-new-item-1', status: 'pending' }),
    )
  })
})
