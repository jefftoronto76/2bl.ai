import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for the Media surfaces (Stage 1,
// Design Handovers/media_stages_08_2026): two distinct entry points now
// exist, previously conflated into one (`ChatHero.mediaPanel.test.tsx`'s
// original pre-Stage-1 version tested only the sidebar → in-chat-panel path).
//
// - Sidebar "Media" row (SidebarV2) opens the standalone MediaPage — a
//   full-screen overlay independent of any chat session, showing every
//   account file. Not mutually exclusive with the memory panel (it visually
//   covers everything regardless).
// - ChatHeader's "Media from this chat" icon (new in this stage — see the
//   investigation notes in the Stage 1 PR: no such icon existed before this
//   change) opens the in-chat MediaGallery panel, scoped to the active
//   session — same third-pane/bottom-sheet slot the memory panel uses,
//   mutually exclusive with it, exactly as the pre-Stage-1 sidebar-triggered
//   panel used to behave.

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

const SESSION = {
  id: 'sess-media',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-09T00:00:00.000Z',
  visitor_name: null,
  title: 'Media test session',
  starred: false,
  memory_count: 1,
};

const SAVED_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-media',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-09T00:00:00.000Z',
  updated_at: '2026-08-09T00:00:00.000Z',
};

// chatStore's session-media catch-up (`status=ready,failed`) is what backs
// ChatHeader's now count-gated mobile Media icon (mobile chat header
// redesign, 2026-08-16), so this session needs one item for the mobile tests
// below to reach the icon at all. Kept OFF MediaGallery's own unfiltered
// `/api/media?chat_id=&limit=` list so the panel's rendering — and every
// desktop assertion here — stays exactly as it was.
const READY_MEDIA_ITEM = {
  id: 'media-1',
  chat_id: 'sess-media',
  type: 'image',
  status: 'ready',
  original_filename: 'lake-house.jpg',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [SAVED_MEMORY] });
  if (url.startsWith('/api/media') && url.includes('status=ready')) return jsonResponse({ items: [READY_MEDIA_ITEM] });
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

async function renderReady() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
}

describe('Standalone Media page — desktop', () => {
  // MediaPage is always mounted (so its slide-in transform can animate) —
  // `inert` (not DOM presence) is what tracks open/closed, same contract
  // ChatDrawerV2 uses for its own closed state.
  it('opens via the sidebar Media button and closes via its own close button', async () => {
    await renderReady();
    const dialog = screen.getByRole('dialog', { name: 'Media' });

    expect(dialog).toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('inert'));

    fireEvent.click(screen.getByRole('button', { name: 'Close media page' }));
    await waitFor(() => expect(dialog).toHaveAttribute('inert'));
  });

  it('does not open the in-chat Media panel or force-collapse the sidebar', async () => {
    await renderReady();
    const aside = document.querySelector('aside');
    const dialog = screen.getByRole('dialog', { name: 'Media' });

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('inert'));

    expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull();
    expect(aside?.className).toContain('w-64');
  });
});

describe('In-chat Media panel — desktop', () => {
  it('opens via the chat-header icon and closes via its own close button', async () => {
    await renderReady();

    expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());
  });

  it('opening the panel closes an open memory panel, and opening a memory closes the panel', async () => {
    await renderReady();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: 'Memory title' })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
    expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull();
  });

  it('force-collapses the sidebar rail while open, and restores it on close', async () => {
    await renderReady();
    const aside = document.querySelector('aside');

    expect(aside?.className).toContain('w-64');

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    expect(aside?.className).toContain('w-12');

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(aside?.className).toContain('w-64'));
  });

  it('scopes the fetch to the active session via chat_id', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/media?chat_id=sess-media')),
    );
  });
});

// Regression coverage for the close-button-clipped-offscreen bug: at desktop
// widths where sidebar(48) + chat floor(260) + a rigid 400px media panel
// would exceed the row's available width, the panel must shrink to fit
// instead of forcing an overflow that gets clipped by the row's
// overflow-hidden (taking the close button with it). Mirrors the same
// clientWidth-stubbing technique ChatHero.memoryPanel.test.tsx uses for the
// memory panel's own clamp coverage, for the same reason: happy-dom has no
// real CSS layout engine, so panelRowRef.current.clientWidth is always 0
// unless stubbed.
function stubRowWidth(px: number) {
  const row = screen.getByTestId('memory-panel-row');
  Object.defineProperty(row, 'clientWidth', { configurable: true, value: px });
}

