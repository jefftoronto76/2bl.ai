import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

let mockIsSignedIn = false;

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({
    isLoaded: true,
    isSignedIn: mockIsSignedIn,
    user: mockIsSignedIn ? { providerUserId: 'u1' } : null,
  }),
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

// Reproduces the Vercel AI SDK data-stream shape /api/sage returns, so the
// "no story invite context" fallback (plain "Hi") exercises the real
// sendHidden round-trip rather than a plain JSON stub.
function streamResponse(text: string): Response {
  const payload = `0:${JSON.stringify(text)}\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sage') return streamResponse('Hello there');
  if (url.includes('/story-invites/accept')) return jsonResponse({ story_title: 'Grandpa’s War Years' });
  return jsonResponse({ ok: true });
});

function sageCallCount(): number {
  return fetchMock.mock.calls.filter(([input]) => input === '/api/sage').length;
}

beforeEach(async () => {
  mockIsSignedIn = false;
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

describe('Story-invite auto-greet + account-creation prompt', () => {
  it('not signed in: sends the contextual greeting, then a real detected ACCOUNT_CREATE marker that renders MagicLinkCard', async () => {
    mockIsSignedIn = false;
    render(
      <ChatProvider
        autoOpenChat
        storyInviteToken="tok-abc"
        storyInviteStoryTitle="Grandpa's War Years"
        storyInviteInviterName="Maria"
      >
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(
      () =>
        expect(
          screen.getAllByText(/Maria invited you to their story 'Grandpa's War Years'/).length,
        ).toBeGreaterThan(0),
      { timeout: 3000 },
    );

    // Confirms the marker was actually parsed out of the injected message's
    // content (not just that the raw "[ACCOUNT_CREATE: ...]" text is present
    // somewhere) — MessageList.tsx only renders MagicLinkCard once its marker
    // registry has matched the pattern.
    await waitFor(
      () => expect(screen.getByRole('region', { name: 'Sign in to continue' })).toBeTruthy(),
      { timeout: 3000 },
    );

    expect(
      screen.getAllByText(/It doesn.t look like you.re signed in, or have an account yet/).length,
    ).toBeGreaterThan(0);
    // The raw marker syntax itself must never leak into the rendered prose.
    expect(screen.queryAllByText(/ACCOUNT_CREATE/).length).toBe(0);

    // Deterministic, no-LLM path — the streaming endpoint was never called.
    expect(sageCallCount()).toBe(0);
  });

  it('already signed in: sends only the greeting — no second message, no MagicLinkCard', async () => {
    mockIsSignedIn = true;
    render(
      <ChatProvider
        autoOpenChat
        storyInviteToken="tok-abc"
        storyInviteStoryTitle="Grandpa's War Years"
        storyInviteInviterName="Maria"
      >
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(
      () =>
        expect(
          screen.getAllByText(/Maria invited you to their story 'Grandpa's War Years'/).length,
        ).toBeGreaterThan(0),
      { timeout: 3000 },
    );

    expect(screen.queryByRole('region', { name: 'Sign in to continue' })).toBeNull();
    expect(screen.queryAllByText(/signed in, or have an account yet/).length).toBe(0);
    expect(sageCallCount()).toBe(0);
  });

  it('no story invite token: falls back to the unchanged bare "Hi" round-trip', async () => {
    mockIsSignedIn = false;
    render(
      <ChatProvider autoOpenChat>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(sageCallCount()).toBeGreaterThan(0), { timeout: 3000 });
    expect(screen.queryByRole('region', { name: 'Sign in to continue' })).toBeNull();
  });
});
