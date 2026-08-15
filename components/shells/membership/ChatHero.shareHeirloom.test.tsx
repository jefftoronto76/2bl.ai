import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for Share Heirloom (wire-share-heirloom-modal). The
// modal itself (v2/ShareHeirloomModal.tsx) was fully built but never mounted,
// and BOTH entry points were inert: SidebarV2's nav row called
// onShareHeirloom?.() but carried a hardcoded `pointer-events-none`, and
// ChatHeader's icon was aria-disabled with no onClick at all. These tests
// cover the wiring — two entry points, one ChatHero-owned modal — plus the
// dismissal paths useModalA11y provides, which had never actually run against
// a mounted instance of this modal.
//
// Same integration-test shape as ChatHero.sessionMemoriesPanel.test.tsx.
//
// Note on queries: SidebarV2's nav row and ChatHeader's icon share the
// accessible name "Share Heirloom" (they do the same thing), and on desktop
// the sidebar is always rendered — so entry-point assertions index into
// getAllByRole rather than using getByRole. Document order is
// header-then-sidebar: <ChatHeader> is emitted before the
// sidebar|chat|panel row SidebarV2 mounts inside.

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

// Spelled out here rather than imported from ShareHeirloomModal on purpose:
// importing the component's own constant would make these assertions
// tautological — they'd follow any future edit to it, including a wrong one.
// This is the contract (real production domain + the three share UTMs), so a
// change to it should fail here and be re-approved deliberately.
const DEFAULT_SHARE_URL =
  'https://heirloom.2bl.ai/?utm_source=share&utm_medium=social&utm_campaign=withlove';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

const writeText = vi.fn(async (_text: string) => {});
const windowOpen = vi.fn();

beforeEach(() => {
  fetchMock.mockClear();
  writeText.mockClear();
  windowOpen.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('open', windowOpen);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHero() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
}

/** Both entry points share this accessible name; [0] is the header icon
 *  (ChatHeader renders before the row containing SidebarV2), [1] the sidebar row. */
function shareTriggers() {
  return screen.getAllByRole('button', { name: 'Share Heirloom' });
}

function shareDialog() {
  return screen.getByRole('dialog', { name: 'Share Heirloom' });
}

describe('Share Heirloom — entry points (desktop)', () => {
  it('is closed on mount, and both entry points are live', async () => {
    renderHero();
    await waitFor(() => expect(shareTriggers()).toHaveLength(2));

    expect(screen.queryByRole('dialog', { name: 'Share Heirloom' })).toBeNull();
    // Regression: the sidebar row used to carry a hardcoded
    // `pointer-events-none`, so passing the handler alone left it un-clickable.
    for (const trigger of shareTriggers()) {
      expect(trigger.className).not.toContain('pointer-events-none');
      expect(trigger).not.toHaveAttribute('aria-disabled');
    }
  });

  it('opens from the chat-header icon', async () => {
    renderHero();
    await waitFor(() => expect(shareTriggers()).toHaveLength(2));

    fireEvent.click(shareTriggers()[0]);

    await waitFor(() => expect(shareDialog()).toBeInTheDocument());
    expect(within(shareDialog()).getByRole('heading', { name: 'Share Heirloom' })).toBeInTheDocument();
  });

  it('opens from the sidebar nav row', async () => {
    renderHero();
    await waitFor(() => expect(shareTriggers()).toHaveLength(2));

    fireEvent.click(shareTriggers()[1]);

    await waitFor(() => expect(shareDialog()).toBeInTheDocument());
  });
});

describe('Share Heirloom — dismissal', () => {
  async function openShare() {
    renderHero();
    await waitFor(() => expect(shareTriggers().length).toBeGreaterThan(0));
    fireEvent.click(shareTriggers()[0]);
    await waitFor(() => expect(shareDialog()).toBeInTheDocument());
  }

  it('closes via the X button', async () => {
    await openShare();

    fireEvent.click(within(shareDialog()).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Share Heirloom' })).toBeNull());
  });

  it('closes via Escape (useModalA11y, window-capture)', async () => {
    await openShare();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Share Heirloom' })).toBeNull());
  });

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    await openShare();

    // Inside the panel first — must NOT close (the dialog stops propagation
    // before the backdrop's own onClick sees it).
    fireEvent.click(within(shareDialog()).getByRole('heading', { name: 'Share Heirloom' }));
    expect(shareDialog()).toBeInTheDocument();

    const backdrop = shareDialog().parentElement as HTMLElement;
    expect(backdrop.className).toContain('z-[80]');
    fireEvent.click(backdrop);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Share Heirloom' })).toBeNull());
  });
});

