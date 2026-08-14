// Covers MessageList's visitorName/visitorEmail/visitorPhone fallback to the
// admin/member invite's own email/phone/invited_name (chatStore's
// invitedEmail/invitedPhone/invitedName) when no NAME/EMAIL/PHONE marker has
// fired yet in the conversation. Previously these fields only ever came from
// scanning assistant messages for markers — invite-supplied contact info
// never reached MagicLinkCard's initialName/initialEmail/initialPhone props
// at all, even though createMemberInvite already stores it. A marker, once
// present, still wins over the invite value (it reflects what the visitor
// actually told the guide, which can differ from what the admin entered).
//
// MagicLinkCard itself is mocked out — its own rendering (Clerk auth flow,
// captcha, OTP stages) is unrelated to this fallback logic; this file only
// asserts on the props MessageList computes and passes to it.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MessageList } from './MessageList';
import type { UseMemoriesReturn } from '@/services/chat/ui/v1/useMemories';
import type { Message } from './chatStore';

const magicLinkCardProps = vi.fn();
vi.mock('./MagicLinkCard', () => ({
  MagicLinkCard: (props: Record<string, unknown>) => {
    magicLinkCardProps(props);
    return <div data-testid="magic-link-card" />;
  },
}));

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

let mockChatStore: Record<string, unknown>;
vi.mock('./chatStore', async () => {
  const actual = await vi.importActual<typeof import('./chatStore')>('./chatStore');
  return {
    ...actual,
    useChatStore: () => mockChatStore,
  };
});

function baseChatStore(overrides: Record<string, unknown> = {}) {
  return {
    claimCurrentSession: vi.fn(),
    inviteToken: 'tok-abc',
    storyInviteToken: null,
    invitedName: null,
    invitedEmail: null,
    invitedPhone: null,
    mediaItems: [],
    retry: vi.fn(),
    regenerate: vi.fn(),
    setActiveVersion: vi.fn(),
    editMessage: vi.fn(),
    resendMessage: vi.fn(),
    bumpMemoryCount: vi.fn(),
    pendingEcho: null,
    state: { sessionId: null },
    ...overrides,
  };
}

const EMPTY_MEMORIES: UseMemoriesReturn = {
  memories: [],
  getByAnchor: () => undefined,
  isPending: () => false,
  getPendingKind: () => null,
  hasError: () => false,
  getErrorType: () => null,
  hasOpenDraft: () => false,
  isLoaded: true,
  create: vi.fn(),
  keep: vi.fn(),
  discard: vi.fn(),
  rename: vi.fn(),
  reviseBlocks: vi.fn(),
  assignToStory: vi.fn(),
  removeFromStory: vi.fn(),
};

function accountCreateMessage(extraMarker = ''): Message {
  return {
    id: 'm1',
    role: 'assistant',
    content: `Hi! I'm going to help you get set up.${extraMarker} [ACCOUNT_CREATE: admin invite]`,
    timestamp: 1,
  };
}

afterEach(() => {
  cleanup();
  magicLinkCardProps.mockReset();
});

function renderList(messages: Message[]) {
  render(
    <MessageList messages={messages} isLoading={false} errorType={null} memories={EMPTY_MEMORIES} />,
  );
}

describe('MessageList — invite email/phone/name pre-fill', () => {
  it('pre-fills email from the invite when no EMAIL marker has fired yet', () => {
    mockChatStore = baseChatStore({ invitedEmail: 'invitee@example.com' });
    renderList([accountCreateMessage()]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialEmail: 'invitee@example.com' }),
    );
  });

  it('leaves email empty when the invite has none and no marker has fired', () => {
    mockChatStore = baseChatStore({ invitedEmail: null });
    renderList([accountCreateMessage()]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialEmail: null }),
    );
  });

  it('an EMAIL marker overrides the invite email', () => {
    mockChatStore = baseChatStore({ invitedEmail: 'invitee@example.com' });
    renderList([accountCreateMessage(' [EMAIL: real@example.com]')]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialEmail: 'real@example.com' }),
    );
  });

  it('pre-fills phone from the invite when no PHONE marker has fired yet', () => {
    mockChatStore = baseChatStore({ invitedPhone: '+15551234567' });
    renderList([accountCreateMessage()]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialPhone: '+15551234567' }),
    );
  });

  it('leaves phone empty when the invite has none and no marker has fired', () => {
    mockChatStore = baseChatStore({ invitedPhone: null });
    renderList([accountCreateMessage()]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialPhone: null }),
    );
  });

  it('a PHONE marker overrides the invite phone', () => {
    mockChatStore = baseChatStore({ invitedPhone: '+15551234567' });
    renderList([accountCreateMessage(' [PHONE: +19998887777]')]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialPhone: '+19998887777' }),
    );
  });

  it('pre-fills name from the invite when no NAME marker has fired yet', () => {
    mockChatStore = baseChatStore({ invitedName: 'Ada Lovelace' });
    renderList([accountCreateMessage()]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialName: 'Ada Lovelace' }),
    );
  });

  it('leaves name empty when the invite has none and no marker has fired', () => {
    mockChatStore = baseChatStore({ invitedName: null });
    renderList([accountCreateMessage()]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialName: null }),
    );
  });

  it('a NAME marker overrides the invite name', () => {
    mockChatStore = baseChatStore({ invitedName: 'Ada Lovelace' });
    renderList([accountCreateMessage(' [NAME: Grace Hopper]')]);

    expect(magicLinkCardProps).toHaveBeenCalledWith(
      expect.objectContaining({ initialName: 'Grace Hopper' }),
    );
  });
});
