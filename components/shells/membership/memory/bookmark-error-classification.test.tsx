// Covers Bug C: create()'s four distinct failure shapes (network throw, 4xx,
// 5xx, malformed 2xx body) must classify into distinct ChatErrorType values
// and render the matching components/chat/errorCopy.ts ERROR_COPY text, not
// one hardcoded string. Mirrors bookmark-render.test.tsx's mocking
// convention (this shell's established pattern). The 403 "account required"
// case (Bug A) gets its own dedicated ChatErrorType/copy since it's an
// expected, common rejection, not a rare infra failure.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { ChatProvider } from '../chatStore';
import { ChatHero } from '../ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { ERROR_COPY } from '@/components/chat/errorCopy';

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

const SESSION = {
  id: 'sess-classify',
  messages: [
    { id: 'm1', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 1 },
  ],
  updated_at: '2026-08-06T00:00:00.000Z',
  visitor_name: null,
  title: 'Classify session',
  starred: false,
  memory_count: 0,
};

describe('memory bookmark — error classification', () => {
  let postHandler: (() => Response) | 'throw';

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
    if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
    if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
    if (url.endsWith('/memories') && method === 'GET') return jsonResponse({ memories: [] });
    if (url.endsWith('/memories') && method === 'POST') {
      if (postHandler === 'throw') throw new TypeError('Failed to fetch');
      return postHandler();
    }
    return jsonResponse({ ok: true });
  });

  beforeEach(() => {
    postHandler = () => jsonResponse({ memory: null });
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

  async function clickBookmarkAndGetErrorGroup(): Promise<HTMLElement> {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('It sounds like a beautiful memory.').length).toBeGreaterThan(0));
    const group = screen
      .getAllByText('It sounds like a beautiful memory.')
      .map((n) => n.closest('.group'))
      .find((g): g is HTMLElement => g !== null)!;
    fireEvent.click(within(group).getByRole('button', { name: 'Keep this as a memory' }));
    return group;
  }

  it('classifies a fetch() throw as "network"', async () => {
    postHandler = 'throw';
    const group = await clickBookmarkAndGetErrorGroup();

    await waitFor(() => expect(within(group).getByText(ERROR_COPY.network)).toBeTruthy());
  });

  it('classifies a 403 as "account_required" — Bug A\'s anonymous/unlinked-member rejection', async () => {
    postHandler = () => jsonResponse({ error: 'An account is required to save memories.' }, 403);
    const group = await clickBookmarkAndGetErrorGroup();

    await waitFor(() => expect(within(group).getByText(ERROR_COPY.account_required)).toBeTruthy());
  });

  it('classifies a non-403 4xx as "unknown" — no dedicated type for generic validation failures', async () => {
    postHandler = () => jsonResponse({ error: 'anchor_message_id is required' }, 400);
    const group = await clickBookmarkAndGetErrorGroup();

    await waitFor(() => expect(within(group).getByText(ERROR_COPY.unknown)).toBeTruthy());
  });

  it('classifies a 5xx as "server_error", distinct from "unknown"', async () => {
    postHandler = () => jsonResponse({ error: 'internal error' }, 500);
    const group = await clickBookmarkAndGetErrorGroup();

    await waitFor(() => expect(within(group).getByText(ERROR_COPY.server_error)).toBeTruthy());
  });

  it('classifies a 2xx with a missing/malformed memory field as "invalid_response"', async () => {
    postHandler = () => jsonResponse({ memory: null }, 200);
    const group = await clickBookmarkAndGetErrorGroup();

    await waitFor(() => expect(within(group).getByText(ERROR_COPY.invalid_response)).toBeTruthy());
  });

  it('"Try again" re-invokes create() for the same anchor and clears the error on success', async () => {
    postHandler = () => jsonResponse({ error: 'internal error' }, 500);
    const group = await clickBookmarkAndGetErrorGroup();
    await waitFor(() => expect(within(group).getByText(ERROR_COPY.server_error)).toBeTruthy());

    postHandler = () =>
      jsonResponse({
        memory: {
          id: 'mem-1',
          session_id: 'sess-classify',
          anchor_message_id: 'm1',
          source_kind: 'conversation',
          title: 'A Beautiful Memory',
          body: 'It sounds like a beautiful memory.',
          status: 'draft',
          created_at: '2026-08-06T00:00:00.000Z',
          updated_at: '2026-08-06T00:00:00.000Z',
        },
      });
    fireEvent.click(within(group).getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(within(group).getByText('A Beautiful Memory')).toBeTruthy());
    expect(within(group).queryByText(ERROR_COPY.server_error)).toBeNull();
  });
});
