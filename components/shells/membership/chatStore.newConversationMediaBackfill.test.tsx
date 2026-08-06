// Regression coverage for the chat_id-backfill fix: an item attached on the
// very first message of a brand-new conversation is uploaded (and its
// media_items row created) before any session exists — ChatInput.tsx's
// handleSend uploads before calling sendMessage(), and sendMessage() is what
// lazily creates the session. Before this fix, that row's chat_id stayed
// null forever, and since every client-side status mechanism (Realtime,
// catch-up, the poll) filters by chat_id, the item's badge was stuck on
// "Processing…" permanently — confirmed live via a direct DB query
// (2026-08-06 investigation).
//
// The fix: useChatTurn.ts's send() now includes the pending item ids as
// `mediaItemIds` in the POST /api/sessions body when it has to create a new
// session, and the route backfills chat_id server-side in that same
// request (app/api/sessions/route.ts). This test proves the CLIENT half of
// that contract — the request actually carries the ids — and that the
// existing poll mechanism (already covered independently by
// chatStore.mediaPolling.test.tsx / chatStore.mediaPollOverlap.test.tsx)
// keeps working normally on the resulting session for that same item.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore } from './chatStore';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamResponse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function mkItem(overrides: { id: string; status: 'pending' | 'processing' | 'ready' | 'failed' }) {
  return {
    id: overrides.id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-1',
    story_id: null,
    type: 'image' as const,
    original_filename: 'campfire.jpg',
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: overrides.status,
    derived_content: overrides.status === 'ready' ? 'two people at a campfire' : null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

let mediaFetchQueue: Array<{ items: unknown[] }> = [];
let mediaFetchCallCount = 0;
let capturedSessionsPostBody: string | null | undefined;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url === '/api/sessions' && method === 'POST') {
    capturedSessionsPostBody = init?.body as string | undefined;
    return jsonResponse({ id: 'sess-1' });
  }
  if (url === '/api/sage' && method === 'POST') return streamResponse('ok');
  if (url.startsWith('/api/media')) {
    mediaFetchCallCount += 1;
    const next = mediaFetchQueue.shift() ?? { items: [] };
    return jsonResponse(next);
  }
  return jsonResponse({ ok: true });
});

beforeEach(async () => {
  await __resetPersistenceForTests('heirloom');
  mediaFetchQueue = [];
  mediaFetchCallCount = 0;
  capturedSessionsPostBody = undefined;
  fetchMock.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function TestConsumer() {
  const { sendMessage, addMediaItem, state, mediaItems } = useChatStore();
  const item = mediaItems.find((m) => m.id === 'media-campfire');
  return (
    <div>
      <div data-testid="sessionId">{state.sessionId ?? 'none'}</div>
      <div data-testid="status">{item?.status ?? 'none'}</div>
      <button onClick={() => void sendMessage('here are some photos')}>send</button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-campfire', status: 'pending' }))}>
        attach before session exists
      </button>
    </div>
  );
}

describe('media item attached before a session exists (first message of a new conversation)', () => {
  it('sends the pending mediaItemId in the POST /api/sessions body that creates the session', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // No session yet — this is the state ChatInput.tsx's upload happens in
    // for a brand-new conversation's first message.
    expect(screen.getByTestId('sessionId').textContent).toBe('none');

    await act(async () => {
      fireEvent.click(screen.getByText('attach before session exists'));
    });
    expect(screen.getByTestId('status').textContent).toBe('pending');

    await act(async () => {
      fireEvent.click(screen.getByText('send'));
      await waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
    });

    expect(capturedSessionsPostBody).toBeDefined();
    expect(JSON.parse(capturedSessionsPostBody as string)).toEqual({
      mediaItemIds: ['media-campfire'],
    });
  });

  it('does not send a body at all when there is no pending media (existing behavior unchanged)', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('send'));
      await waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
    });

    expect(capturedSessionsPostBody).toBeUndefined();
  });

  it('once the session exists, the ordinary poll mechanism still picks up the item going ready (server-side chat_id backfill is opaque to this test — it only proves the client keeps working end to end)', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Fake timers from before the item first goes 'pending' — the poll
    // effect arms (schedules its first setTimeout) synchronously the moment
    // that state commits, so switching to fake timers any later would leave
    // that first timer running for real in the background, unaffected by
    // vi.advanceTimersByTimeAsync below.
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByText('attach before session exists'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('send'));
      await vi.waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
    });

    mediaFetchCallCount = 0;

    mediaFetchQueue.push({ items: [mkItem({ id: 'media-campfire', status: 'ready' })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mediaFetchCallCount).toBe(1);
    expect(screen.getByTestId('status').textContent).toBe('ready');
  });
});
