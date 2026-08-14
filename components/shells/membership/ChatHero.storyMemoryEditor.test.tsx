import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for Phase 1b (real-story-view-1b-row-tap-editor) —
// the one thing StoryView.test.tsx and StoryMemoryEditor.test.tsx can't
// cover in isolation: that tapping a row swaps the story pane's own slot
// from the list to the editor (not opening a second, separate panel), and
// that closing the editor returns to the list rather than closing the
// whole pane. The cross-session-safety of StoryMemoryEditor's OWN data
// fetching is already covered in StoryMemoryEditor.test.tsx; this file
// only exercises the ChatHero-level wiring around it — deliberately using
// a memory from a DIFFERENT session than the one open in ChatHero, so a
// regression that silently fell back to ChatHero's own chat-scoped
// `memories` hook would show up here as a blank/not-found editor.

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

const CURRENT_SESSION = {
  id: 'sess-current',
  messages: [{ id: 'm1', role: 'user', content: 'Hello', timestamp: 1 }],
  updated_at: '2026-08-14T00:00:00.000Z',
  visitor_name: null,
  title: 'Currently open chat',
  starred: false,
  memory_count: 0,
};

const STORIES = [{ id: 'story-1', name: 'A Life in Full', isOwner: true }];

// Deliberately from a DIFFERENT session than CURRENT_SESSION — the whole
// point of this test.
const CROSS_SESSION_MEMORY = {
  id: 'mem-cross',
  session_id: 'sess-other',
  anchor_message_id: 'm-other',
  source_kind: 'conversation',
  title: 'From another conversation',
  body: 'This memory was kept in a different chat entirely.',
  status: 'published',
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [CURRENT_SESSION] });
  if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: STORIES });
  if (url === '/api/stories/story-1/memories' && method === 'GET') {
    return jsonResponse({ memories: [{ id: CROSS_SESSION_MEMORY.id, session_id: CROSS_SESSION_MEMORY.session_id, title: CROSS_SESSION_MEMORY.title, body: CROSS_SESSION_MEMORY.body, source_kind: CROSS_SESSION_MEMORY.source_kind, created_at: CROSS_SESSION_MEMORY.created_at }] });
  }
  if (url === '/api/sessions/sess-current/memories' && method === 'GET') return jsonResponse({ memories: [] });
  if (url === '/api/sessions/sess-other/memories' && method === 'GET') return jsonResponse({ memories: [CROSS_SESSION_MEMORY] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(() => {
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

/** Opens the story pane via the real entry point (Phase 1d,
 *  real-story-view-1d-entry-point) — a sidebar row click, replacing the
 *  temporary ?storyView=<id> query param this file used before that
 *  landed. story-1 has one memory (CROSS_SESSION_MEMORY), so this always
 *  takes the "open StoryView" branch, never the empty-story new-chat one. */
async function openStoryPane() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'A Life in Full' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'A Life in Full' }));
  await waitFor(() => expect(screen.getByText('From another conversation')).toBeInTheDocument());
}

describe('Story view row-tap-to-editor — through the real ChatHero stack', () => {
  it('tapping a row swaps the story pane to the editor, scoped to the memory\'s OWN session, not the currently open chat', async () => {
    await openStoryPane();

    fireEvent.click(screen.getByRole('button', { name: /From another conversation/ }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('From another conversation'));
    // Fetched via the memory's own session (sess-other), never the chat
    // that happens to be open (sess-current).
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/sess-other/memories');
  });

  it('closing the editor returns to the story list, not closing the whole pane', async () => {
    await openStoryPane();
    fireEvent.click(screen.getByRole('button', { name: /From another conversation/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));

    await waitFor(() => expect(screen.getByText('A Life in Full')).toBeInTheDocument());
    expect(screen.getByText('From another conversation')).toBeInTheDocument();
  });

  it('closing the story pane itself (not the editor) closes everything', async () => {
    await openStoryPane();

    // "A Life in Full" also appears in the sidebar's own Stories list
    // regardless of whether the pane is open — assert on the pane's own
    // close button instead, which only exists while StoryView is mounted.
    expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close story' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close story' })).not.toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: 'Memory title' })).not.toBeInTheDocument();
  });
});
