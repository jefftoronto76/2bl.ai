// Regression guard for the 2026-08-15 footer-spine clipping fix.
//
// The visible symptom was that "Discard" clipped out of the memory card for
// memories proposed from a GUIDE (assistant) message, while memories proposed
// from the VISITOR's own message rendered fine. The cause was not in
// MemoryCard at all: MessageList rendered the guide-anchored memory slot
// INSIDE the ml-[60px] wrapper that aligns MessageActions under the
// assistant's text, so that card got 60px less width than a visitor-anchored
// one — 201px of room at a 375px viewport against a 243px action row, enough
// to push Discard clean out of the card's overflow-hidden wrapper. It also
// double-indented the card to 104px, since MemoryCard already carries its own
// w-8 rail to line up with the avatar (see RAIL in MemoryCard.tsx).
//
// happy-dom has no layout engine, so this asserts the STRUCTURE that owns the
// width budget — the memory slot must not be nested under the indent — rather
// than the pixel outcome. Mirrors bookmark-render.test.tsx's mocking pattern,
// the established convention for exercising ChatHero end to end in this shell.
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

const SESSION = {
  id: 'sess-indent',
  messages: [
    { id: 'm1', role: 'user', content: 'The lake house had a red door.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-15T00:00:00.000Z',
  visitor_name: null,
  title: 'Indent session',
  starred: false,
  memory_count: 0,
};

/** A DRAFT memory anchored to the assistant reply — the guide-proposed case. */
const GUIDE_DRAFT = {
  id: 'mem-guide',
  session_id: 'sess-indent',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'A red door',
  body: 'The lake house had a red door.',
  status: 'draft',
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories')) return jsonResponse({ memories: [GUIDE_DRAFT] });
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

/** Walks up from `el` looking for an ancestor carrying the ml-[60px] indent. */
function hasIndentedAncestor(el: HTMLElement | null): boolean {
  for (let node = el; node; node = node.parentElement) {
    if (node.classList?.contains('ml-[60px]')) return true;
  }
  return false;
}

describe('MessageList — guide-anchored memory slot is not nested under the MessageActions indent', () => {
  it('renders the guide-proposed draft card OUTSIDE ml-[60px], so it gets the same width budget as a visitor-proposed one', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    // The draft card is the thing that owns the clipped action row.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Discard' }).length).toBeGreaterThan(0));

    const discards = screen.getAllByRole('button', { name: 'Discard' });
    expect(discards.length).toBeGreaterThan(0);

    for (const discard of discards) {
      expect(hasIndentedAncestor(discard)).toBe(false);
    }
  });

  it('still indents the MessageActions row itself — the indent was not simply deleted', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    // Scoped to a control only the GUIDE's action row has — the visitor's own
    // bubble renders a "Keep this as a memory" bookmark too, and that one is
    // correctly un-indented, so it can't be used to identify this row.
    const rate = await screen.findAllByRole('button', { name: 'Good response' });
    expect(rate.length).toBeGreaterThan(0);

    // Every rendered copy of the guide's action row keeps its text alignment.
    for (const button of rate) {
      expect(hasIndentedAncestor(button)).toBe(true);
    }
  });
});
