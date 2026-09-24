import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

// Selecting a session — or New Chat — closes an open Story view (2026-09).
// Session rows call the chat store's loadSession() directly, entirely
// separate from ChatHero's own storyViewId, so before this the new chat
// loaded underneath while the Deck kept rendering on top. SidebarV2 now
// fires onSessionNavigate on those clicks and ChatHero passes closeStoryPane.
// On desktop the open Deck force-collapses the Nav to its rail (no session
// rows rendered there), so the session-row test expands it first — exactly
// what a member would do.

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

const OTHER_SESSION = {
  id: 'sess-older',
  messages: [
    { id: 'o1', role: 'user', content: 'Grandpa built boats.', timestamp: 1 },
    { id: 'o2', role: 'assistant', content: 'Tell me about the first boat he built.', timestamp: 2 },
  ],
  updated_at: '2026-08-10T00:00:00.000Z',
  visitor_name: null,
  title: 'An older chat',
  starred: false,
  memory_count: 0,
};

let capturedSessionsPostBody: string | null | undefined;
let memoriesRouteShouldFail = false;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [CURRENT_SESSION, OTHER_SESSION] });
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

async function openFullStory() {
  fireEvent.click(screen.getByRole('button', { name: STORY_FULL.name }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());
  await screen.findByText('A memory in the full story');
}

describe('Selecting a session closes an open Story view', () => {
  it('clicking a different session row closes the Story and shows that session\'s transcript', async () => {
    await renderReady();
    await openFullStory();
    // Deck replaces the chat column on desktop.
    expect(screen.queryByText(/Tell me about the first boat/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    fireEvent.click(await screen.findByRole('button', { name: OTHER_SESSION.title }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close story' })).not.toBeInTheDocument());
    expect(screen.queryByText('A memory in the full story')).not.toBeInTheDocument();
    // The chat column is no longer the hidden (Deck-open) branch.
    expect(document.querySelector('[data-testid="chat-column-push-wrapper"] > [hidden]')).toBeNull();
    expect((await screen.findAllByText(/Tell me about the first boat he built/)).some((el) => !el.closest('[hidden]'))).toBe(true);
  });

  it('re-clicking the already-active session also closes the Story (a sessionId effect would miss this)', async () => {
    await renderReady();
    await screen.findByText(/It sounds like a beautiful memory/);
    await openFullStory();

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    fireEvent.click(await screen.findByRole('button', { name: CURRENT_SESSION.title }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close story' })).not.toBeInTheDocument());
    expect((await screen.findAllByText(/It sounds like a beautiful memory/)).some((el) => !el.closest('[hidden]'))).toBe(true);
  });

  it('New Chat (available on the rail) closes the Story and shows the empty chat', async () => {
    await renderReady();
    await openFullStory();

    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close story' })).not.toBeInTheDocument());
    expect(await screen.findByText(/What.s a story worth keeping/)).toBeVisible();
  });
});
