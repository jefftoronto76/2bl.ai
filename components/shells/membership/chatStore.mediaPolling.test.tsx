// Covers the polling-effect self-cancellation bug: the pending-item poll
// effect (chatStore.tsx, "Polling fallback for pending media items") used to
// only reschedule itself by depending on `mediaItems` changing, and its own
// fetch callback only called setMediaItems (the only thing that would
// re-trigger the effect) when a given 3-second check found at least one
// newly-terminal item. Real processing routinely takes longer than 3
// seconds, so the very first check often found nothing — and the effect
// then never rescheduled, ever, until something unrelated changed
// mediaItems. Fixed by making the poll self-sustaining: it reschedules
// itself from inside its own continuation based on whether anything is
// still pending/processing, independent of whether a given round found
// something new.
//
// Uses fake timers (enabled only once the async session setup is done, so
// the initial real-timer-based waitFor()s for session creation aren't
// affected) to deterministically control the 3-second poll interval without
// real wall-clock waits.

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
    original_filename: 'photo.jpg',
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: overrides.status,
    derived_content: overrides.status === 'ready' ? 'a description' : null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

// Queue of successive /api/media?...&status=ready,failed responses — shifted
// one per call so each round's response is controlled explicitly.
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
  const item = mediaItems.find((m) => m.id === 'media-1');
  return (
    <div>
      <div data-testid="sessionId">{state.sessionId ?? 'none'}</div>
      <div data-testid="status">{item?.status ?? 'none'}</div>
      <button onClick={() => void sendMessage('hi')}>send</button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-1', status: 'pending' }))}>
        attach pending
      </button>
    </div>
  );
}

describe('pending-item poll effect stays self-sustaining across empty rounds', () => {
  it('keeps polling on schedule through several consecutive empty checks, then stops once the item resolves', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Establish a session first, with real timers — fake timers are only
    // switched on below, once this async setup has fully settled.
    await act(async () => {
      fireEvent.click(screen.getByText('send'));
      await waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
    });

    // The session-establish phase above also triggers the one-shot catch-up
    // fetch (chatStore.tsx's separate "Media items — catch-up" effect, which
    // fires once per sessionId change) — reset the counter so it only
    // reflects the recurring POLL effect's calls from here on.
    mediaFetchCallCount = 0;
    vi.useFakeTimers();

    // Attach a pending item — this is what arms the poll effect.
    act(() => {
      fireEvent.click(screen.getByText('attach pending'));
    });
    expect(screen.getByTestId('status').textContent).toBe('pending');

    // Round 1 (3s): the check finds nothing new — the item is still processing.
    mediaFetchQueue.push({ items: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(1);
    expect(screen.getByTestId('status').textContent).toBe('pending');

    // Round 2 (another 3s): STILL finds nothing new. This is the regression
    // this test guards against — the old code never reached this fetch call
    // at all, because nothing had changed `mediaItems` to re-arm the effect.
    mediaFetchQueue.push({ items: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(2);
    expect(screen.getByTestId('status').textContent).toBe('pending');

    // Round 3: the item has genuinely finished processing.
    mediaFetchQueue.push({ items: [mkItem({ id: 'media-1', status: 'ready' })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(3);
    expect(screen.getByTestId('status').textContent).toBe('ready');

    // The item is now terminal — the chain must stop for real, not turn into
    // an infinite poll. Advancing another full interval must NOT produce a
    // new fetch call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(3);
  });
});
