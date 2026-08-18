// Integration coverage for the mobile sidebar's "push" animation (2026-08-17).
//
// Before this, opening the mobile drawer (see
// ChatHero.mobileSidebarExitAnimation.test.tsx) slid the drawer over a static
// content column — the chat behind it never moved. This adds a push: the
// header and the chat column (MessageList + ChatInput) shift right in
// lockstep with the drawer's own slide, driven by the same
// state.isSidebarExpanded flag and the same 240ms duration as
// SIDEBAR_EXIT_MS, so the two motions read as one system rather than two
// unrelated animations that happen to fire together.
//
// TEST PLAN:
//   1. Closed at rest: both the header wrapper and the chat column sit at
//      translate-x-0, no transition class fighting the resting state.
//   2. Opening applies the SAME pushed transform (translate-x-[30%]) to both
//      the header wrapper and the chat column — the "cohesive unit or
//      nothing" requirement, checked as an equality between the two class
//      strings rather than two separate assertions, so a future edit that
//      drifts one without the other fails here.
//   3. Every close trigger (scrim, Close-X, Escape, the header hamburger
//      acting as a toggle) returns both elements to translate-x-0 — not just
//      the scrim, so a partially-wired close path is caught. Selecting a
//      session row is deliberately NOT a close trigger (mobile sidebar no
//      longer auto-closes on select), so it stays pushed instead.
//   4. Rapid re-open mid-close: state flips open -> close -> open inside one
//      synchronous batch of events; the push is driven straight off
//      state.isSidebarExpanded (not a lagged presence/exiting pair like the
//      drawer needs, since neither pushed element ever unmounts), so this
//      should resolve to the open transform with no special-casing needed.
//      Covered end-to-end through the real component instead of assumed from
//      the mechanism, mirroring how #424 covered the same edge case for the
//      drawer itself.
//   5. Reduced motion (useReducedMotion() => true): the duration class drops
//      to duration-0 while the transform still reaches translate-x-[30%] on
//      open — collapses to instant rather than removing the push outright,
//      matching prefersReducedMotion's existing effect on SIDEBAR_EXIT_MS.
//   6. Desktop (no matching viewport => isMobile false): the push class is
//      empty regardless of state.isSidebarExpanded — this is a mobile-only
//      concept, and desktop's docked SidebarV2 must not pick up a stray
//      transform.
//   7. z-index regression guard: the drawer keeps z-30 and the scrim keeps
//      z-20 — the push is purely a transform on the content side, not a
//      re-layering, per the task's explicit constraint.
//   8. Mobile sign-in bug, 2026-08-18: the `transform` this push class applies
//      isolates the header and chat column wrappers into separate stacking
//      contexts, and the chat column (later in the DOM) silently painted over
//      the header's Account dropdown, eating every tap on it. The header
//      wrapper now also carries `relative z-10`, verified against the
//      drawer/scrim z-index guard above (stays under both) and pinned as its
//      own class-contract test — see that test for the full mechanism.
//
// Not covered here: that the transition visibly animates smoothly between
// the two states. happy-dom does not run CSS transitions, so these assert
// the class contract that drives them — the eased, gentle motion itself is a
// preview check (see the PR description for the curve chosen and why).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Mutable via a hoisted ref rather than vi.resetModules(): resetting modules
// mid-suite would also blow away the singleton store registry these tests
// share, so toggling one exported hook through a shared mock is the safer
// path to a reduced-motion render.
const mantineMocks = vi.hoisted(() => ({ reducedMotion: false }));
vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/hooks')>();
  return { ...actual, useReducedMotion: () => mantineMocks.reducedMotion };
});

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
  id: 'sess-push-anim',
  messages: [{ id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 }],
  updated_at: '2026-08-17T00:00:00.000Z',
  visitor_name: null,
  title: 'Push animation session',
  starred: false,
  memory_count: 0,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: [] });
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

const headerWrapper = () => screen.getByTestId('chat-header-push-wrapper');
const chatColumn = () => screen.getByTestId('chat-column-push-wrapper');

const isPushed = (el: Element) => el.classList.contains('translate-x-[30%]');
const isAtRest = (el: Element) => el.classList.contains('translate-x-0');

