import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Coverage for the mobile chat header redesign (2026-08-16). The whole point
// of this change is a boundary — mobile narrows, desktop does not move at all
// — so every behaviour below is asserted TWICE, once per breakpoint, against
// the same fixtures. A change that trims desktop by accident should fail here
// before it reaches a preview.
//
// Mobile, left to right: hamburger, brand ICON (no "Legacy" wordmark),
// Media *if this session has media*, Memories *if this session has memories*,
// profile, Close. Share Heirloom and Fullscreen are gone (Share keeps
// SidebarV2's own nav row as its entry point; Close stays by explicit
// decision).
//
// The two counts are deliberately NOT new fetches — see ChatHero.tsx's own
// comment at hasSessionMedia/hasSessionMemories. That's what the fixtures
// here exercise: `/api/media?chat_id=&status=ready,failed` is chatStore's
// session-media catch-up, `/api/sessions/:id/memories` is useMemories' list,
// and the icons follow those two responses with no third request involved.

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

const SESSION_ID = 'sess-mobile-header';

const SESSION = {
  id: SESSION_ID,
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-16T00:00:00.000Z',
  visitor_name: null,
  title: 'Mobile header test session',
  starred: false,
  memory_count: 0,
};

const MEMORY = {
  id: 'mem-1',
  session_id: SESSION_ID,
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-16T00:00:00.000Z',
  updated_at: '2026-08-16T00:00:00.000Z',
};

const MEDIA_ITEM = {
  id: 'media-1',
  chat_id: SESSION_ID,
  type: 'image',
  status: 'ready',
  original_filename: 'lake-house.jpg',
};

// Per-test fixture switches — each test declares what this session holds
// before rendering, since that is exactly what the two icons key off.
let sessionHasMedia = false;
let sessionHasMemories = false;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') {
    return jsonResponse({ memories: sessionHasMemories ? [MEMORY] : [] });
  }
  // chatStore's catch-up/poll (status-filtered) is the list that backs the
  // header icon; MediaGallery's own unfiltered fetch stays empty either way,
  // so nothing here depends on the panel's contents.
  if (url.startsWith('/api/media') && url.includes('status=ready')) {
    return jsonResponse({ items: sessionHasMedia ? [MEDIA_ITEM] : [] });
  }
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  sessionHasMedia = false;
  sessionHasMemories = false;
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

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — the same technique ChatHero.mobileSidebarScrim.test.tsx
// and ChatHero.mediaPanel.test.tsx already use to reach the mobile branch.
function setViewport(width: number) {
  (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
    width,
  });
}

// Both breakpoints render with a real fullscreen handler — without one
// ChatHeader never renders the toggle at all, so its mobile removal would be
// untestable (and its desktop survival unproven).
async function renderHero() {
  render(
    <ChatProvider>
      <ChatHero isFullScreen={false} onToggleFullScreen={vi.fn()} />
    </ChatProvider>,
  );
  // The Close-X is unconditional in every branch — a stable "header is
  // painted" signal that no assertion below depends on.
  await screen.findByRole('button', { name: 'Close' });
}

/**
 * Scopes every icon assertion to the chat header itself. Share Heirloom in
 * particular has a SECOND entry point — SidebarV2's own nav row, which is
 * docked and present on desktop — so an unscoped query matches two buttons
 * there, and would also quietly pass on mobile for the wrong reason if the
 * overlay were open.
 */
function header() {
  return within(screen.getByTestId('chat-header'));
}

/**
 * The store's media catch-up and useMemories' list both land after first
 * paint, so an icon's ABSENCE can't be read off the first frame — it would
 * pass trivially. Every negative assertion waits for the corresponding
 * fetch to have been made and settled first.
 */
async function settleSessionData() {
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/media?chat_id=${SESSION_ID}`)),
  );
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/sessions/${SESSION_ID}/memories`)),
  );
}

