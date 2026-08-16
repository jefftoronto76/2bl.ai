// Caption gate: the composer's supporting caption is shown only to visitors
// who aren't running the account — the 'viewer' role and anonymous visitors
// (memberRole null, no active members row). It is hidden for 'owner',
// 'admin' and 'member' alike.
//
// The regression this guards against is gating on `state.isMember` instead:
// that flag is Clerk sign-in state, not a role, so it cannot separate a
// viewer from a member (both are signed in) and cannot separate an owner
// from a member either. Every case below therefore pins isMember
// independently of memberRole.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

let mockState: {
  sessionId: string | null
  isLoading: boolean
  isMember: boolean
  memberRole: 'owner' | 'admin' | 'member' | 'viewer' | null
  messages: unknown[]
}

vi.mock('./chatStore', () => ({
  useChatStore: () => ({
    sendMessage: vi.fn(),
    injectAssistantMessage: vi.fn(),
    state: mockState,
    addMediaItem: vi.fn(),
    setPendingEcho: vi.fn(),
    stop: vi.fn(),
  }),
}))

vi.mock('@/services/media/useMediaUpload', () => ({
  useMediaUpload: () => ({ upload: vi.fn(), isUploading: false, error: null }),
}))

import { ChatInput } from './ChatInput'

const CAPTION = /never forgets a detail/i

beforeEach(() => {
  mockState = {
    sessionId: 'session-a',
    isLoading: false,
    isMember: true,
    memberRole: null,
    messages: [],
  }
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ChatInput — supporting caption gate', () => {
  it.each(['owner', 'admin', 'member'] as const)(
    "hides the caption for the '%s' role",
    (role) => {
      mockState.memberRole = role
      mockState.isMember = true
      render(<ChatInput />)
      expect(screen.queryByText(CAPTION)).not.toBeInTheDocument()
    },
  )

  it("shows the caption for the 'viewer' role", () => {
    mockState.memberRole = 'viewer'
    mockState.isMember = true
    render(<ChatInput />)
    expect(screen.getByText(CAPTION)).toBeInTheDocument()
  })

  it('shows the caption for an anonymous visitor (no members row)', () => {
    mockState.memberRole = null
    mockState.isMember = false
    render(<ChatInput />)
    expect(screen.getByText(CAPTION)).toBeInTheDocument()
  })

  it('separates viewer from member — both signed in, only viewer keeps it', () => {
    // isMember is true for both, so any gate keyed off isMember alone would
    // treat these two identically. The real members.role must drive it.
    mockState.isMember = true

    mockState.memberRole = 'viewer'
    const { unmount } = render(<ChatInput />)
    expect(screen.getByText(CAPTION)).toBeInTheDocument()
    unmount()

    mockState.memberRole = 'member'
    render(<ChatInput />)
    expect(screen.queryByText(CAPTION)).not.toBeInTheDocument()
  })

  it('hides the caption from a signed-in owner', () => {
    mockState.memberRole = 'owner'
    mockState.isMember = true
    render(<ChatInput />)
    expect(screen.queryByText(CAPTION)).not.toBeInTheDocument()
  })
})
