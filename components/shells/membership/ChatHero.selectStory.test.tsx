import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

// Integration coverage for Phase 1d (real-story-view-1d-entry-point) — the
// real sidebar Stories-list row click, replacing the temporary
// ?storyView=<id> query param Phases 1a-1c used. Branches on whether the
// story has any memories: non-empty opens the real StoryView; empty starts
// a fresh chat scoped to the story via chatStore's real newChat() +
// setSessionContextToAttach() (session-context-service), NOT the discarded
// story-click-routing branch's one-time injectAssistantMessage approach.

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

const STORY_EMPTY = { id: 'story-empty', name: 'An Empty Story', isOwner: true };
const STORY_FULL = { id: 'story-full', name: 'A Full Story', isOwner: true };
const STORIES = [STORY_EMPTY, STORY_FULL];

const FULL_STORY_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-other',
  title: 'A memory in the full story',
  body: '',
  source_kind: 'conversation',
  created_at: '2026-08-01T00:00:00Z',
};

const CURRENT_SESSION = {
  id: 'sess-current',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-14T00:00:00.000Z',
  visitor_name: null,
  title: 'Currently open chat',
  starred: false,
  memory_count: 1,
};

const SAVED_MEMORY = {
  id: 'mem-current',
  session_id: 'sess-current',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-14T00:00:00.000Z',
  updated_at: '2026-08-14T00:00:00.000Z',
};

let capturedSessionsPostBody: string | null | undefined;
let memoriesRouteShouldFail = false;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [CURRENT_SESSION] });
  if (url === '/api/sessions' && method === 'POST') {
    capturedSessionsPostBody = init?.body as string | undefined;
    return jsonResponse({ id: 'sess-new' });
  }
  if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: STORIES });
  if (url === '/api/stories/story-empty/memories' && method === 'GET') {
    if (memoriesRouteShouldFail) return jsonResponse({ error: 'db down' }, 500);
    return jsonResponse({ memories: [] });
  }
  if (url === '/api/stories/story-full/memories' && method === 'GET') {
    return jsonResponse({ memories: [FULL_STORY_MEMORY] });
  }
  if (url === '/api/sage' && method === 'POST') return streamResponse('ok');
  if (url === '/api/sessions/sess-current/memories' && method === 'GET') return jsonResponse({ memories: [SAVED_MEMORY] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(async () => {
  // Resets IndexedDB persistence state — without this, a prior test file's
  // leftover 'heirloom' persisted session can interfere with newChat()'s
  // hydration under full-suite parallel execution (observed as an
  // intermittent, otherwise-unexplained timeout on the send-a-message
  // test below). Same convention optimistic-echo.test.tsx already uses for
  // the same reason.
  await __resetPersistenceForTests('heirloom');
  fetchMock.mockClear();
  capturedSessionsPostBody = undefined;
  memoriesRouteShouldFail = false;
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

async function renderReady() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: STORY_FULL.name })).toBeInTheDocument());
}

describe('Story row click — real entry point (Phase 1d)', () => {
  it('a non-empty story opens the real StoryView, not a new chat', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: STORY_FULL.name }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stories/story-full/memories'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());
    expect(await screen.findByText('A memory in the full story')).toBeInTheDocument();
  });

  it('an empty story starts a fresh chat scoped to it — no StoryView opens', async () => {
    await renderReady();
    await screen.findByText(/It sounds like a beautiful memory/);

    fireEvent.click(screen.getByRole('button', { name: STORY_EMPTY.name }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stories/story-empty/memories'));
    // Waits for newChat()'s own observable effect (the transcript actually
    // clearing), not just "the check fetch was called" — a bare negative
    // assertion on something never rendered to begin with would pass
    // trivially even if the handler did nothing at all.
    await waitFor(() => expect(screen.queryByText(/It sounds like a beautiful memory/)).not.toBeInTheDocument());
    await screen.findByText(/What.s a story worth keeping/);
    expect(screen.queryByRole('button', { name: 'Close story' })).not.toBeInTheDocument();
  });

  it('the fresh chat from an empty story attaches real session context on its first send — contextType/contextRefId/contextFrequency, not a one-time injected message', async () => {
    await renderReady();
    // The currently-loaded chat's own transcript is on screen before the
    // click — confirms there's a real "before" state for newChat() to
    // actually clear, not a trivially-already-empty one.
    await screen.findByText(/It sounds like a beautiful memory/);

    fireEvent.click(screen.getByRole('button', { name: STORY_EMPTY.name }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stories/story-empty/memories'));

    // Wait for newChat()'s own observable effect — the transcript clearing
    // back to the empty state — not just "the emptiness-check fetch was
    // called". The check fetch being called proves nothing about whether
    // its promise has RESOLVED and the subsequent newChat()/
    // setSessionContextToAttach have actually run yet; racing ahead to
    // Send before they have would send this message into the still-active
    // sess-current instead of triggering a new session at all, which is
    // exactly the intermittent "POST /api/sessions never fires" failure
    // this wait closes off.
    await waitFor(() => expect(screen.queryByText(/It sounds like a beautiful memory/)).not.toBeInTheDocument());
    await screen.findByText(/What.s a story worth keeping/);

    const textarea = await screen.findByPlaceholderText('Share a memory, or ask your guide anything');
    fireEvent.change(textarea, { target: { value: 'Hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(capturedSessionsPostBody).toBeDefined());
    expect(JSON.parse(capturedSessionsPostBody as string)).toEqual({
      contextType: 'story',
      contextRefId: 'story-empty',
      contextFrequency: 'every_turn',
    });
  });

  it('falls back to opening the real StoryView when the memory check itself fails — never silently starts an unrelated chat', async () => {
    memoriesRouteShouldFail = true;
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: STORY_EMPTY.name }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());
    expect(capturedSessionsPostBody).toBeUndefined();
  });
});

describe('Story row click — mobile (390px)', () => {
  beforeEach(() => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 390,
    });
  });

  afterEach(() => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 1024,
    });
  });

  it('selecting a non-empty story closes the sidebar overlay and opens the real StoryView', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: STORY_FULL.name });

    fireEvent.click(screen.getByRole('button', { name: STORY_FULL.name }));

    // StoryView opens as a focus-trapped full-screen dialog — same pattern
    // as Media/Share, both of which close the drawer first so it isn't left
    // mounted uselessly underneath. The overlay's own "New Chat" button is
    // gone once it's dismissed.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'New Chat' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());
  });

  it('selecting an empty story does not close the sidebar overlay — it is a plain content swap, not a full-screen dialog', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: STORY_EMPTY.name });

    fireEvent.click(screen.getByRole('button', { name: STORY_EMPTY.name }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stories/story-empty/memories'));
    // Same reasoning as a session row: no StoryView opens, so nothing
    // justifies closing the sidebar as a side effect of the tap.
    expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close story' })).not.toBeInTheDocument();
  });
});
