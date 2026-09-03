// components/shells/membership/ChatHero.nameCompletionGate.test.tsx
//
// Item 3b — integration coverage for where NameCompletionGate sits relative
// to GateView inside ChatHero. Same full-provider pattern as
// ChatHero.shareHeirloom.test.tsx.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

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
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const RECENT = '2026-09-10T00:00:00Z';

let meResponse: { name: string | null; invitedName: string | null; createdAt: string | null } = {
  name: 'Jane',
  invitedName: null,
  createdAt: RECENT,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  if (url.startsWith('/api/members/me')) return jsonResponse(meResponse);
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  fetchMock.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  meResponse = { name: 'Jane', invitedName: null, createdAt: RECENT };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NameCompletionGate inside ChatHero', () => {
  it('GateView still wins when isGated is true — no /api/members/me fetch fires', async () => {
    render(
      <ChatProvider gateEnabled isAuthorized={false}>
        <ChatHero />
      </ChatProvider>,
    );

    // GateView's own content — the mocked auth state is signed-in, so this
    // is GateView's "any signed-in visitor reaching here is pending or just
    // signed up" branch, not the signed-out WaitlistView copy.
    await waitFor(() => expect(screen.getByText("You're on the list.")).toBeInTheDocument());

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/members/me'))).toBe(false);
  });

  it('renders the normal chat surface when the member already has a name', async () => {
    meResponse = { name: 'Jane', invitedName: null, createdAt: RECENT };

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/members/me'))).toBe(true),
    );
    await waitFor(() => expect(screen.getByPlaceholderText(/ask your guide|share a memory/i)).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('First name')).not.toBeInTheDocument();
  });

  it('replaces the chat surface with the interstitial for a nameless, post-cutover member', async () => {
    meResponse = { name: null, invitedName: null, createdAt: RECENT };

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getByPlaceholderText('First name')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/ask your guide|share a memory/i)).not.toBeInTheDocument();
  });
});
