// Covers Bug B (per-anchor hasOpenDraft/keepDisabled scoping) and Bug C
// (classified retry) together, since Task 3's retry is only meaningful once
// Task 1's scoping fix lands: a second assistant reply's bookmark must stay
// enabled while a different anchor's draft is open, and once that reply's
// own create() call fails, its MemoryErrorLine must show real classified
// copy and its "Try again" button must re-invoke create() for that exact
// anchor — all without disturbing the other anchor's still-open draft.
// Mirrors save-memory-marker.test.tsx / bookmark-render.test.tsx's mocking
// convention (this shell's established pattern).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { ChatProvider } from '../chatStore';
import { ChatHero } from '../ChatHero';
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
  id: 'sess-scoping',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It was a quiet summer by the water.', timestamp: 2 },
    { id: 'm3', role: 'user', content: 'What about the garden?', timestamp: 3 },
    { id: 'm4', role: 'assistant', content: 'The garden bloomed every June.', timestamp: 4 },
  ],
  updated_at: '2026-08-06T00:00:00.000Z',
  visitor_name: null,
  title: 'Scoping session',
  starred: false,
  memory_count: 1,
};

const OPEN_DRAFT_ON_M2 = {
  id: 'mem-m2',
  session_id: 'sess-scoping',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the water.',
  status: 'draft',
  created_at: '2026-08-06T00:00:00.000Z',
  updated_at: '2026-08-06T00:00:00.000Z',
};

describe('bookmark — per-anchor scoping and classified retry', () => {
  let postMemoryResponses: Array<() => Response>;
  let postMemoryCalls: unknown[];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
    if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
    if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
    if (url.endsWith('/memories') && method === 'GET') return jsonResponse({ memories: [OPEN_DRAFT_ON_M2] });
    if (url.endsWith('/memories') && method === 'POST') {
      postMemoryCalls.push(JSON.parse(String(init?.body ?? '{}')));
      const next = postMemoryResponses.shift();
      return next ? next() : jsonResponse({ memory: OPEN_DRAFT_ON_M2 });
    }
    return jsonResponse({ ok: true });
  });

  beforeEach(() => {
    postMemoryCalls = [];
    postMemoryResponses = [];
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

  // m1 and m3 (user messages) show the exact same "Keep this as a memory"
  // label as any unsaved assistant message, so a plain getAllByRole would be
  // ambiguous across anchors — scope to the specific message's own render
  // group (the "group flex flex-col gap-3" wrapper makeRenderAssistantMessage
  // gives each assistant message — see MessageList.tsx) so assertions target
  // m4 alone. getAllByText also matches an sr-only live-region echo of the
  // same text (an aria announcement, not the actual message row), so matches
  // with no .group ancestor are filtered out rather than treated as an error.
  function assistantGroupsFor(text: string): HTMLElement[] {
    return screen
      .getAllByText(text)
      .map((node) => node.closest('.group') as HTMLElement | null)
      .filter((group): group is HTMLElement => group !== null);
  }

  it('keeps a different anchor\'s bookmark enabled while one anchor has an open draft, and disables that anchor\'s own bookmark', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('The garden bloomed every June.').length).toBeGreaterThan(0));

    // m2 already has an open draft — its own bookmark ("Memory kept…") must
    // stay disabled (same-anchor suppression preserved).
    const m2Groups = assistantGroupsFor('It was a quiet summer by the water.');
    expect(m2Groups.length).toBeGreaterThan(0);
    m2Groups.forEach((group) => {
      expect(within(group).getByRole('button', { name: 'Memory kept from this message' })).toBeDisabled();
    });

    // m4 has no memory of its own — pre-fix, m2's open draft would have
    // disabled this too via the whole-session hasOpenDraft boolean. Post-fix
    // it must be enabled.
    const m4Groups = assistantGroupsFor('The garden bloomed every June.');
    expect(m4Groups.length).toBeGreaterThan(0);
    m4Groups.forEach((group) => {
      expect(within(group).getByRole('button', { name: 'Keep this as a memory' })).not.toBeDisabled();
    });
  });

  it('classifies a failed create() and shows a working "Try again" that re-invokes create() for that exact anchor, without disturbing the other anchor\'s open draft', async () => {
    postMemoryResponses = [() => jsonResponse({ error: 'boom' }, 500)];

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('The garden bloomed every June.').length).toBeGreaterThan(0));

    const m4Group = assistantGroupsFor('The garden bloomed every June.')[0];
    fireEvent.click(within(m4Group).getByRole('button', { name: 'Keep this as a memory' }));

    await waitFor(() => expect(within(m4Group).getByText(/We couldn't save that just now/)).toBeTruthy());
    expect(postMemoryCalls[0]).toEqual({ anchor_message_id: 'm4', source_kind: 'conversation' });

    // m2's own open draft is untouched by m4's failure/retry cycle.
    const m2Group = assistantGroupsFor('It was a quiet summer by the water.')[0];
    expect(within(m2Group).getByRole('button', { name: 'Memory kept from this message' })).toBeDisabled();

    postMemoryResponses = [() => jsonResponse({ memory: { ...OPEN_DRAFT_ON_M2, id: 'mem-m4', anchor_message_id: 'm4', title: 'The Garden' } })];
    fireEvent.click(within(m4Group).getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(within(m4Group).getByText('The Garden')).toBeTruthy());
    expect(postMemoryCalls.length).toBe(2);
    expect(postMemoryCalls[1]).toEqual({ anchor_message_id: 'm4', source_kind: 'conversation' });
  });
});
