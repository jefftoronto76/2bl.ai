import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import { __resetPersistenceForTests } from '@/services/chat/ui/v1/persistence';

// Deck panel width bug (2026-09) — on desktop, StoryView was being sized
// through the SAME clamped ~400px `mediaPanelWidth` slot as Media/admin/
// session-memories, next to a still-visible chat column with a 260px floor.
// Per the approved design, Deck should REPLACE the chat column as the
// drawer's main content (full width, sidebar collapsed to its rail), not
// sit beside it as a narrow supplementary panel. This covers the desktop
// takeover: chat column collapses to zero width and stops rendering its
// content, and the third-pane wrapper claims the rest via flexGrow instead
// of a fixed flexBasis — scoped to storyViewStory only, leaving Media/
// admin/session-memories' existing clamped-panel behavior untouched.

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

const STORY_FULL = { id: 'story-full', name: 'A Full Story', isOwner: true };

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

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [CURRENT_SESSION] });
  if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: [STORY_FULL] });
  if (url === '/api/stories/story-full/memories' && method === 'GET') {
    return jsonResponse({ memories: [FULL_STORY_MEMORY] });
  }
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(async () => {
  await __resetPersistenceForTests('heirloom');
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

async function openStoryView() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: STORY_FULL.name })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: STORY_FULL.name }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());
}

describe('Deck panel width (desktop) — StoryView takes over from the chat column', () => {
  it('collapses the chat column to zero width and hides its content — but keeps it mounted, not unmounted', async () => {
    await openStoryView();

    const chatColumn = screen.getByTestId('chat-column-push-wrapper');
    expect(chatColumn.className).toContain('w-0');
    expect(chatColumn.className).toContain('flex-[0]');
    expect(chatColumn.className).not.toContain('min-w-[260px]');
    // Hidden (display:none via the `hidden` attribute — out of the tab
    // order/accessibility tree, same as a real unmount), but still IN the
    // DOM: a real unmount would reset ChatInput's own local draft/attachment
    // state (see the draft-preservation test below) every time Deck opens.
    const textarea = screen.getByPlaceholderText('Share a memory, or ask your guide anything');
    expect(textarea).toBeInTheDocument();
    expect(textarea).not.toBeVisible();
  });

  it('gives the third pane flexGrow:1 instead of the fixed ~400px media/admin/session-memories width', async () => {
    await openStoryView();

    const panel = screen.getByTestId('third-pane-panel');
    expect(panel.style.flexGrow).toBe('1');
    expect(panel.style.flexBasis).toBe('0px');
  });

  it('preserves an unsent draft across opening and closing StoryView', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: STORY_FULL.name })).toBeInTheDocument());
    // Waits for the session to finish hydrating first — ChatInput resets its
    // own draft whenever state.sessionId changes (a real, separate, existing
    // behavior: see its own doc comment), which otherwise fires async right
    // after mount as the initial session loads and would wipe a draft typed
    // too early, unrelated to anything StoryView does.
    await screen.findByText(/It sounds like a beautiful memory/);
    const textarea = screen.getByPlaceholderText('Share a memory, or ask your guide anything');
    fireEvent.change(textarea, { target: { value: 'A draft I have not sent yet' } });

    fireEvent.click(screen.getByRole('button', { name: STORY_FULL.name }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close story' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Share a memory, or ask your guide anything')).toBeVisible());
    expect(screen.getByPlaceholderText('Share a memory, or ask your guide anything')).toHaveValue('A draft I have not sent yet');
  });

  it('closing the story restores the chat column and its content', async () => {
    await openStoryView();

    fireEvent.click(screen.getByRole('button', { name: 'Close story' }));

    await waitFor(() => expect(screen.getByPlaceholderText('Share a memory, or ask your guide anything')).toBeVisible());
    const chatColumn = screen.getByTestId('chat-column-push-wrapper');
    expect(chatColumn.className).toContain('min-w-[260px]');
    expect(chatColumn.className).not.toContain('w-0');
  });
});

describe('Deck panel width (mobile, 390px) — unaffected, still its own full-screen overlay', () => {
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

  it('does not touch the desktop-only chat-column-push-wrapper takeover classes', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: STORY_FULL.name });
    fireEvent.click(screen.getByRole('button', { name: STORY_FULL.name }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument());
    // Desktop-only wrapper never gets the collapse classes on mobile — it
    // keeps its own always-flex-1 mobile sizing regardless of storyViewStory.
    expect(screen.getByTestId('chat-column-push-wrapper').className).toContain('min-w-0');
  });
});
