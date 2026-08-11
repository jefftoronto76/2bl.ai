import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Regression test: stories was only ever fetched once, on mount. Accepting a
// story invite (POST /api/heirloom/story-invites/accept, fired automatically
// from chatStore.tsx's mount-time effect for an already-signed-in visitor)
// sets joinedStoryConfirmation, which drove a toast — but nothing re-fetched
// stories, so the newly-granted story never appeared in the sidebar without a
// manual page reload. This exercises the real ChatHero + SidebarV2 stack, and
// seeds a genuinely different /api/stories response on the second call, so it
// fails if refreshStories is only ever invoked (not if it actually lands new
// data in the stories list).

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({ isLoaded: true, isSignedIn: true, user: { providerUserId: 'u1' } }),
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

const FIRST_STORIES_RESPONSE = { stories: [{ id: 's1', name: 'Original Story' }] };
const SECOND_STORIES_RESPONSE = {
  stories: [
    { id: 's1', name: 'Original Story' },
    { id: 's2', name: 'Newly Joined Story' },
  ],
};

let storiesCallCount = 0;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  if (url === '/api/stories' && method === 'GET') {
    storiesCallCount += 1;
    return jsonResponse(storiesCallCount === 1 ? FIRST_STORIES_RESPONSE : SECOND_STORIES_RESPONSE);
  }
  if (url.includes('/story-invites/accept') && method === 'POST') {
    return jsonResponse({ story_title: 'Newly Joined Story' });
  }
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  storiesCallCount = 0;
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

describe('Story invite acceptance refreshes the sidebar stories list', () => {
  it('picks up the newly-granted story once joinedStoryConfirmation fires, without a reload', async () => {
    render(
      <ChatProvider storyInviteToken="tok-abc">
        <ChatHero />
      </ChatProvider>,
    );

    // Mount fetch resolves first — only the pre-existing story is present.
    await waitFor(() => expect(screen.getByText('Original Story')).toBeInTheDocument());
    expect(screen.queryByText('Newly Joined Story')).toBeNull();

    // The already-signed-in mount-time effect in chatStore.tsx fires
    // acceptStoryInviteToken automatically, which sets joinedStoryConfirmation
    // once its POST resolves — this drives both the toast and (the behavior
    // under test) a second /api/stories fetch.
    await waitFor(() => expect(screen.getByText("You've joined \"Newly Joined Story\"")).toBeInTheDocument());

    await waitFor(() => expect(screen.getByText('Newly Joined Story')).toBeInTheDocument());
    expect(screen.getByText('Original Story')).toBeInTheDocument();

    const storiesGetCalls = fetchMock.mock.calls.filter(
      ([input, init]) => input === '/api/stories' && (init?.method ?? 'GET') === 'GET',
    );
    expect(storiesGetCalls.length).toBeGreaterThanOrEqual(2);
  });
});
