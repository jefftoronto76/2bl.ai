// Regression guard for the "content stuck shifted right after closing the
// mobile sidebar, text clipped mid-word on the left" bug (2026-08-17).
//
// ROOT CAUSE (see the comment on MessageList.tsx's scrollRef div): the
// transcript's own scroll container had `overflow-y-auto` with no explicit
// `overflow-x`. Per the CSS Overflow spec, a non-`visible` overflow-y with an
// unset overflow-x computes overflow-x to `auto` too — the exact mechanic
// SidebarV2.tsx's <aside> already pairs `overflow-x-hidden overflow-y-auto`
// to avoid, and MemoryCard.tsx documents directly. That implicit `auto` let
// the container pick up a real horizontal scrollLeft, most plausibly from
// ChatThread.tsx's scrollAnchorRef.scrollIntoView() (default `inline:
// 'nearest'`) firing while the ancestor content column was mid-transform
// (ChatHero's mobile sidebar push, translate-x-[30%] -> translate-x-0 over
// 240ms) — the anchor could momentarily read as horizontally out of view
// even though the layout box never truly overflowed, and the browser
// "corrected" it by scrolling the transcript sideways. Nothing ever reset
// that scrollLeft afterward.
//
// This was NOT a bug in the push-transform's own class computation —
// ChatHero.mobileSidebarPushAnimation.test.tsx already covers that
// extensively and every case there passes cleanly; state.isSidebarExpanded
// is derived fresh on every render with no stale-closure path. The fix is
// simply removing the transcript's ability to scroll horizontally at all —
// it never legitimately needs to (messages wrap via whitespace-pre-wrap,
// nothing here renders wide unwrapped content).
//
// happy-dom has no layout engine and does not implement scrollIntoView's
// viewport-visibility math, so the dynamic mechanism above cannot be
// reproduced here. This asserts the durable structural guard instead — the
// same convention SidebarV2.touchTapTargets.test.tsx uses for a CSS-only
// regression jsdom can't otherwise exercise.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

const GUIDE_TEXT = 'It sounds like a beautiful memory.';

const SESSION = {
  id: 'sess-overflow-x',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: GUIDE_TEXT, timestamp: 2 },
  ],
  updated_at: '2026-08-17T00:00:00.000Z',
  visitor_name: null,
  title: 'Overflow-x session',
  starred: false,
  memory_count: 0,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories')) return jsonResponse({ memories: [] });
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

describe('MessageList — transcript scroll container cannot scroll horizontally', () => {
  it('pairs overflow-x-hidden with overflow-y-auto on the transcript scroll container', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(GUIDE_TEXT).length).toBeGreaterThan(0));

    const log = screen.getByRole('log', { name: 'Conversation' });

    // Both classes matter: overflow-y-auto is the intended vertical scroll,
    // overflow-x-hidden is what stops the CSS spec's implicit auto-promotion
    // of the unset X axis from giving this container a real scrollLeft.
    expect(log.classList.contains('overflow-y-auto')).toBe(true);
    expect(log.classList.contains('overflow-x-hidden')).toBe(true);
  });
});
