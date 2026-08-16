import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// The mobile sidebar overlay used to render at the SAME w-64 (256px) as the
// docked desktop sidebar — SidebarV2 hard-coded that width for both roles — so
// opening the drawer on a ~390px phone covered a 256px sliver of the canvas
// instead of reading as a drawer. The fix is scoped to the overlay only: the
// wrapper carries a mobile width and SidebarV2 fills it via
// expandedWidthClassName, leaving the docked column's w-64 alone.
//
// The uncovered strip is load-bearing, not leftover space: the invisible
// tap-catcher (mobile-sidebar-tap-outside) sits at z-20 UNDER the z-30 drawer,
// so tap-outside-to-close only survives while a real strip stays reachable.
// That is why the drawer is a percentage short of full-bleed, and why these
// tests assert the strip alongside the width.

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
  id: 'sess-mobile-width',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-16T00:00:00.000Z',
  visitor_name: null,
  title: 'Mobile drawer width test session',
  starred: false,
  memory_count: 0,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [] });
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

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — the same technique ChatHero.mobileSidebarScrim.test.tsx
// and ChatHero.mobileMemoryPanel.test.tsx already use to reach the mobile branch.
function setViewport(width: number) {
  (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
    width,
  });
}

async function renderReady() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await screen.findByRole('button', { name: 'Open navigation' });
}

async function openSidebar() {
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  await screen.findByRole('button', { name: 'Close menu' });
}

describe('Mobile sidebar overlay — drawer width (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('sizes the overlay wrapper to most of the canvas, not a 256px sliver', async () => {
    await renderReady();
    await openSidebar();

    const drawer = screen.getByTestId('mobile-sidebar-drawer');
    expect(drawer.className).toContain('w-[86%]');
    // The regression itself: the overlay must not be sized by the docked
    // sidebar's persistent-column width.
    expect(drawer.className).not.toContain('w-64');
  });

  it('lets SidebarV2 fill that wrapper instead of clamping itself to w-64', async () => {
    await renderReady();
    await openSidebar();

    // A wider wrapper alone would not help: the <aside> is flex-shrink-0, so at
    // w-64 it would just leave 86%-minus-256px of empty wrapper behind it.
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('w-full');
    expect(aside.className).not.toContain('w-64');
  });

  it('keeps the drawer above the tap-catcher so the nav inside stays tappable', async () => {
    await renderReady();
    await openSidebar();

    expect(screen.getByTestId('mobile-sidebar-drawer').className).toContain('z-30');
    expect(screen.getByTestId('mobile-sidebar-scrim').className).toContain('z-20');
  });

  it('still closes on a tap outside — the widened drawer leaves the catcher a strip', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull());
    expect(screen.queryByTestId('mobile-sidebar-drawer')).toBeNull();
  });

  it('still closes from the Close-X (unchanged)', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull());
    expect(screen.queryByTestId('mobile-sidebar-drawer')).toBeNull();
  });
});

describe('Mobile drawer width does not leak into the docked desktop sidebar', () => {
  it('keeps the docked column at w-64 and mounts no overlay wrapper', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    // The docked sidebar renders the collapse chevron, not a Close-X.
    await screen.findByRole('button', { name: 'Collapse sidebar' });

    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('w-64');
    expect(aside.className).not.toContain('w-full');
    expect(screen.queryByTestId('mobile-sidebar-drawer')).toBeNull();
  });
});
