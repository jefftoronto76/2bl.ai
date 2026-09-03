// components/shells/membership/MessageList.authSyncToClerk.test.tsx
//
// D3 A/B fix: MessageList's handleAuthSuccess (MagicLinkCard.onSuccess)
// previously posted { name } only to /api/members/sync — a name typed
// while signing IN to an existing account never reached Clerk, since
// client.ts's signUp.update only ever fires on the sign-up branch. Now
// sets syncToClerk: true unconditionally (harmless same-value re-write on
// the sign-up branch, where Clerk already has the name).
//
// MagicLinkCard is mocked out (same technique as
// MessageList.invitePrefill.test.tsx) — its own onSuccess prop is invoked
// directly, since this test targets handleAuthSuccess, not MagicLinkCard's
// own rendering.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/api/members/sync')) return jsonResponse({ member: { id: 'm1' } });
  return jsonResponse({ ok: true });
});

function syncCalls() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/members/sync'));
}

function baseChatStore(overrides: Record<string, unknown> = {}) {
  return {
    claimCurrentSession: vi.fn(async () => {}),
    inviteToken: null,
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

function accountCreateMessage(): Message {
  return {
    id: 'm1',
    role: 'assistant',
    content: "Hi! I'm going to help you get set up. [ACCOUNT_CREATE: admin invite]",
    timestamp: 1,
  };
}

beforeEach(() => {
  mockChatStore = baseChatStore();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  magicLinkCardProps.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MessageList.handleAuthSuccess — syncToClerk (D3 A/B)', () => {
  it('posts syncToClerk: true alongside the name to /api/members/sync', async () => {
    render(
      <MessageList messages={[accountCreateMessage()]} isLoading={false} errorType={null} memories={EMPTY_MEMORIES} />,
    );

    const onSuccess = magicLinkCardProps.mock.calls[0][0].onSuccess as (name: string) => void;
    onSuccess('Jane');

    await waitFor(() => expect(syncCalls().length).toBeGreaterThan(0));
    const [, init] = syncCalls()[0];
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({ name: 'Jane', syncToClerk: true });
  });
});
