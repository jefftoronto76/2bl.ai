// Regression coverage for the pre-merge review of PR #286's Bug 3 fix: does a
// successful poll round's own setMediaItems() call — which changes
// `mediaItems`, a dependency of the SAME effect — ever cause two live poll
// chains (effect cleanup racing the internal setTimeout recursion)?
//
// poll() and the effect's cleanup close over the SAME mutable `timer`/
// `cancelled` bindings, not copies — so even though a round's setMediaItems
// call and its own poll() recursion both touch state/timers in the same
// continuation, React always runs the old effect instance's cleanup (which
// reads the CURRENT value of `timer`, already reassigned by that round's
// poll() call) before the new effect instance runs. This test stresses the
// worst case: every single round updates mediaItems (forcing a
// dependency-driven effect restart every time), while one item stays
// non-terminal throughout so the internal poll()-recursion also wants to
// keep going on its own — and asserts via vi.getTimerCount() that at most
// one timer is ever scheduled for this effect at a time, not just that the
// fetch call count doesn't balloon.

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

function mkItem(id: string, status: 'pending' | 'processing' | 'ready' | 'failed') {
  return {
    id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-1',
    story_id: null,
    type: 'image' as const,
    original_filename: `${id}.jpg`,
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status,
    derived_content: status === 'ready' ? 'a description' : null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
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
      <div data-testid="statuses">
        {mediaItems.map((m) => `${m.id}:${m.status}`).join(',')}
      </div>
      <button onClick={() => void sendMessage('hi')}>send</button>
      <button onClick={() => addMediaItem(mkItem('media-1', 'pending'))}>attach media-1</button>
    </div>
  );
}

describe('poll effect never has more than one live/scheduled chain', () => {
  it('stays at exactly one pending timer even when EVERY round updates mediaItems (forcing a dependency-driven effect restart each time)', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('send'));
      await waitFor(() => expect(screen.getByTestId('sessionId').textContent).toBe('sess-1'));
    });
    mediaFetchCallCount = 0; // drop the one-shot catch-up fetch from session-establish

    vi.useFakeTimers();

    act(() => {
      fireEvent.click(screen.getByText('attach media-1'));
    });

    // Sanity: exactly one timer scheduled right after arming (media-1 pending).
    expect(vi.getTimerCount()).toBe(1);

    // Round 1: resolves media-2 to ready — a genuine mediaItems change.
    mediaFetchQueue.push({ items: [mkItem('media-2', 'ready')] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(1);
    // media-1 is still pending -> exactly one timer should be scheduled for
    // the next round. If the dependency-driven effect restart raced the
    // internal setTimeout recursion, this would be 2 (old chain's freshly
    // rescheduled timer + new effect instance's freshly scheduled timer).
    expect(vi.getTimerCount()).toBe(1);

    // Round 2: resolves media-3 to ready — another genuine mediaItems change.
    mediaFetchQueue.push({ items: [mkItem('media-3', 'ready')] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(2);
    expect(vi.getTimerCount()).toBe(1);

    // Round 3: resolves media-4 to ready — a third genuine mediaItems change.
    mediaFetchQueue.push({ items: [mkItem('media-4', 'ready')] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mediaFetchCallCount).toBe(3);
    expect(vi.getTimerCount()).toBe(1);

    // No doubled/overlapping fetches ever occurred — exactly 3 calls for 3
    // rounds, not 4+, and never more than one timer scheduled at a time.
    expect(screen.getByTestId('statuses').textContent).toBe(
      'media-1:pending,media-2:ready,media-3:ready,media-4:ready',
    );
  });
});
