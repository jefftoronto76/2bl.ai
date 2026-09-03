import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

// Path 3 fix (Design Handovers/heirloom-signup-signin-fixes-proposal.md §1):
// an existing Heirloom member who clicks a fresh admin/member ?invite=TOKEN
// link while already signed in used to have that invite silently dropped —
// acceptMemberInviteToken was only ever called from the false→true isSignedIn
// transition effect, which never fires for someone already signed in on
// mount. isSignedIn is true from the very first render in every test below
// (no transition occurs), so a passing test here can only be explained by the
// new mount-time effect actually firing the accept call — same proof shape as
// chatStore.storyInviteAcceptFailure.test.tsx uses for its story-invite
// sibling.

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

const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/heirloom/invites/accept')) return jsonResponse({ ok: true });
  return jsonResponse({ ok: true });
});

function acceptCalls() {
  return fetchMock.mock.calls.filter(([input]) =>
    (typeof input === 'string' ? input : input.toString()).includes('/heirloom/invites/accept'),
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

describe('Admin/member invite acceptance — already signed in on mount', () => {
  it('fires POST /api/heirloom/invites/accept for an already-signed-in visitor holding an invite token', async () => {
    render(
      <ChatProvider inviteToken="tok-abc">
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(acceptCalls().length).toBeGreaterThan(0), { timeout: 3000 });

    const [, init] = acceptCalls()[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({ token: 'tok-abc' });
  });

  it('fires exactly once even though both the mount effect and the transition effect could observe the condition', async () => {
    render(
      <ChatProvider inviteToken="tok-once">
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(acceptCalls().length).toBeGreaterThan(0), { timeout: 3000 });
    // Give any second, erroneous fire a chance to land before asserting.
    await new Promise((r) => setTimeout(r, 50));
    expect(acceptCalls().length).toBe(1);
  });

  it('does not fire when no invite token is present', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(acceptCalls().length).toBe(0);
  });
});
