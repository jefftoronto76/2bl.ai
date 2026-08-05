import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore } from './chatStore';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

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

// When true, the next /api/sage POST throws (simulating a network failure —
// fetch() itself never resolves a response) instead of streaming a reply.
// Toggled mid-test to simulate a failed request followed by a successful
// Retry or a successful brand-new message.
let sageShouldFail = false;

// Overridable per test — the recentSessions list GET /api/sessions returns on
// mount. Defaults to empty so the cross-device auto-recovery effect (which
// would otherwise auto-hydrate into whichever session it returns) is a no-op
// for tests that don't care about it.
let recentSessionsResponse: Array<{
  id: string;
  messages: unknown[];
  updated_at: string;
  visitor_name: string | null;
  title: string;
  starred: boolean;
}> = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: recentSessionsResponse });
  if (url === '/api/sessions' && method === 'POST') return jsonResponse({ id: 'sess-1' });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  if (url === '/api/sage' && method === 'POST') {
    sageRequestBodies.push(JSON.parse(init!.body as string));
    if (sageShouldFail) throw new TypeError('network error');
    return streamResponse('ok');
  }
  return jsonResponse({ ok: true });
});

beforeEach(async () => {
  // ChatProvider opts into IndexedDB persistence (persistNamespace: 'heirloom')
  // and fake-indexeddb (vitest.setup.ts) is a real, stateful implementation
  // that otherwise survives across tests in this file — without this, a
  // later test's mount-time rehydration effect picks up an earlier test's
  // buffered thread/session id before that test's own setup runs, which is
  // pure test-isolation noise, unrelated to the code under test.
  await __resetPersistenceForTests('heirloom');
  sageRequestBodies.length = 0;
  sageShouldFail = false;
  recentSessionsResponse = [];
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
  const { sendMessage, addMediaItem, retry, newChat, loadSession } = useChatStore();

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
      <button onClick={() => addMediaItem(mkItem({ id: 'media-1', status: 'failed' }))}>
        resolve A to failed
      </button>
      <button onClick={() => addMediaItem(mkItem({ id: 'media-2', status: 'failed', original_filename: 'b.jpg' }))}>
        resolve B to failed
      </button>
      <button onClick={() => void sendMessage('plain follow-up, no new attachment')}>
        send follow-up
      </button>
      <button onClick={() => void retry()}>retry</button>
      <button onClick={newChat}>new chat</button>
      <button onClick={() => loadSession('sess-B')}>load session B</button>
      <button onClick={() => loadSession('sess-1')}>reload session A (same session)</button>
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

// Regression coverage for the delivered-on-read bug: getMediaItems() used to
// mark a terminal item "delivered" the moment the request was BUILT, not once
// it actually succeeded. If that request then failed outright (network error,
// no Retry), the item was permanently excluded from every later request even
// though the guide never received it. Fixed by moving the marking into
// markMediaItemsDelivered, called by useChatTurn.ts only from a request's true
// success completion — see chatStore.tsx's getMediaItems/markMediaItemsDelivered.
describe('delivered marking happens on confirmed success, not on read/build', () => {
  it('does NOT mark a terminal item delivered when its request fails outright — it is still included in the next message', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Turn 1: item A is already ready when the request is built; the request
    // fails outright (network error) before any response is ever received.
    sageShouldFail = true;
    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // Turn 2: the visitor does not hit Retry — they just send a new message.
    // A's ready state was never actually delivered, so it must be included again.
    sageShouldFail = false;
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);
  });

  it('marks a terminal item delivered only once its Retry succeeds, then excludes it from later requests', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Turn 1 fails outright.
    sageShouldFail = true;
    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // Retry re-sends the exact cached request (including media-1), and this
    // time it succeeds — that success is what should mark media-1 delivered.
    sageShouldFail = false;
    await act(async () => {
      fireEvent.click(screen.getByText('retry'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // Turn 3: a plain follow-up. media-1's ready state was delivered by the
    // successful retry, so it's excluded now — the #270 behavior, preserved.
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(3));
    });
    expect(sageRequestBodies[2].media_items).toBeNull();
  });

  it('marks a terminal item delivered on a first-try success, excluding it from the next request (still works)', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items).toBeNull();
  });
});

