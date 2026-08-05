// Covers the Finding 2 fix: ChatInput is mounted once, unkeyed, and stays
// mounted across conversation switches (loadSession/newChat never remount
// it) — without a reset, a staged attachment or draft typed for one
// conversation silently carried into whatever conversation came next.

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

vi.mock('./chatStore', () => ({
  useChatStore: () => ({
    sendMessage: mockSendMessage,
    injectAssistantMessage: mockInjectAssistantMessage,
    state: mockState,
    addMediaItem: mockAddMediaItem,
    stop: mockStop,
  }),
}))

vi.mock('@/services/media/useMediaUpload', () => ({
  useMediaUpload: () => ({ upload: vi.fn(), isUploading: false, error: null }),
}))

import { ChatInput } from './ChatInput'

class MockMediaRecorder {
  state: 'inactive' | 'recording' = 'recording'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(public stream: MediaStream) {}
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

let mockTrackStop: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockState = { sessionId: 'session-a', isLoading: false, isMember: true, messages: [] }
  mockSendMessage.mockReset()
  mockAddMediaItem.mockReset()
  mockInjectAssistantMessage.mockReset()
  mockStop.mockReset()

  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()

  mockTrackStop = vi.fn()
  const mockStream = { getTracks: () => [{ stop: mockTrackStop }] } as unknown as MediaStream
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    writable: true,
    configurable: true,
  })
  global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder
})

afterEach(() => {
  cleanup()
})

function stageAttachment(container: HTMLElement) {
  const file = new File(['hello'], 'photo.jpg', { type: 'image/jpeg' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(fileInput, { target: { files: [file] } })
}

describe('ChatInput — composer reset on conversation switch', () => {
  it('clears a staged attachment and draft text when the session id changes', () => {
    const { container, rerender } = render(<ChatInput />)

    stageAttachment(container)
    const textarea = screen.getByPlaceholderText(/Share a memory/i)
    fireEvent.change(textarea, { target: { value: 'draft text' } })

    expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    expect(textarea).toHaveValue('draft text')

    mockState = { ...mockState, sessionId: 'session-b' }
    rerender(<ChatInput />)

    expect(screen.queryByText('photo.jpg')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Share a memory/i)).toHaveValue('')
  })

  it('revokes the staged attachment preview URL when the session id changes', () => {
    const { container, rerender } = render(<ChatInput />)

    stageAttachment(container)
    expect(URL.createObjectURL).toHaveBeenCalled()

    mockState = { ...mockState, sessionId: 'session-b' }
    rerender(<ChatInput />)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('closes the source menu when the session id changes', () => {
    const { rerender } = render(<ChatInput />)

    const plusButton = screen.getByRole('button', { name: /add to your story/i })
    fireEvent.click(plusButton)
    expect(plusButton).toHaveAttribute('aria-expanded', 'true')

    mockState = { ...mockState, sessionId: 'session-b' }
    rerender(<ChatInput />)

    expect(plusButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('treats a mid-recording session switch as an implicit cancel and stops the stream', async () => {
    const { rerender } = render(<ChatInput />)

    const micButton = screen.getByRole('button', { name: 'Record voice' })
    await act(async () => {
      fireEvent.click(micButton)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByLabelText('Cancel recording')).toBeInTheDocument()

    mockState = { ...mockState, sessionId: 'session-b' }
    await act(async () => {
      rerender(<ChatInput />)
    })

    expect(mockTrackStop).toHaveBeenCalled()
    expect(screen.queryByLabelText('Cancel recording')).not.toBeInTheDocument()
  })

  it('does NOT clear the composer on a re-render with the same session id (proves the guard, not just that the effect fires)', () => {
    const { container, rerender } = render(<ChatInput />)

    stageAttachment(container)
    const textarea = screen.getByPlaceholderText(/Share a memory/i)
    fireEvent.change(textarea, { target: { value: 'draft text' } })

    // New object reference, same sessionId value — simulates an unrelated
    // parent re-render, not a real conversation switch.
    mockState = { ...mockState }
    rerender(<ChatInput />)

    expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Share a memory/i)).toHaveValue('draft text')
  })
})
