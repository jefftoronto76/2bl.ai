import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for MemorySavedReceipt's own "+" -> StoryPicker ->
// assign flow (memory-receipt-story-picker, 2026-08-14) — the in-transcript
// receipt (MessageList.tsx -> MemoryCard.tsx), wired to the exact same
// StoryPicker + handleAssignMemoryToStory ChatHero.assignMemoryToStory.test.tsx
// already covers for MemoryCardView's panel header "+". This file is scoped
// to what's specific to the receipt as a SEPARATE surface: its "+" reuses
// ChatHero's own `memories`/`stories` (no scoped instance needed, since the
// receipt only ever renders memories belonging to THIS open session's own
// transcript), and it must never open the memory panel as a side effect of
// picking a story. The assign write itself, the Added/Moved toast copy, and
// the no-op re-pick guard are shared logic already exercised there — not
// re-verified end to end here.

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
  updated_at: '2026-08-13T00:00:00.000Z',
  visitor_name: null,
  title: 'Panel test session',
  starred: false,
  memory_count: 1,
};

const STORIES = [
  { id: 'story-1', name: 'Summer at the Lake' },
  { id: 'story-2', name: 'The Family Farm' },
];

function memoryFixture(storyId: string | null = null) {
  return {
    id: 'mem-1',
    session_id: 'sess-panel',
    anchor_message_id: 'm2',
    source_kind: 'conversation',
    title: 'The Lake House',
    body: 'It was a quiet summer by the lake.',
    status: 'published',
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
    storyId,
  };
}

function makeFetchMock(memory: ReturnType<typeof memoryFixture>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
    if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: STORIES });
    if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
    if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [memory] });
    if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
    return jsonResponse({ ok: true });
  });
}

// The transcript's own scroll region (MessageList.tsx's role="log" —
// "Conversation") scopes every query below to the receipt's own StoryPicker,
// never the (mutually exclusive, closed-by-default) panel's own copy of the
// same component.
// Exact-string name matches only below, never a `/regex/` — the receipt's
// own row is itself role="button" with no aria-label, so its OWN computed
// accessible name flattens in every descendant's text once the popover is
// open (including the popover's own list items). A `/Summer at the Lake/`
// substring match would then match BOTH the row and the real per-story
// button; an exact string only ever matches the real button's own
// (shorter, exact) accessible name.
async function openReceiptPicker() {
  await waitFor(() => expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument());
  const transcript = within(screen.getByRole('log', { name: 'Conversation' }));
  await waitFor(() => expect(transcript.getByTestId('story-picker-trigger')).toBeInTheDocument());
  // Targeted by StoryPicker's own stable testid, not title/label text — the
  // trigger's accessible name changes with assignment state (Plus "Add to a
  // story" vs. checkmark 'In "X" — click to change or remove',
  // remove-memory-from-story, 2026-08-14), which a title query would break
  // on for one of this file's two fixtures (memoryFixture('story-1')).
  fireEvent.click(transcript.getByTestId('story-picker-trigger'));
  // "The Family Farm" is never the memory's current story in either
  // fixture below (only story-1/"Summer at the Lake" or none ever is), and
  // never appears in the trigger's own label or the "Remove from" item
  // either, so its "Add to ..." label is a safe open-signal regardless of
  // which test called this helper.
  await waitFor(() => expect(transcript.getByRole('button', { name: 'Add to The Family Farm' })).toBeInTheDocument());
  return transcript;
}

let fetchMock: ReturnType<typeof makeFetchMock>;

beforeEach(() => {
  __clearSingletonRegistry();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChatHero — assign memory to story from the in-transcript receipt', () => {
  it('picking a story sends the real PATCH and never opens the memory panel', async () => {
    fetchMock = makeFetchMock(memoryFixture(null));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    const transcript = await openReceiptPicker();

    fireEvent.click(transcript.getByRole('button', { name: 'Add to Summer at the Lake' }));

    await waitFor(() => expect(screen.getByText('Added to Summer at the Lake')).toBeInTheDocument());

    const assignCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/memories/mem-1') && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(assignCall).toBeTruthy();
    expect(JSON.parse(String(assignCall?.[1]?.body))).toEqual({ action: 'assign_story', story_id: 'story-1' });

    // Picking a story is not "open this memory" — the panel never mounts.
    expect(screen.queryByRole('textbox', { name: 'Memory title' })).toBeNull();
  });

  it('the current story is highlighted, and re-picking it never sends a PATCH', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    const transcript = await openReceiptPicker();

    const patchCallsBefore = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length;
    const currentStoryBtn = transcript.getByRole('button', { name: 'Summer at the Lake (current story)' });
    expect(currentStoryBtn.querySelector('svg')).not.toBeNull();
    fireEvent.click(currentStoryBtn);

    await new Promise((r) => setTimeout(r, 0));
    const patchCallsAfter = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length;
    expect(patchCallsAfter).toBe(patchCallsBefore);
    expect(screen.queryByText('Moved to Summer at the Lake')).toBeNull();
  });

  it('a click elsewhere on the receipt row still opens the memory panel — the "+" is additive, not a replacement for it', async () => {
    fetchMock = makeFetchMock(memoryFixture(null));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
  });
});