describe('In-chat Media panel — width clamp (close-button clipping fix)', () => {
  it('keeps the preferred 400px width when the row has plenty of room', async () => {
    await renderReady();
    stubRowWidth(1200);

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());

    const panel = screen.getByTestId('third-pane-panel');
    expect(parseFloat(panel.style.flexBasis)).toBe(400); // MEDIA_PANEL_WIDTH, unclamped

    // And the close button — the thing actually reported broken — is present
    // and clickable, not just rendered somewhere off-screen.
    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());
  });

  it('shrinks below 400px when the row is only as wide as the drawer floor, keeping the close button reachable', async () => {
    await renderReady();
    // 680 is ChatDrawerV2's own clamp(680px, 50vw, 1120px) floor — the
    // narrowest the row is ever asked to render at on desktop. Unclamped,
    // 48 (rail) + 260 (chat floor) + 400 (media) = 708, 28px past this.
    stubRowWidth(680);

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());

    const panel = screen.getByTestId('third-pane-panel');
    const width = parseFloat(panel.style.flexBasis);
    expect(width).toBe(363); // maxPanelWidth(680) = 680 - 48 - 9 - 260
    expect(width).toBeLessThan(400);
    expect(48 + width + 260).toBeLessThanOrEqual(680); // fits the row with room to spare

    // The close button must still be reachable — this is the actual bug.
    const closeButton = screen.getByRole('button', { name: 'Close media gallery' });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());
  });

  it('never shrinks the media panel below MIN_PANEL_WIDTH even at an extremely narrow row', async () => {
    await renderReady();
    stubRowWidth(400); // narrower than any real desktop drawer floor, worst case

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());

    const panel = screen.getByTestId('third-pane-panel');
    expect(parseFloat(panel.style.flexBasis)).toBe(280); // MIN_PANEL_WIDTH
  });

  it('reclamps on reopen rather than reusing a width computed at a different row size', async () => {
    await renderReady();
    stubRowWidth(680);

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    let panel = screen.getByTestId('third-pane-panel');
    expect(parseFloat(panel.style.flexBasis)).toBe(363);

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());

    // Simulate the browser having been widened while the panel was closed.
    stubRowWidth(1200);
    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    panel = screen.getByTestId('third-pane-panel');
    expect(parseFloat(panel.style.flexBasis)).toBe(400);
  });
});

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.kebabDelete.test.tsx and
// ChatHero.memoryPanel.test.tsx already use to reach the mobile branch.
describe('Media — mobile (390px)', () => {
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

  it('tapping the sidebar Media row closes the drawer and opens the standalone page', async () => {
    // Can't reuse renderReady() here — at mobile widths the memory receipt
    // has no button role (Stage A is desktop-only), same as
    // ChatHero.memoryPanel.test.tsx's own mobile-width test confirms.
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));

    // At 390px the sidebar starts closed (mobile overlay, not docked) — open
    // it via the header's hamburger, same as a real phone tap.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: 'New Chat' }); // drawer overlay mounted

    const dialog = screen.getByRole('dialog', { name: 'Media' });
    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('inert'));
    // The drawer overlay itself unmounts once Media takes over the screen —
    // but no longer on the same tick: closing now plays an exit animation and
    // the unmount trails it (useAnimatedPresence, 2026-08-17). The dismissal
    // is unchanged, only its timing, so this waits the way the scrim/width
    // suites already do.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'New Chat' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Close media page' }));
    await waitFor(() => expect(dialog).toHaveAttribute('inert'));
  });

  it('tapping the chat-header icon opens the in-chat panel as a bottom sheet', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));

    // findBy, not getBy: on mobile the icon only appears once the store's
    // media catch-up has landed at least one item for this session (see
    // READY_MEDIA_ITEM above) — it is no longer present from first paint.
    fireEvent.click(await screen.findByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Media from this chat' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Media from this chat' })).toBeNull());
  });
});
