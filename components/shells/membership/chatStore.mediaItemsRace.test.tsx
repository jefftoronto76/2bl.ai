import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore } from './chatStore';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Regression test for the stale mediaItemsRef bug: a media item attached and
// then sent in the same turn could be missing from the outgoing /api/sage
// request's media_items field, because getMediaItems() read
// mediaItemsRef.current, which previously only updated on React re-render —
// and once a session already exists, send() has no await at all before
// reading it (the only await in send() is gated behind "if (!activeSessionId)").
// attachThenSend() below calls addMediaItem() and sendMessage() back to back
// with no await between them — the worst case, and the one real production
// code cannot fully rule out (Promise.all's exact microtask count before its
// continuation runs isn't a documented guarantee). See chatStore.tsx's
// addMediaItem — it now writes mediaItemsRef.current synchronously instead of
// waiting on a render, so the outgoing request is correct regardless of how
// many ticks separate the two calls.

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

// Captures every /api/sage request body sent, in order, so the test can
// inspect exactly what the second turn (the one with the attachment) sent.
const sageRequestBodies: Array<{
  media_items: { mediaItemId: string; type: string; filename: string }[] | null;
}> = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url === '/api/sessions' && method === 'POST') return jsonResponse({ id: 'sess-1' });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  if (url === '/api/sage' && method === 'POST') {
    sageRequestBodies.push(JSON.parse(init!.body as string));
    return streamResponse('ok');
  }
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  sageRequestBodies.length = 0;
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

function mkItem(overrides: {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  original_filename?: string;
}) {
  return {
    id: overrides.id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-1',
    story_id: null,
    type: 'image' as const,
    original_filename: overrides.original_filename ?? 'photo.jpg',
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: overrides.status,
    derived_content: overrides.status === 'ready' ? 'a description' : null,
    classification: null,
    error_message: overrides.status === 'failed' ? 'boom' : null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

function TestConsumer() {
  const { sendMessage, addMediaItem } = useChatStore();

  const sendFirst = () => {
    void sendMessage('first message, no attachment');
  };

  // Same shape as ChatInput.handleSend: addMediaItem() then sendMessage(),
  // with no render forced in between (real code separates these by a
  // Promise.all settling instead — this uses zero gap, the strictest case).
  const attachThenSend = () => {
    void (async () => {
      addMediaItem(mkItem({ id: 'media-1', status: 'pending' }));
      // Zero gap — call synchronously back to back, no await at all.
      void sendMessage('second message, with a photo attached');
    })();
  };

  return (
    <div>
      <button onClick={sendFirst}>send first</button>
      <button onClick={attachThenSend}>attach then send</button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-1', status: 'pending' }))}>
        attach pending A
      </button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-2', status: 'pending', original_filename: 'b.jpg' }))}>
        attach pending B
      </button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-1', status: 'ready' }))}>
        resolve A to ready
      </button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-2', status: 'failed', original_filename: 'b.jpg' }))}>
        resolve B to failed
      </button>
      <button onClick={() => void sendMessage('plain follow-up, no new attachment')}>
        send follow-up
      </button>
    </div>
  );
}

describe('addMediaItem + send() race (regression)', () => {
  it('includes the just-attached item in media_items on a same-turn send, with no session yet', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // No session exists yet — send() has an intervening await (POST /api/sessions)
    // before reading getMediaItems(), so this path already worked pre-fix.
    fireEvent.click(screen.getByText('attach then send'));

    await waitFor(() => expect(sageRequestBodies.length).toBeGreaterThan(0));
    expect(sageRequestBodies[0].media_items).toEqual([
      { mediaItemId: 'media-1', type: 'image', filename: 'photo.jpg' },
    ]);
  });

  it('includes the just-attached item in media_items on a same-turn send, for a message AFTER the first (the bug case)', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items).toBeNull();

    // A session now exists (sess-1) — send()'s only await is gated behind
    // "no session yet", so this second call has NO await before it reads
    // getMediaItems(). Before the fix, mediaItemsRef.current still held the
    // empty array from before addMediaItem ran, because the ref only updated
    // on React's next render.
    fireEvent.click(screen.getByText('attach then send'));

    await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    expect(sageRequestBodies[1].media_items).toEqual([
      { mediaItemId: 'media-1', type: 'image', filename: 'photo.jpg' },
    ]);
  });
});

// Regression coverage for the unbounded-resend bug: getMediaItems() used to
// map mediaItemsRef.current in full on every call, so every attachment ever
// made in the session — regardless of how long ago it resolved — got
// re-sent (and re-injected into the system prompt via resolveMediaContext)
// on every subsequent turn. Fixed by tracking which ids have already had
// their ready/failed state included in a request once (deliveredTerminalIdsRef
// in chatStore.tsx) and excluding those from later calls, while anything
// still pending/processing keeps being resent every turn until it resolves.
describe('getMediaItems() resend scoping', () => {
  it('stops resending an item once its ready state has been sent once, but keeps resending a still-pending one', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Turn 1: attach two files, both still pending/processing at send time.
    await act(async () => {
      fireEvent.click(screen.getByText('attach pending A'));
      fireEvent.click(screen.getByText('attach pending B'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId).sort()).toEqual([
      'media-1',
      'media-2',
    ]);

    // Between turns: A finishes processing (ready), B is still processing.
    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
    });

    // Turn 2: a plain follow-up, no new attachment. A's ready state has never
    // been sent before, so it must be included this once (the guide needs to
    // learn it's ready). B is still non-terminal, so it's included too.
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items?.map((m) => m.mediaItemId).sort()).toEqual([
      'media-1',
      'media-2',
    ]);

    // Between turns: B fails.
    await act(async () => {
      fireEvent.click(screen.getByText('resolve B to failed'));
    });

    // Turn 3: A's ready state was already delivered on turn 2 — excluded now.
    // B's failed state has never been sent before — included this once.
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(3));
    });
    expect(sageRequestBodies[2].media_items?.map((m) => m.mediaItemId).sort()).toEqual(['media-2']);

    // Turn 4: nothing changed since turn 3 — both terminal states already
    // delivered once, so media_items is empty (sent as null on the wire).
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(4));
    });
    expect(sageRequestBodies[3].media_items).toBeNull();
  });

  it('still includes every item when 2-3 files are attached and sent in the same turn (no regression from the resend-scoping change)', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('attach pending A'));
      fireEvent.click(screen.getByText('attach pending B'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });

    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId).sort()).toEqual([
      'media-1',
      'media-2',
    ]);
  });
});