// Coverage for the stale-delivered-status fix: deliveredTerminalIdsRef used to
// track only WHETHER an id had been delivered while terminal, not the status
// it had at that moment. So once an item was delivered as 'failed', a later
// retry that genuinely flipped it to 'ready' in the DB was silently never
// resurfaced — getMediaItems() kept excluding it forever, even though its
// current status no longer matched what was actually delivered. Fixed by
// keying deliveredTerminalIdsRef on (id -> status-at-delivery) instead of just
// id, so a status change after delivery makes the item due again.
describe('resurfacing after a status change post-delivery (e.g. retry success)', () => {
  it('an item delivered as failed resurfaces once a retry flips it to ready', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Turn 1: media-1 fails, gets delivered to the guide as a failure.
    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to failed'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // A retry succeeds — the real processing pipeline (untouched by this fix)
    // flips the item's status to ready; simulated here via the same
    // addMediaItem path Realtime/catch-up use to apply a status update.
    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
    });

    // Turn 2: a plain follow-up. media-1's current status (ready) no longer
    // matches what was delivered (failed), so it must resurface fresh.
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);
  });

  it('is symmetric: an item delivered as ready also resurfaces if it later flips to failed', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to failed'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);
  });

  it('regression: an item delivered once stays excluded as long as its status never changes again', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('resolve A to ready'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // No status change between turns — media-1 stays excluded (the #270 fix).
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items).toBeNull();
  });
});

// Regression coverage for the cross-conversation leak: neither newChat() nor
// loadSession()/hydrateConversation() used to reset mediaItemsRef /
// deliveredTerminalIdsRef / mediaItems, so switching to a different
// conversation without a full page reload left a prior conversation's
// attached media items in the ref — getMediaItems() would then resend them on
// the new conversation's next turn, and resolveMediaContext() would inject
// that unrelated conversation's attachment content into the wrong system
// prompt. This is a privacy-relevant bug (personal photos/documents), not
// just wasted tokens like the resend-scoping fix above.
describe('media items reset on conversation switch', () => {
  it('newChat(): a fresh conversation does not inherit the outgoing conversation\'s attachment', async () => {
    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Conversation A: attach + send.
    await act(async () => {
      fireEvent.click(screen.getByText('attach pending A'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // Switch to a brand-new conversation.
    await act(async () => {
      fireEvent.click(screen.getByText('new chat'));
    });

    // First message in the new conversation, no attachment of its own.
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items).toBeNull();
  });

  it('loadSession(): switching to a different existing conversation does not inherit the prior one\'s attachment', async () => {
    // Session B pre-exists (e.g. an earlier conversation in the Recent
    // sidebar) with no messages of its own — enough for loadSession to find
    // it, without triggering the separate cross-device auto-recovery effect
    // (which only auto-hydrates when the returned session has messages).
    recentSessionsResponse = [
      {
        id: 'sess-B',
        messages: [],
        updated_at: '2000-01-01T00:00:00.000Z',
        visitor_name: null,
        title: 'Session B',
        starred: false,
      },
    ];

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    // Conversation A (sess-1, from the mock): attach + send.
    await act(async () => {
      fireEvent.click(screen.getByText('attach pending A'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });
    expect(sageRequestBodies[0].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);

    // Switch to the different, pre-existing session B.
    await act(async () => {
      fireEvent.click(screen.getByText('load session B'));
    });

    // A follow-up in session B, no attachment of its own — session B already
    // has an id, so this reuses it rather than creating a new session.
    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    expect(sageRequestBodies[1].media_items).toBeNull();
  });

  it('does NOT reset media items when hydrateConversation targets the SAME session (injectAssistantMessage-style call)', async () => {
    // Guards the other direction: hydrateConversation is also used to append
    // a message to the CURRENT session without a network round trip
    // (injectAssistantMessage passes the unchanged sessionId) — that must
    // NOT wipe the active conversation's own still-relevant media items.
    // loadSession('sess-1') while sess-1 is already the active session drives
    // the exact same hydrateConversation code path with an unchanged id.
    recentSessionsResponse = [
      { id: 'sess-1', messages: [], updated_at: '2000-01-01T00:00:00.000Z', visitor_name: null, title: 'A', starred: false },
    ];

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('attach pending A'));
      fireEvent.click(screen.getByText('send first'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(1));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('reload session A (same session)'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('send follow-up'));
      await waitFor(() => expect(sageRequestBodies.length).toBe(2));
    });
    // media-1 is still pending (never resolved) and this was a same-session
    // hydrate — it must still be resent, not wiped.
    expect(sageRequestBodies[1].media_items?.map((m) => m.mediaItemId)).toEqual(['media-1']);
  });
});