describe('Mobile chat header (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('shows the brand icon without the "Legacy" wordmark', async () => {
    await renderHero();

    // The mark itself stays — only its text half is breakpoint-gated, via the
    // class rather than conditional markup (see ChatHeader.tsx). Tailwind
    // classes aren't real CSS under happy-dom, so the class IS the assertion.
    const wordmark = header().getByTestId('chat-header-wordmark');
    expect(wordmark).toHaveTextContent('Legacy');
    expect(wordmark.className).toContain('hidden');
    expect(wordmark.className).toContain('md:inline');
  });

  it('drops Share Heirloom and the fullscreen toggle, and keeps Close', async () => {
    await renderHero();

    expect(header().queryByRole('button', { name: 'Share Heirloom' })).toBeNull();
    expect(header().queryByRole('button', { name: 'Expand to full screen' })).toBeNull();
    expect(header().queryByRole('button', { name: 'Exit full screen' })).toBeNull();

    // Kept by explicit decision — Share and Fullscreen went, Close did not.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('hides Media and Memories for a session with neither', async () => {
    await renderHero();
    await settleSessionData();

    expect(header().queryByRole('button', { name: 'Media from this chat' })).toBeNull();
    expect(header().queryByRole('button', { name: 'Memories from this chat' })).toBeNull();
  });

  it('shows Media — and only Media — for a session with media but no memories', async () => {
    sessionHasMedia = true;
    await renderHero();

    expect(await screen.findByRole('button', { name: 'Media from this chat' })).toBeInTheDocument();
    await settleSessionData();
    expect(header().queryByRole('button', { name: 'Memories from this chat' })).toBeNull();
  });

  it('shows Memories — and only Memories — for a session with memories but no media', async () => {
    sessionHasMemories = true;
    await renderHero();

    expect(await screen.findByRole('button', { name: 'Memories from this chat' })).toBeInTheDocument();
    await settleSessionData();
    expect(header().queryByRole('button', { name: 'Media from this chat' })).toBeNull();
  });

  it('shows both when the session has both', async () => {
    sessionHasMedia = true;
    sessionHasMemories = true;
    await renderHero();

    expect(await screen.findByRole('button', { name: 'Media from this chat' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Memories from this chat' })).toBeInTheDocument();
  });

  it('drops both icons again on New Chat, where the fresh session holds nothing', async () => {
    // The counts have to track the ACTIVE session, not "has ever loaded
    // something". chatStore clears mediaItems on a session switch and
    // ChatHero's currentSessionMemories filters on state.sessionId, so a new
    // chat starts empty-handed — this is the regression guard on that, and on
    // the wiring that reads it.
    sessionHasMedia = true;
    sessionHasMemories = true;
    await renderHero();
    await screen.findByRole('button', { name: 'Media from this chat' });
    await screen.findByRole('button', { name: 'Memories from this chat' });

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New Chat' }));

    await waitFor(() => {
      expect(header().queryByRole('button', { name: 'Media from this chat' })).toBeNull();
      expect(header().queryByRole('button', { name: 'Memories from this chat' })).toBeNull();
    });
  });
});

describe('Desktop chat header is unaffected (1024px)', () => {
  it('keeps the "Legacy" wordmark visible', async () => {
    await renderHero();

    const wordmark = header().getByTestId('chat-header-wordmark');
    expect(wordmark).toHaveTextContent('Legacy');
    // `md:inline` is what restores it above the mobile breakpoint; the bare
    // `hidden` alone would be a desktop regression.
    expect(wordmark.className).toContain('md:inline');
  });

  it('keeps Share Heirloom and the fullscreen toggle', async () => {
    await renderHero();

    expect(header().getByRole('button', { name: 'Share Heirloom' })).toBeInTheDocument();
    expect(header().getByRole('button', { name: 'Expand to full screen' })).toBeInTheDocument();
  });

  it('keeps Media and Memories even for a session with neither — the count gate is mobile-only', async () => {
    await renderHero();
    await settleSessionData();

    expect(header().getByRole('button', { name: 'Media from this chat' })).toBeInTheDocument();
    expect(header().getByRole('button', { name: 'Memories from this chat' })).toBeInTheDocument();
  });

  it('has no hamburger — the sidebar is docked', async () => {
    await renderHero();

    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });
});
