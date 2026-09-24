import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { ChatDrawerV2 } from './v2/ChatDrawerV2';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for story-deck workspace fixes item 1 (2026-09):
// the real ChatHero inside the real ChatDrawerV2 — expanding the docked Nav
// grows the Workspace (navExpandedWidthClassName) instead of squeezing Chat,
// opening a panel auto-collapses the Nav (and the Workspace with it), and a
// manual expand while a panel is open still wins.

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

function renderWorkspace(isFullScreen = false) {
  return render(
    <ChatProvider>
      <ChatDrawerV2
        isFullScreen={isFullScreen}
        onToggleFullScreen={vi.fn()}
        onClose={vi.fn()}
        showHeader={false}
        title="Heirloom chat"
        defaultWidthClassName="w-full max-w-2xl"
        navExpandedWidthClassName="w-full max-w-[880px]"
      >
        <ChatHero isFullScreen={isFullScreen} onToggleFullScreen={vi.fn()} />
      </ChatDrawerV2>
    </ChatProvider>,
  );
}

const drawer = () => screen.getByRole('dialog', { name: 'Heirloom chat' });

describe('Workspace grows with the docked Nav', () => {
  it('starts at the expanded-Nav width (the Nav opens expanded) and shrinks to the rail width on collapse', async () => {
    renderWorkspace();
    await waitFor(() => expect(drawer().className).toContain('max-w-[880px]'));

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    await waitFor(() => expect(drawer().className).toContain('max-w-2xl'));
    expect(drawer().className).not.toContain('max-w-[880px]');

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    await waitFor(() => expect(drawer().className).toContain('max-w-[880px]'));
  });

  it('opening a panel auto-collapses the Nav to the rail (Workspace back to the rail width); a manual expand then wins, panel still open', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    await waitFor(() => expect(drawer().className).toContain('max-w-[880px]'));

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toBeInTheDocument());
    await waitFor(() => expect(drawer().className).toContain('max-w-2xl'));
    expect(screen.getByRole('complementary').className).toContain('w-12');

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    await waitFor(() => expect(drawer().className).toContain('max-w-[880px]'));
    expect(screen.getByRole('complementary').className).toContain('w-64');
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toBeInTheDocument();
  });

  it('at full screen the Workspace stays 100vw whatever the Nav does', async () => {
    renderWorkspace(true);
    await screen.findByRole('button', { name: 'Collapse sidebar' });
    expect(drawer().className).toContain('w-screen');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(drawer().className).toContain('w-screen');
    expect(drawer().className).not.toContain('max-w');
  });
});

// Re-clamp on real resize (found in review, PR #494): a panel's width is
// seeded when it opens, but the Workspace can still be mid-transition then
// (Nav auto-collapsing 880 → 672px, leaving full screen, a window resize).
// A ResizeObserver on the row (and the Nav inside it) re-clamps against
// the MEASURED Nav width. happy-dom has no layout, so widths are stubbed
// and the observer is driven by hand.
describe('Open panels re-clamp when the Workspace actually resizes', () => {
  type ROCallback = () => void;
  let observers: ROCallback[] = [];
  class FakeResizeObserver {
    constructor(private cb: ROCallback) { observers.push(cb); }
    observe() {}
    disconnect() { observers = observers.filter((o) => o !== this.cb); }
  }
  function fireResize() { observers.forEach((cb) => cb()); }

  function stubWidths(rowPx: number, navPx: number) {
    const row = screen.getByTestId('memory-panel-row');
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: rowPx });
    const nav = Array.from(row.children).find((el) => el.tagName === 'ASIDE') as HTMLElement;
    Object.defineProperty(nav, 'offsetWidth', { configurable: true, value: navPx });
  }

  it('shrinks a panel seeded at a wider Workspace once the row settles narrower, keeping Chat above its floor', async () => {
    observers = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    renderWorkspace();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    // Seeded while the row is still 1400px wide (e.g. just leaving full
    // screen): 55% of 1400 = 770px.
    stubWidths(1400, 48);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    await waitFor(() => expect(parseFloat(panel.style.flexBasis)).toBe(770));

    // The drawer finishes its transition at 672px.
    stubWidths(672, 48);
    act(() => fireResize());
    // 672 − 48 rail − 9 divider − 260 chat floor = 355.
    await waitFor(() => expect(parseFloat(panel.style.flexBasis)).toBe(355));
  });

  it('does not squeeze the panel when the Nav expands and the Workspace grows with it', async () => {
    observers = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    renderWorkspace();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    stubWidths(672, 48);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    await waitFor(() => expect(parseFloat(panel.style.flexBasis)).toBe(355));

    // Manual expand: Nav 48 → 256 and the Workspace 672 → 880, together.
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    stubWidths(880, 256);
    act(() => fireResize());
    expect(parseFloat(panel.style.flexBasis)).toBe(355);
  });

  it('ignores a zero-width (not laid out) row instead of collapsing the panel to its floor', async () => {
    observers = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    renderWorkspace();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    stubWidths(1400, 48);
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    const divider = await screen.findByRole('separator', { name: 'Resize the memory panel' });
    const panel = divider.nextElementSibling as HTMLElement;
    await waitFor(() => expect(parseFloat(panel.style.flexBasis)).toBe(770));

    stubWidths(0, 0);
    act(() => fireResize());
    expect(parseFloat(panel.style.flexBasis)).toBe(770);
  });
});