describe('Share Heirloom — actions', () => {
  async function openShare() {
    renderHero();
    await waitFor(() => expect(shareTriggers().length).toBeGreaterThan(0));
    fireEvent.click(shareTriggers()[0]);
    await waitFor(() => expect(shareDialog()).toBeInTheDocument());
  }

  it('copies the default share URL — real domain, UTMs intact — and confirms it', async () => {
    await openShare();

    const dialog = within(shareDialog());
    // The displayed value is the copied value minus the scheme (cleanUrl), so
    // the UTMs are part of what's shown too, not just what's copied.
    expect(dialog.getByText(DEFAULT_SHARE_URL.replace(/^https?:\/\//, ''))).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(DEFAULT_SHARE_URL));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Copied' })).toBeInTheDocument());

    // Named individually so a dropped/renamed param fails on its own name
    // rather than as an opaque whole-string mismatch. Parsed, not substring-
    // matched, so `utm_source=shared` can't satisfy `utm_source=share`.
    const params = new URL(writeText.mock.calls[0][0]).searchParams;
    expect(params.get('utm_source')).toBe('share');
    expect(params.get('utm_medium')).toBe('social');
    expect(params.get('utm_campaign')).toBe('withlove');
  });

  it('opens each default channel intent in a new tab with the share URL', async () => {
    await openShare();

    const dialog = within(shareDialog());
    for (const label of ['X', 'Facebook', 'LinkedIn', 'Email']) {
      fireEvent.click(dialog.getByRole('button', { name: `Share on ${label}` }));
    }

    expect(windowOpen).toHaveBeenCalledTimes(4);
    const hrefs = windowOpen.mock.calls.map((c) => c[0] as string);
    expect(hrefs[0]).toContain('twitter.com/intent/tweet');
    expect(hrefs[1]).toContain('facebook.com/sharer');
    expect(hrefs[2]).toContain('linkedin.com/sharing');
    expect(hrefs[3]).toMatch(/^mailto:/);
    // Every channel carries the full default URL — domain AND all three UTMs —
    // percent-encoded into its intent (the mailto puts it in the body).
    for (const href of hrefs) {
      expect(href).toContain(encodeURIComponent(DEFAULT_SHARE_URL));
    }
    for (const call of windowOpen.mock.calls) {
      expect(call[1]).toBe('_blank');
      expect(call[2]).toBe('noopener,noreferrer');
    }
  });
});

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique the other ChatHero tests use to reach
// the mobile branch.
describe('Share Heirloom — mobile (390px)', () => {
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

  it('opens from the header icon with no sidebar mounted', async () => {
    renderHero();
    // Mobile: the sidebar is an overlay, so only the header icon is present.
    await waitFor(() => expect(shareTriggers()).toHaveLength(1));

    fireEvent.click(shareTriggers()[0]);

    await waitFor(() => expect(shareDialog()).toBeInTheDocument());
  });

  it('opens from the sidebar overlay and closes the drawer on the way', async () => {
    renderHero();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await waitFor(() => expect(shareTriggers()).toHaveLength(2));

    fireEvent.click(shareTriggers()[1]);

    await waitFor(() => expect(shareDialog()).toBeInTheDocument());
    // Drawer dismissed — the sidebar's own nav row is gone again.
    expect(screen.getAllByRole('button', { name: 'Share Heirloom' })).toHaveLength(1);
  });
});
