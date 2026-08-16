import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Coverage for tap-outside-to-close on the mobile sidebar overlay. Before
// this, the mobile drawer rendered with no backdrop at all — the only way
// out was the explicit Close-X (or Escape, which mobile users don't have),
// against every other dismissible surface in this drawer. The scrim follows
// the same contract Media's bottom sheet already uses: aria-hidden, no
// button role, pointer-dismiss only, with Escape covering the keyboard path.

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
  id: 'sess-mobile-scrim',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-16T00:00:00.000Z',
  visitor_name: null,
  title: 'Mobile scrim test session',
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
// window.innerWidth — same technique ChatHero.mobileMemoryPanel.test.tsx and
// ChatHero.mediaPanel.test.tsx already use to reach the mobile branch.
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

describe('Mobile sidebar — tap-outside-to-close scrim (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('renders no scrim while the sidebar is closed', async () => {
    await renderReady();

    expect(screen.queryByTestId('mobile-sidebar-scrim')).toBeNull();
  });

  it('renders the scrim once the sidebar is opened from the hamburger', async () => {
    await renderReady();
    await openSidebar();

    expect(screen.getByTestId('mobile-sidebar-scrim')).toBeInTheDocument();
  });

  it('tapping the scrim closes the sidebar', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull());
    expect(screen.queryByTestId('mobile-sidebar-scrim')).toBeNull();
  });

  it('the Close-X still closes the sidebar (unchanged)', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull());
    expect(screen.queryByTestId('mobile-sidebar-scrim')).toBeNull();
  });

  it('the catcher sits under the drawer (z-20) so the sidebar itself stays tappable', async () => {
    await renderReady();
    await openSidebar();

    // Layering is the whole contract here: a catcher at or above the drawer's
    // own z-30 would swallow every tap meant for the nav inside it.
    expect(screen.getByTestId('mobile-sidebar-scrim').className).toContain('z-20');
    // It is a pointer affordance, not a control — keyboard dismissal is the
    // existing Escape handler, so it must stay out of the a11y tree.
    expect(screen.getByTestId('mobile-sidebar-scrim')).toHaveAttribute('aria-hidden', 'true');
  });

  it('stays invisible — sidebar_uploads_scrim_stories_2006 removed this drawer\'s dimming on purpose', async () => {
    await renderReady();
    await openSidebar();

    // Regression guard on the design decision, not just the mechanism: this
    // drawer reads as a wider panel on the chat, not a modal, so the catcher
    // restores tap-to-close WITHOUT bringing back the dimming that handover
    // deliberately deleted. Reintroducing a bg tint should fail here first.
    const className = screen.getByTestId('mobile-sidebar-scrim').className;
    expect(className).not.toMatch(/bg-/);
    expect(className).not.toMatch(/backdrop-blur/);
  });
});

describe('Mobile sidebar scrim does not leak into desktop', () => {
  it('never renders at desktop widths, where the sidebar is docked', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    // The docked desktop sidebar renders its collapse toggle, not a Close-X —
    // there is no overlay to dismiss, so there is no scrim either.
    await screen.findByRole('button', { name: 'Collapse sidebar' });

    expect(screen.queryByTestId('mobile-sidebar-scrim')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });
});