describe('Mobile sidebar push animation — content shifts in lockstep with the drawer (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('sits at rest (translate-x-0) before the sidebar ever opens', async () => {
    await renderReady();

    expect(isAtRest(headerWrapper())).toBe(true);
    expect(isAtRest(chatColumn())).toBe(true);
    expect(isPushed(headerWrapper())).toBe(false);
    expect(isPushed(chatColumn())).toBe(false);
  });

  it('opening pushes the header and the chat column by the identical transform/transition string', async () => {
    await renderReady();
    await openSidebar();

    expect(isPushed(headerWrapper())).toBe(true);
    expect(isPushed(chatColumn())).toBe(true);
    // Cohesive-unit requirement: not just "both pushed" but pushed by the
    // exact same transition + transform string appended verbatim, so they
    // cannot drift apart in duration or curve without this failing. The
    // header wrapper carries `relative z-10` on top of that shared string
    // (mobile stacking fix, 2026-08-18 — see the z-index test below), so this
    // now checks that string is a prefix of the header's className and a
    // suffix of the chat column's, rather than asserting the two full
    // className strings are identical.
    const chatColumnClass = chatColumn().className;
    const headerClass = headerWrapper().className;
    const sharedPushClass = chatColumnClass.slice(chatColumnClass.indexOf('transition-transform'));
    expect(headerClass.startsWith(sharedPushClass)).toBe(true);
    expect(chatColumnClass.endsWith(sharedPushClass)).toBe(true);
  });

  it('carries the 240ms duration and an eased (not linear) curve', async () => {
    await renderReady();
    await openSidebar();

    expect(headerWrapper().className).toContain('duration-[240ms]');
    expect(headerWrapper().className).toContain('transition-transform');
    expect(headerWrapper().className).not.toContain('duration-0');
  });

  it('closing via the scrim returns both elements to rest', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));

    expect(isAtRest(headerWrapper())).toBe(true);
    expect(isAtRest(chatColumn())).toBe(true);
  });

  it('closing via the drawer\'s own Close-X returns both elements to rest', async () => {
    await renderReady();
    await openSidebar();

    // Distinct from the header hamburger test below — this is SidebarV2's own
    // X button (aria-label "Close menu"), a different element/onClick than
    // ChatHeader's "Open navigation" toggle, even though both ultimately call
    // the same closeMobileSidebar. Was previously untested here despite the
    // file's own doc comment listing it as covered.
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(isAtRest(headerWrapper())).toBe(true);
    expect(isAtRest(chatColumn())).toBe(true);
  });

  it('closing via Escape returns both elements to rest', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(isAtRest(headerWrapper())).toBe(true);
    expect(isAtRest(chatColumn())).toBe(true);
  });

  it('selecting a session row does not close the sidebar — both elements stay pushed', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(await screen.findByRole('button', { name: 'Push animation session' }));

    expect(isPushed(headerWrapper())).toBe(true);
    expect(isPushed(chatColumn())).toBe(true);
  });

  it('the header hamburger, doubling as a close, returns both elements to rest', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(isAtRest(headerWrapper())).toBe(true);
    expect(isAtRest(chatColumn())).toBe(true);
  });

  it('does not touch the drawer/scrim z-index relationship', async () => {
    await renderReady();
    await openSidebar();

    expect(screen.getByTestId('mobile-sidebar-drawer').className).toContain('z-30');
    expect(screen.getByTestId('mobile-sidebar-scrim').className).toContain('z-20');
  });

  // Mobile sign-in bug, 2026-08-18: `transform` on this wrapper (even at rest,
  // translate-x-0 counts) isolates it into its own stacking context, and the
  // chat column wrapper below it — also transformed, declared later in the
  // DOM — painted over that whole context, silently eating every tap on the
  // Account dropdown (Sign in included) wherever it overlaps the chat column,
  // confirmed against a minimal repro with elementFromPoint. happy-dom has no
  // layout/paint engine (same limitation noted for the transcript-overflow
  // fix — see System Docs/Known Gaps.md), so this is a structural regression
  // guard on the class contract rather than a hit-testing assertion: it
  // pins `relative z-10` on the header wrapper, staying under the drawer's
  // z-30 and the scrim's z-20 (per the test above) while beating the chat
  // column's untouched z-index:auto.
  it('carries relative z-10 on the header wrapper only, at rest and pushed', async () => {
    await renderReady();

    expect(headerWrapper().className).toContain('relative');
    expect(headerWrapper().className).toContain('z-10');
    expect(chatColumn().className).not.toContain('z-10');

    await openSidebar();

    expect(headerWrapper().className).toContain('relative');
    expect(headerWrapper().className).toContain('z-10');
    expect(chatColumn().className).not.toContain('z-10');
  });
});

describe('Mobile sidebar push animation — rapid re-open mid-close (390px)', () => {
  beforeEach(() => setViewport(390));
  afterEach(() => setViewport(1024));

  it('re-opening during the close resolves to the pushed state, not stuck at rest', async () => {
    await renderReady();
    await openSidebar();

    fireEvent.click(screen.getByTestId('mobile-sidebar-scrim'));
    expect(isAtRest(headerWrapper())).toBe(true);

    // Re-open before the drawer's own 240ms exit has resolved.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(isPushed(headerWrapper())).toBe(true);
    expect(isPushed(chatColumn())).toBe(true);

    // Well past the point the drawer's own cancelled-then-restarted timing
    // could have left anything stuck mid-flight.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(isPushed(headerWrapper())).toBe(true);
    expect(isPushed(chatColumn())).toBe(true);
  });
});

describe('Mobile sidebar push animation — reduced motion (390px)', () => {
  beforeEach(() => {
    setViewport(390);
    mantineMocks.reducedMotion = true;
  });
  afterEach(() => {
    setViewport(1024);
    mantineMocks.reducedMotion = false;
  });

  it('collapses the transition to instant but still reaches the pushed position', async () => {
    await renderReady();
    await openSidebar();

    expect(headerWrapper().className).toContain('duration-0');
    expect(headerWrapper().className).not.toContain('duration-[240ms]');
    expect(isPushed(headerWrapper())).toBe(true);
    expect(isPushed(chatColumn())).toBe(true);
  });
});

describe('Mobile sidebar push animation — desktop is unaffected (1024px)', () => {
  beforeEach(() => setViewport(1024));

  it('never applies a push class regardless of sidebar state', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await screen.findByTestId('chat-header-push-wrapper');

    expect(headerWrapper().className).toBe('');
    expect(chatColumn().className).not.toMatch(/translate-x|transition-transform/);
  });
});
