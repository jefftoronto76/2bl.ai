// Regression coverage for the visual-reordering bug: media items within an
// open session sometimes visually jumped to the wrong position instead of
// staying in stable chronological order. services/media/index.ts's
// listByChat correctly returns items created_at-ascending — the bug was
// entirely client-side, in chatStore.tsx's merge logic. All three merge
// sites (the catch-up-on-session-load fetch, the pending-item poll, and
// addMediaItem — shared by the Realtime subscription and the optimistic
// upload path) used to push an unmatched fetched item onto the END of the
// array unconditionally, regardless of its actual created_at relative to
// items already present. A late-arriving item — e.g. one whose Realtime
// UPDATE event was missed and only caught by a later poll tick, or a
// catch-up fetch racing a fresh upload — could have an earlier created_at
// than items already in the array and would still land last.
//
// Fixed by routing every merge through mergeMediaItems (mediaItemMerge.ts),
// which re-sorts by created_at ascending after merging, regardless of
// whether a given item was updated in place or freshly appended. Unit
// coverage for the sort itself lives in mediaItemMerge.test.ts; this file
// covers the same bug at the level a regression would actually reappear —
// through chatStore's real catch-up and poll effects — mirroring the
// existing convention in chatStore.mediaPolling.test.tsx and
// chatStore.mediaItemsRace.test.tsx for exercising those effects via a real
// mounted ChatProvider rather than testing the effects' internals directly.

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

function mkItem(overrides: {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  original_filename?: string;
}) {
  return {
    id: overrides.id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-1',
    story_id: null,
    type: 'image' as const,
    original_filename: overrides.original_filename ?? `${overrides.id}.jpg`,
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: overrides.status,
    derived_content: overrides.status === 'ready' ? 'a description' : null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: overrides.created_at,
    updated_at: overrides.created_at,
  };
}

let mediaFetchQueue: Array<{ items: unknown[] }> = [];
let mediaFetchCallCount = 0;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url === '/api/sessions' && method === 'POST') return jsonResponse({ id: 'sess-1' });
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
  return (
    <div>
      <div data-testid="sessionId">{state.sessionId ?? 'none'}</div>
      <div data-testid="order">{mediaItems.map((m) => m.id).join(',')}</div>
      <button onClick={() => void sendMessage('hi')}>send</button>
      <button
        onClick={() =>
          addMediaItem(mkItem({ id: 'b', status: 'pending', created_at: '2026-08-18T00:01:00.000Z' }))
        }
      >
        attach b
      </button>
      <button
        onClick={() =>
          addMediaItem(mkItem({ id: 'a', status: 'ready', created_at: '2026-08-18T00:00:00.000Z' }))
        }
      >
        realtime-update a (earlier than b, not yet in mediaItems)
      </button>
    </div>
  );
}

async function establishSession() {
  render(
    <ChatProvider>
      <TestConsumer />
    </ChatProvider>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
  });
  // The session-establish phase also triggers the one-shot catch-up fetch —
  // reset the counter so later assertions reflect only what each test does.
  mediaFetchCallCount = 0;
}

describe('media items stay in chronological (created_at) order across every merge site', () => {
  it('catch-up fetch: items resolve in created_at order even when the API response itself is not in that order', async () => {
    // Queued before the session is established, so the catch-up effect's own
    // first (and only, in this test) fetch — which fires the moment
    // sessionId is set — picks this response up directly. The response
    // itself is deliberately NOT in created_at order (server order is
    // whatever listByChat's real query returns, ascending — but the merge
    // logic must not depend on that; it must sort regardless of fetch
    // order), catching a regression in the merge step itself rather than
    // only in "does the server send it out of order," which it doesn't.
    mediaFetchQueue.push({
      items: [
        mkItem({ id: 'c', status: 'ready', created_at: '2026-08-18T00:02:00.000Z' }),
        mkItem({ id: 'a', status: 'ready', created_at: '2026-08-18T00:00:00.000Z' }),
        mkItem({ id: 'b', status: 'ready', created_at: '2026-08-18T00:01:00.000Z' }),
      ],
    });

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('send'));
      await waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
    });

    await waitFor(() => expect(screen.getByTestId('order').textContent).toBe('a,b,c'));
  });

  it('poll fetch: an item that resolves with an earlier created_at than an item already in the array is inserted in the correct position, not appended', async () => {
    await establishSession();
    vi.useFakeTimers();

    // Seed the array with two items via addMediaItem, oldest first, as if
    // catch-up/Realtime had already delivered them correctly.
    act(() => {
      fireEvent.click(screen.getByText('attach b')); // 'b', created_at 00:01:00, status pending — arms the poll
    });
    expect(screen.getByTestId('order').textContent).toBe('b');

    // The poll resolves with 'a' (created_at 00:00:00 — EARLIER than 'b')
    // and 'c' (00:02:00 — later than 'b') in the same round. Before the fix,
    // both would have been appended in fetch-response order, after 'b'
    // regardless of 'a' being chronologically first. mkItem('a') is 'ready'
    // so it also stops the poll's own pending/processing check from firing
    // once more after this round resolves.
    mediaFetchQueue.push({
      items: [
        mkItem({ id: 'a', status: 'ready', created_at: '2026-08-18T00:00:00.000Z' }),
        mkItem({ id: 'c', status: 'ready', created_at: '2026-08-18T00:02:00.000Z' }),
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mediaFetchCallCount).toBe(1);
    expect(screen.getByTestId('order').textContent).toBe('a,b,c');
  });

  it('addMediaItem (Realtime path): an update for an item not yet locally known, with an earlier created_at than an item already present, is inserted in position', async () => {
    await establishSession();

    // 'b' is already present (created_at 00:01:00).
    act(() => {
      fireEvent.click(screen.getByText('attach b'));
    });
    expect(screen.getByTestId('order').textContent).toBe('b');

    // A Realtime UPDATE arrives for 'a' — an item this client has never seen
    // before (e.g. catch-up hadn't fetched it yet) — whose created_at
    // (00:00:00) is earlier than 'b'. addMediaItem's not-found branch used
    // to push it onto the end regardless.
    act(() => {
      fireEvent.click(screen.getByText('realtime-update a (earlier than b, not yet in mediaItems)'));
    });

    expect(screen.getByTestId('order').textContent).toBe('a,b');
  });
});
