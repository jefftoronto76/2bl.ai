// Coverage for the SAVE_MEMORY marker's end-to-end wiring: the marker fires
// the exact same memories.create() the manual bookmark calls, the marker
// text never reaches visible output, and it never double-saves against an
// existing memory (whether that memory came from an earlier marker fire or a
// manual bookmark). Mirrors chatStore.loadSession.test.tsx / bookmark-render.
// test.tsx's mocking pattern (this shell's own established convention).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { ChatProvider } from '../chatStore';
import { ChatHero } from '../ChatHero';
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

function sessionWith(assistantContent: string) {
  return {
    id: 'sess-save-memory',
    messages: [
      { id: 'u1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
      { id: 'm2', role: 'assistant', content: assistantContent, timestamp: 2 },
    ],
    updated_at: '2026-07-31T00:00:00.000Z',
    visitor_name: null,
    title: 'Save-memory session',
    starred: false,
    memory_count: 0,
  };
}

const DRAFT_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-save-memory',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the water.',
  status: 'draft',
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
};

describe('SAVE_MEMORY marker', () => {
  let session: ReturnType<typeof sessionWith>;
  let existingMemories: typeof DRAFT_MEMORY[];
  let postMemoryCalls: unknown[];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [session] });
    if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
    if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
    if (url.endsWith('/memories') && method === 'GET') return jsonResponse({ memories: existingMemories });
    if (url.endsWith('/memories') && method === 'POST') {
      postMemoryCalls.push(JSON.parse(String(init?.body ?? '{}')));
      return jsonResponse({ memory: DRAFT_MEMORY });
    }
    return jsonResponse({ ok: true });
  });

  beforeEach(() => {
    existingMemories = [];
    postMemoryCalls = [];
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

  it('fires memories.create() for the message the marker appeared in — the same call the bookmark makes, not a new save path', async () => {
    session = sessionWith('That sounds like a wonderful memory. [SAVE_MEMORY]');
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(postMemoryCalls.length).toBeGreaterThan(0));

    expect(postMemoryCalls[0]).toEqual({
      anchor_message_id: 'm2',
      source_kind: 'conversation',
    });
  });

  it('never leaks the marker text into visible output', async () => {
    session = sessionWith('That sounds like a wonderful memory. [SAVE_MEMORY]');
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/That sounds like a wonderful memory\./).length).toBeGreaterThan(0));

    expect(screen.queryByText(/SAVE_MEMORY/)).toBeNull();
    expect(document.body.textContent).not.toContain('[SAVE_MEMORY]');
  });

  it('does not fire when the message has no marker', async () => {
    session = sessionWith('Just an ordinary reply, nothing to save here.');
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/Just an ordinary reply/).length).toBeGreaterThan(0));

    expect(postMemoryCalls.length).toBe(0);
  });

  it('does not double-save when a memory already exists for that anchor (e.g. an earlier marker fire, or a manual bookmark)', async () => {
    session = sessionWith('That sounds like a wonderful memory. [SAVE_MEMORY]');
    existingMemories = [DRAFT_MEMORY]; // already anchored to m2 before the effect ever runs

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/That sounds like a wonderful memory\./).length).toBeGreaterThan(0));
    // Give the marker-detection effect a tick to (not) fire.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(postMemoryCalls.length).toBe(0);
  });

  it('still fires when a *different* anchor has an open draft — hasOpenDraft is scoped per-anchor, not session-wide (cross-anchor bleed fix)', async () => {
    session = sessionWith('That sounds like a wonderful memory. [SAVE_MEMORY]');
    // A draft open on a different anchor than m2. Pre-fix, useMemories.ts's
    // hasOpenDraft was a single whole-session boolean, so this stale draft on
    // 'earlier-msg' would have silenced every bookmark/marker in the
    // transcript, including m2's. Post-fix, hasOpenDraft(anchorId) is scoped
    // to that anchor alone — m2 has no open draft of its own, so the marker
    // must still fire.
    existingMemories = [{ ...DRAFT_MEMORY, id: 'mem-other', anchor_message_id: 'earlier-msg' }];

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/That sounds like a wonderful memory\./).length).toBeGreaterThan(0));
    await waitFor(() => expect(postMemoryCalls.length).toBeGreaterThan(0));

    expect(postMemoryCalls[0]).toEqual({
      anchor_message_id: 'm2',
      source_kind: 'conversation',
    });
  });

  it('does not fire while its own anchor already has an open draft — the same-anchor suppression that remains after the cross-anchor bleed fix', async () => {
    session = sessionWith('That sounds like a wonderful memory. [SAVE_MEMORY]');
    // The open draft is on m2 itself — hasOpenDraft('m2') must still be true.
    existingMemories = [{ ...DRAFT_MEMORY, id: 'mem-existing', anchor_message_id: 'm2', status: 'draft' }];

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/That sounds like a wonderful memory\./).length).toBeGreaterThan(0));
    // Give the marker-detection effect a tick to (not) fire.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(postMemoryCalls.length).toBe(0);
  });

  it('clicking the bookmark on a message that already has a memory does not fire a second create() — the marker and the manual click share one guard', async () => {
    session = sessionWith('Just an ordinary reply, nothing to save here.');
    existingMemories = [DRAFT_MEMORY];

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/Just an ordinary reply/).length).toBeGreaterThan(0));

    const bookmarks = screen.getAllByRole('button', { name: 'Memory kept from this message' });
    expect(bookmarks.length).toBeGreaterThan(0);
    bookmarks.forEach((b) => fireEvent.click(b));

    expect(postMemoryCalls.length).toBe(0);
  });
});
