// Integration coverage for the mobile drawer's exit animation (2026-08-17).
//
// The drawer had an entrance (hl-animate-sheet-left) and no exit: it is
// conditionally rendered, so every close unmounted the node on the same tick
// and the reverse keyframe never ran. Opening looked deliberate, closing was
// an abrupt vanish.
//
// TEST PLAN — this file covers the WIRING; useAnimatedPresence.test.tsx covers
// the timing mechanism itself:
//   1. Every close trigger routes through the one central path. The task's
//      whole point is that no call site carries its own delay, so each of the
//      five — scrim, Close-X, Escape, Media, Share — plus the header hamburger
//      acting as a toggle — is asserted to leave the drawer mounted-and-exiting
//      rather than instantly gone. A trigger that still dispatched the raw
//      action would fail here by unmounting straight away. Session row and
//      story row selection are deliberately NOT close triggers (mobile
//      sidebar no longer auto-closes on select) and are covered instead in
//      the "no longer closes" describe block below.
//   2. The exit class is the reverse keyframe, and the entrance class is gone
//      while it plays — both applied to the same node, so a half-wired swap
//      that leaves both on at once is caught.
//   3. The closing drawer stops taking taps. It is still on screen for 240ms
//      and still hit-testable, so without pointer-events-none a tap aimed at a
//      dismissing drawer could load a session.
//   4. Rapid re-open mid-exit — the called-out edge case, end to end through
//      the real component rather than the hook in isolation: the drawer comes
//      back on the entrance class and is STILL mounted well past the moment
//      the cancelled unmount would have fired.
//   5. It does eventually unmount — the delay is a delay, not a leak.
//
// Not covered here: that the animation visibly plays. happy-dom does not run
// CSS animations, so these assert the class contract that drives them; the
// motion itself is a preview check. Reduced motion is likewise a matchMedia
// path — the zero-duration branch is unit-tested in useAnimatedPresence.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const STORIES = [{ id: 'story-1', name: 'A Full Story', isOwner: true }];

const SESSION = {
  id: 'sess-exit-anim',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-17T00:00:00.000Z',
  visitor_name: null,
  title: 'Exit animation session',
  starred: false,
  memory_count: 0,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: STORIES });
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
// window.innerWidth — the same technique the other mobile ChatHero suites use
// to reach the mobile branch.
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

const drawer = () => screen.queryByTestId('mobile-sidebar-drawer');

/** Exact class-token check — `hl-animate-sheet-left` is a prefix of
 *  `hl-animate-sheet-left-out`, so substring matching would report the
 *  entrance class as present throughout the exit. */
const hasClass = (el: Element, name: string) => el.classList.contains(name);

/** The drawer is still mounted and playing its exit keyframe. */
function expectExiting() {
  const el = drawer();
  expect(el, 'drawer unmounted instantly — the close did not route through the animated path').not.toBeNull();
  expect(hasClass(el!, 'hl-animate-sheet-left-out'), 'exit keyframe class missing').toBe(true);
  expect(hasClass(el!, 'hl-animate-sheet-left'), 'entrance class still applied during the exit').toBe(false);
}

describe('Mobile sidebar exit animation — every close trigger routes through it (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('plays the entrance class while open, with no exit class', async () => {
    await renderReady();
    await openSidebar();

    expect(hasClass(drawer()!, 'hl-animate-sheet-left')).toBe(true);
    expect(hasClass(drawer()!, 'hl-animate-sheet-left-out')).toBe(false);
  });

  it('tapping the scrim animates out instead of vanishing', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));

    expectExiting();
  });

  it('the Close-X animates out', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expectExiting();
  });

  it('Escape animates out', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.keyDown(document, { key: 'Escape' });

    expectExiting();
  });

  it('the Media row animates out', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));

    expectExiting();
  });

  it('the Share Heirloom row animates out', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Share Heirloom' }));

    expectExiting();
  });

  it('the header hamburger, which doubles as a close, animates out', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expectExiting();
  });
});

describe('Mobile sidebar exit animation — session/story selection no longer closes (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('selecting a session row leaves the drawer open, not exiting', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(await screen.findByRole('button', { name: 'Exit animation session' }));

    expect(drawer(), 'drawer unmounted — selection must not close the sidebar').not.toBeNull();
    expect(hasClass(drawer()!, 'hl-animate-sheet-left')).toBe(true);
    expect(hasClass(drawer()!, 'hl-animate-sheet-left-out')).toBe(false);
  });

  it('selecting a story row leaves the drawer open, not exiting', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(await screen.findByRole('button', { name: 'A Full Story' }));

    expect(drawer(), 'drawer unmounted — selection must not close the sidebar').not.toBeNull();
    expect(hasClass(drawer()!, 'hl-animate-sheet-left')).toBe(true);
    expect(hasClass(drawer()!, 'hl-animate-sheet-left-out')).toBe(false);
  });
});

describe('Mobile sidebar exit animation — behaviour while closing (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('stops taking taps while it slides away', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));

    // Both layers: the drawer must not accept a tap meant for the chat behind
    // it, and the scrim must not re-fire a close that is already running.
    expect(hasClass(drawer()!, 'pointer-events-none')).toBe(true);
    expect(hasClass(screen.getByTestId('mobile-sidebar-scrim'), 'pointer-events-none')).toBe(true);
  });

  it('does eventually unmount — the delay is a delay, not a leak', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));
    expectExiting();

    await waitFor(() => expect(drawer()).toBeNull());
    expect(screen.queryByTestId('mobile-sidebar-scrim')).toBeNull();
  });
});

describe('Mobile sidebar exit animation — rapid re-open mid-close (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('re-opening during the exit restores the entrance class and cancels the unmount', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));
    expectExiting();

    // Re-open before the 240ms is up. The hamburger lives in the header, above
    // the drawer, so it stays reachable even while the drawer is exiting.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(drawer()).not.toBeNull();
    expect(hasClass(drawer()!, 'hl-animate-sheet-left')).toBe(true);
    expect(hasClass(drawer()!, 'hl-animate-sheet-left-out')).toBe(false);
    expect(hasClass(drawer()!, 'pointer-events-none')).toBe(false);

    // The regression that matters: well past the point the cancelled timer
    // would have fired, the drawer the user just re-opened is still here.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(drawer()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
  });

  it('a close after a cancelled close still animates out and unmounts', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expectExiting();
    await waitFor(() => expect(drawer()).toBeNull());
  });
});
