import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for memory-panel-layout Stage A: clicking a saved
// memory receipt in the real ChatHero + MessageList + MemoryCard stack opens
// the panel with that memory's content; the close button reverses it. Also
// guards the Stage A `!isMobile` scoping — the panel must not be reachable
// at mobile widths yet (that's Stage F's job).

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
  id: 'sess-panel',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-08T00:00:00.000Z',
  visitor_name: null,
  title: 'Panel test session',
  starred: false,
  memory_count: 1,
};

const SAVED_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-panel',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [SAVED_MEMORY] });
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

describe('Memory panel — Stage A (desktop)', () => {
  it('opens the panel with the clicked memory\'s content, and the close button reverses it', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    // Panel not open yet — its body text (distinct from the receipt's own
    // title-only content) must not be on screen.
    expect(screen.queryByText('It was a quiet summer by the lake.')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
    expect(screen.getByText('It was a quiet summer by the lake.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));

    await waitFor(() => expect(screen.queryByText('It was a quiet summer by the lake.')).toBeNull());
  });
});

// happy-dom has no real CSS layout engine — panelRowRef.current.clientWidth
// is always 0 by default (verified directly against happy-dom, not
// assumed), which would pin every clamp to MIN_PANEL_WIDTH regardless of
// drag direction. Stubbing it on the row (data-testid="memory-panel-row",
// added for exactly this) makes the width math exercise real numbers.
function stubRowWidth(px: number) {
  const row = screen.getByTestId('memory-panel-row');
  Object.defineProperty(row, 'clientWidth', { configurable: true, value: px });
}

describe('Memory panel — Stage C (drag-resize)', () => {
  it('shows the resize divider only while the panel is open', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    expect(screen.queryByRole('separator', { name: 'Resize the memory panel' })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('separator', { name: 'Resize the memory panel' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));
    await waitFor(() => expect(screen.queryByRole('separator', { name: 'Resize the memory panel' })).toBeNull());
  });

  it('dragging left widens the panel, dragging right narrows it, and cleans up cursor/user-select on release', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    stubRowWidth(1200);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    const seededWidth = parseFloat(panel.style.flexBasis);
    expect(seededWidth).toBeGreaterThan(0);

    fireEvent.pointerDown(divider, { clientX: 500, button: 0 });
    expect(document.body.style.cursor).toBe('col-resize');
    fireEvent.pointerMove(window, { clientX: 400 }); // dragged left 100px — widens the panel
    fireEvent.pointerUp(window);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    const widerWidth = parseFloat(panel.style.flexBasis);
    expect(widerWidth).toBe(seededWidth + 100);

    fireEvent.pointerDown(divider, { clientX: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 550 }); // dragged right 150px — narrows the panel
    fireEvent.pointerUp(window);

    const narrowerWidth = parseFloat(panel.style.flexBasis);
    expect(narrowerWidth).toBe(widerWidth - 150);
  });

  it('stops at MIN_PANEL_WIDTH rather than shrinking past it', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    stubRowWidth(1200);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;

    fireEvent.pointerDown(divider, { clientX: 0, button: 0 });
    fireEvent.pointerMove(window, { clientX: 5000 }); // drag far past the floor
    fireEvent.pointerUp(window);

    expect(parseFloat(panel.style.flexBasis)).toBe(280); // MIN_PANEL_WIDTH
  });

  it('reseeds on reopen rather than remembering the last drag', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    stubRowWidth(1200);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    let divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    let panel = divider.nextElementSibling as HTMLElement;
    const seededWidth = parseFloat(panel.style.flexBasis);

    fireEvent.pointerDown(divider, { clientX: 500, button: 0 });
    fireEvent.pointerMove(window, { clientX: 400 }); // widen by 100px — within maxPanelWidth(1200)'s headroom from the seed
    fireEvent.pointerUp(window);
    expect(parseFloat(panel.style.flexBasis)).toBe(seededWidth + 100);

    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));
    await waitFor(() => expect(screen.queryByRole('separator', { name: 'Resize the memory panel' })).toBeNull());

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    panel = divider.nextElementSibling as HTMLElement;
    expect(parseFloat(panel.style.flexBasis)).toBe(seededWidth);
  });
});

describe('Memory panel — Stage E (keyboard operability)', () => {
  it('ArrowLeft/ArrowRight nudge the panel through the real ChatHero stack', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    stubRowWidth(1200);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    const seededWidth = parseFloat(panel.style.flexBasis);

    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    expect(parseFloat(panel.style.flexBasis)).toBe(seededWidth + 16);

    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(parseFloat(panel.style.flexBasis)).toBe(seededWidth - 16);
  });

  it('Home and double-click both reset to the same default the panel seeded at on open', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    stubRowWidth(1200);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    const seededWidth = parseFloat(panel.style.flexBasis);

    fireEvent.pointerDown(divider, { clientX: 500, button: 0 });
    fireEvent.pointerMove(window, { clientX: 300 }); // widen well away from the seed
    fireEvent.pointerUp(window);
    expect(parseFloat(panel.style.flexBasis)).not.toBe(seededWidth);

    fireEvent.keyDown(divider, { key: 'Home' });
    expect(parseFloat(panel.style.flexBasis)).toBe(seededWidth);

    // Drag away again, then confirm double-click resets identically.
    fireEvent.pointerDown(divider, { clientX: 500, button: 0 });
    fireEvent.pointerMove(window, { clientX: 300 });
    fireEvent.pointerUp(window);
    expect(parseFloat(panel.style.flexBasis)).not.toBe(seededWidth);

    fireEvent.doubleClick(divider);
    expect(parseFloat(panel.style.flexBasis)).toBe(seededWidth);
  });

  it('Home reflects the CURRENT row width, not the width when the panel first opened', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    stubRowWidth(1200);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    const seededAt1200 = parseFloat(panel.style.flexBasis);

    // Simulate a browser resize after the panel opened.
    stubRowWidth(1600);
    fireEvent.keyDown(divider, { key: 'Home' });

    const seededAt1600 = parseFloat(panel.style.flexBasis);
    expect(seededAt1600).not.toBe(seededAt1200);
    expect(seededAt1600).toBeGreaterThan(seededAt1200); // more room -> a wider default split
  });
});

describe('Memory panel — Remove confirmation (2026-08-08)', () => {
  async function openPanel() {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
  }

  function patchCalls() {
    return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
  }

  it('Remove opens the confirmation dialog instead of deleting immediately', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete memory' });
    expect(within(dialog).getByText(/The Lake House/)).toBeInTheDocument();
    // The copy must not say "and every memory it holds" — that's the
    // conversation/story cascade warning; a single memory doesn't cascade.
    expect(within(dialog).queryByText(/every memory it holds/)).toBeNull();
    expect(patchCalls()).toHaveLength(0);
    // The panel itself is still open behind the dialog, not torn down.
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toBeInTheDocument();
  });

  it('Confirming discards the memory and closes the panel', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete memory' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Memory title' })).toBeNull());

    const discardCall = patchCalls().find(([url]) => String(url).includes('/memories/mem-1'));
    expect(discardCall).toBeTruthy();
    expect(JSON.parse(String(discardCall?.[1]?.body))).toEqual({ action: 'discard' });
  });

  it('Canceling leaves the memory untouched and the panel open', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete memory' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House');
    expect(patchCalls()).toHaveLength(0);
  });
});

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.kebabDelete.test.tsx already
// uses to reach the mobile branch.
describe('Memory panel — Stage A is desktop-only (390px)', () => {
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

  it('the saved receipt has no button role at mobile widths — nothing to click yet', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /The Lake House/i })).toBeNull();
  });
});
