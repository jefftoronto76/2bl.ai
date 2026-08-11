import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

// Regression coverage: acceptStoryInviteToken's two failure paths (a
// non-ok response, and a rejected fetch promise) used to only console.error
// — the visitor was left signed in with no story and no explanation. Both
// paths must now also surface the same generic, no-LLM fallback message via
// injectAssistantMessage. isSignedIn: true so chatStore.tsx's mount-time
// story invite effect fires acceptStoryInviteToken automatically, for real,
// without needing to drive a sign-up flow through MagicLinkCard first.

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

// Either 'bad-response' (accept resolves with a non-ok status) or
// 'network-error' (the fetch call itself rejects) — set per-test.
let acceptFailureMode: 'bad-response' | 'network-error' = 'bad-response';

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/story-invites/accept')) {
    if (acceptFailureMode === 'network-error') {
      throw new TypeError('Failed to fetch');
    }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return jsonResponse({ ok: true });
});

const FALLBACK_TEXT =
  /Something went wrong adding you to this story\. Try refreshing the page/;

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

describe('Story invite accept failure — visitor-facing fallback message', () => {
  it('bad response (res.ok false): injects the fallback message and logs the real error', async () => {
    acceptFailureMode = 'bad-response';
    render(
      <ChatProvider storyInviteToken="tok-abc">
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(FALLBACK_TEXT).length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    // console.error is still the developer-facing channel — additive, not
    // replaced.
    expect(console.error).toHaveBeenCalledWith(
      '[heirloom/chat] story invite accept failed:',
      401,
      'Unauthorized',
    );
    // No success toast — the failure path must not also claim success.
    expect(screen.queryByText(/You've joined/)).toBeNull();
  });

  it('network error (fetch rejects): injects the same fallback message and logs the real error', async () => {
    acceptFailureMode = 'network-error';
    render(
      <ChatProvider storyInviteToken="tok-abc">
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(FALLBACK_TEXT).length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    expect(console.error).toHaveBeenCalledWith(
      '[heirloom/chat] story invite accept error:',
      expect.any(TypeError),
    );
    expect(screen.queryByText(/You've joined/)).toBeNull();
  });
});
