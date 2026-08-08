// Integration coverage for the memory canvas panel wired into ChatHero:
// the header toggle, the sidebar force-collapsing while it's open, and the
// auto-open-in-card-view behavior the instant "Keep this" is clicked.
// Mirrors components/shells/membership/memory/bookmark-render.test.tsx's
// mounting/mocking convention (this shell's established pattern).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
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

// Only the mobile-branch test below sets this — every other test gets the
// real @mantine/hooks useMediaQuery (desktop-width default in jsdom).
let mobileOverride: boolean | null = null;
vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual<typeof import('@mantine/hooks')>('@mantine/hooks');
  const realUseMediaQuery = actual.useMediaQuery;
  return {
    ...actual,
    useMediaQuery: (...args: Parameters<typeof realUseMediaQuery>) =>
      mobileOverride !== null && args[0] === '(max-width: 768px)' ? mobileOverride : realUseMediaQuery(...args),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SESSION = {
  id: 'sess-canvas',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-08T00:00:00.000Z',
  visitor_name: null,
  title: 'Canvas session',
  starred: false,
  memory_count: 0,
};

const DRAFT_MEMORY = {
  id: 'mem-new',
  session_id: 'sess-canvas',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House Memory',
  body: 'It sounds like a beautiful memory.',
  status: 'draft',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

describe('ChatHero — memory canvas integration', () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
    if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
    if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
    if (url.endsWith('/memories') && method === 'GET') return jsonResponse({ memories: [] });
    if (url.endsWith('/memories') && method === 'POST') return jsonResponse({ memory: DRAFT_MEMORY });
    if (url.includes('/memories/mem-new') && method === 'PATCH') return jsonResponse({ memory: { ...DRAFT_MEMORY, status: 'published' } });
    return jsonResponse({ ok: true });
  });

  beforeEach(() => {
    fetchMock.mockClear();
    __clearSingletonRegistry();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mobileOverride = null;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mobileOverride = null;
  });

  it('header toggle opens the panel (list view) and force-collapses the sidebar; toggling again closes it', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('It sounds like a beautiful memory.').length).toBeGreaterThan(0));

    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
    expect(screen.queryByText('Memories from this chat')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open memories' }));

    await waitFor(() => expect(screen.getByText('Memories from this chat')).toBeTruthy());
    // Sidebar's own toggle now reads "Expand" — forced into its icon rail
    // while the canvas panel is open.
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close memories' }));
    await waitFor(() => expect(screen.queryByText('Memories from this chat')).toBeNull());
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
  });

  it('clicking "Keep this" auto-opens the canvas panel in card view for that exact memory', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('It sounds like a beautiful memory.').length).toBeGreaterThan(0));

    const bookmarkButtons = screen.getAllByRole('button', { name: 'Keep this as a memory' });
    fireEvent.click(bookmarkButtons[0]);

    // Draft card lands in the transcript with the real "Keep this" spine button.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Keep this' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep this' })[0]);

    // Panel auto-opens in card view for this memory, seeded (not waiting on
    // its own separate fetch) — see ChatHero's handleMemoryKept.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House Memory' })).toBeTruthy());
  });

  it('on mobile, the panel renders as a full-screen overlay with a compact (icon-only) footer, not the desktop 40/60 split', async () => {
    mobileOverride = true;

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('It sounds like a beautiful memory.').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Open memories' }));
    await waitFor(() => expect(screen.getByText('Memories from this chat')).toBeTruthy());

    const bookmarkButtons = screen.getAllByRole('button', { name: 'Keep this as a memory' });
    fireEvent.click(bookmarkButtons[0]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Keep this' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep this' })[0]);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The Lake House Memory' })).toBeTruthy());

    // Compact footer: "Remove" has no visible text label, just the icon +
    // accessible name (see MemoryCardView's compact branch).
    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    expect(removeBtn.textContent).toBe('');

    // Desktop-only affordances are absent on mobile: no drag divider, and
    // the sidebar isn't docked at all (it's the overlay drawer instead).
    expect(screen.queryByRole('separator', { name: 'Resize memory canvas' })).toBeNull();
  });
});
