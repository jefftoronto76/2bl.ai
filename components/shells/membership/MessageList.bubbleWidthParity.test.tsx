// Regression guard for the 2026-08-16 bubble-width mismatch fix.
//
// AssistantMarkdownBubble was max-w-[75%] while the member (visitor)
// MessageBubble was max-w-[90%], so the guide visibly replied in a narrower
// column than the member typed in. Both percentages resolve against the SAME
// max-w-2xl (672px) container the transcript and the composer share, so this
// was purely the two bubble types disagreeing with each other — see the width
// contract documented on AssistantMarkdownBubble in MessageList.tsx.
//
// happy-dom has no layout engine, so this asserts the two things that actually
// own the outcome — each bubble's own percentage class, and the fact that both
// resolve against one and the same container node — rather than pixel widths.
// Mirrors MessageList.memorySlotIndent.test.tsx's mocking pattern, the
// established convention for exercising ChatHero end to end in this shell.
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

const MEMBER_TEXT = 'The lake house had a red door.';
const GUIDE_TEXT = 'It sounds like a beautiful memory.';

const SESSION = {
  id: 'sess-width',
  messages: [
    { id: 'm1', role: 'user', content: MEMBER_TEXT, timestamp: 1 },
    { id: 'm2', role: 'assistant', content: GUIDE_TEXT, timestamp: 2 },
  ],
  updated_at: '2026-08-16T00:00:00.000Z',
  visitor_name: null,
  title: 'Width session',
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

/** Walks up from `el` to the element that actually carries the width class. */
function bubbleFor(text: string): HTMLElement {
  const [node] = screen.getAllByText(text);
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if ([...el.classList].some((c) => c.startsWith('max-w-['))) return el;
  }
  throw new Error(`no max-w-[…] ancestor found for "${text}"`);
}

/** The shared max-w-2xl column both bubble types and the composer resolve against. */
function sharedColumnFor(el: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.classList?.contains('max-w-2xl')) return node;
  }
  throw new Error('no max-w-2xl ancestor found');
}

describe('MessageList — assistant and member bubbles share one width budget', () => {
  it('gives both bubble types the same max-w-[90%] percentage', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(GUIDE_TEXT).length).toBeGreaterThan(0));

    const member = bubbleFor(MEMBER_TEXT);
    const guide = bubbleFor(GUIDE_TEXT);

    // The regression itself: guide was max-w-[75%] against the member's 90%.
    expect(member.classList.contains('max-w-[90%]')).toBe(true);
    expect(guide.classList.contains('max-w-[90%]')).toBe(true);
  });

  it('resolves both percentages against the same max-w-2xl container node', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(GUIDE_TEXT).length).toBeGreaterThan(0));

    // Identity, not just presence — if the two bubbles ever resolved against
    // different containers, matching percentages would still render unequal
    // widths and this fix would be silently undone.
    expect(sharedColumnFor(bubbleFor(GUIDE_TEXT))).toBe(sharedColumnFor(bubbleFor(MEMBER_TEXT)));
  });

  it('keeps the member bubble shrink-to-fit and the guide bubble not', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(GUIDE_TEXT).length).toBeGreaterThan(0));

    // w-fit on the member bubble is load-bearing (see its own comment); the
    // guide bubble is already shrink-to-fit as a row-flex item, so it must not
    // acquire width:fit-content — that would make flex-basis definite for wide
    // markdown block content.
    expect(bubbleFor(MEMBER_TEXT).classList.contains('w-fit')).toBe(true);
    expect(bubbleFor(GUIDE_TEXT).classList.contains('w-fit')).toBe(false);
  });
});
