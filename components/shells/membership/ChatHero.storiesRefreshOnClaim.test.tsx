import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Regression test: signing in on an anonymous session with an existing story
// (via the custom OTP "Save this chat" flow, which claims all local sessions
// through claimSessionsOnly/claimAllSessions in chatStore.tsx) correctly
// links the story to the new member server-side, but the sidebar's stories
// list was fetched once on mount only — before sign-in, when the visitor had
// nothing claimed yet — and nothing re-fetched it once the claim completed.
// This exercises the real ChatHero + ChatProvider stack across a live
// isSignedIn false -> true transition and seeds a genuinely different
// /api/stories response for the post-sign-in call, so it fails if the new
// effect merely fires without actually landing the newly-claimed story.

let mockAuthState: { isLoaded: boolean; isSignedIn: boolean; user: { providerUserId: string } | null } = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
};

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => mockAuthState,
  useAuthActions: () => ({
    signOut: vi.fn(),
    openSignIn: vi.fn(),
    openSignUp: vi.fn(),
    openUserProfile: vi.fn(),
  }),
}));

vi.mock('@/services/auth/useAuthFlow', () => ({
  useAuthFlow: () => ({
    stage: 'idle',
    contactType: null,
    contactValue: '',
    flowType: null,
    error: null,
    sendEmail: vi.fn(),
    sendPhone: vi.fn(),
    verifyOtp: vi.fn(),
    resend: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/services/auth/supabase', () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ANONYMOUS_STORIES_RESPONSE = { stories: [] };
const CLAIMED_STORIES_RESPONSE = { stories: [{ id: 's1', name: 'Claimed Story' }] };

let storiesCallCount = 0;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  if (url === '/api/stories' && method === 'GET') {
    storiesCallCount += 1;
    return jsonResponse(storiesCallCount === 1 ? ANONYMOUS_STORIES_RESPONSE : CLAIMED_STORIES_RESPONSE);
  }
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  mockAuthState = { isLoaded: true, isSignedIn: false, user: null };
  storiesCallCount = 0;
  fetchMock.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Sign-in claim refreshes the sidebar stories list', () => {
  it('re-fetches stories once isMember flips false -> true, without a reload', async () => {
    const { rerender } = render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    // Mount fetch resolves first — anonymous visitor has nothing claimed yet.
    await waitFor(() => expect(storiesCallCount).toBe(1));
    expect(screen.queryByText('Claimed Story')).toBeNull();

    // Simulate the custom OTP sign-in completing: isSignedIn flips true,
    // driving chatStore.tsx's wasSignedInRef transition (claimSessionsOnly)
    // and, under test, ChatHero's own isMember transition effect.
    mockAuthState = { isLoaded: true, isSignedIn: true, user: { providerUserId: 'u1' } };
    rerender(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getByText('Claimed Story')).toBeInTheDocument());

    const storiesGetCalls = fetchMock.mock.calls.filter(
      ([input, init]) => input === '/api/stories' && (init?.method ?? 'GET') === 'GET',
    );
    expect(storiesGetCalls.length).toBeGreaterThanOrEqual(2);
  });
});
