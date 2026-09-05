// components/shells/membership/chatStore.claimAllSessionsSyncToClerk.test.tsx
//
// D3 A/B fix: claimAllSessions (SaveChatCTA's sign-in-branch submit path)
// previously posted { name } only to /api/members/sync, never reaching
// Clerk for an existing user typing their name at sign-in — the same D3
// gap MessageList's handleAuthSuccess had, now closed there via
// syncToClerk: true. This exercises claimAllSessions directly, bypassing
// SaveChatCTA's OTP-flow UI (unrelated to this change).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider, useChatStore } from './chatStore';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({ isLoaded: true, isSignedIn: true, user: { providerUserId: 'u1' } }),
}));

vi.mock('@/services/auth/supabase', () => ({
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/api/members/sync')) return jsonResponse({ member: { id: 'm1' } });
  if (url.includes('/claim')) return jsonResponse({ ok: true });
  return jsonResponse({ ok: true });
});

function syncCalls() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/members/sync'));
}

function TestHarness() {
  const { claimAllSessions } = useChatStore();
  return (
    <button onClick={() => void claimAllSessions('Jane')}>trigger</button>
  );
}

beforeEach(async () => {
  await __resetPersistenceForTests('heirloom');
  fetchMock.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('claimAllSessions — syncToClerk (D3 A/B)', () => {
  it('posts syncToClerk: true alongside the name to /api/members/sync', async () => {
    const { getByText } = render(
      <ChatProvider>
        <TestHarness />
      </ChatProvider>,
    );

    fireEvent.click(getByText('trigger'));

    await waitFor(() => expect(syncCalls().length).toBeGreaterThan(0));
    const [, init] = syncCalls()[0];
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({ name: 'Jane', syncToClerk: true });
  });
});
