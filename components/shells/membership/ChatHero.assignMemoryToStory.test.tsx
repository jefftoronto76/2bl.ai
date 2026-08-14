import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for MemoryCardView's "+" -> StoryPicker -> assign
// flow through the real ChatHero + useMemories stack (assign-memory-to-
// story, 2026-08-13). Mirrors ChatHero.memoryPanel.test.tsx's setup.
// Focused on what's specific to ChatHero's own orchestration —
// handleAssignMemoryToStory's toast copy (Added vs Moved) and the real
// PATCH body sent — not StoryPicker's own mechanics (covered in
// StoryPicker.test.tsx) or assignMemoryToStory's own DB logic (covered in
// services/crm/story-containments.test.ts).

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

// MessageList's own in-transcript MemorySavedReceipt (MemoryCard.tsx) now
// has its OWN real StoryPicker too (2026-08-14) — the exact same component,
// same stable testid, as MemoryCardView.tsx's panel header trigger. With
// both mounted side by side (the third pane never unmounts the transcript
// behind it), a bare getByRole/getByTitle/getByTestId would find two
// matches. Scoped to the third pane's own data-testid to disambiguate —
// MemorySavedReceipt's identical-looking trigger is covered separately by
// ChatHero.receiptAssignStory.test.tsx (and ChatHero.receiptRemoveFromStory.test.tsx).
// Targeted by StoryPicker's own stable testid, not title/label text, even
// within that scope — the trigger's accessible name changes with assignment
// state (Plus "Add to a story" vs. checkmark 'In "X" — click to change or
// remove', remove-memory-from-story, 2026-08-14), which a title/label query
// would break on for one state or the other.
async function openPanelAndPicker() {
  await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
  const panel = within(screen.getByTestId('third-pane-panel'));
  fireEvent.click(panel.getByTestId('story-picker-trigger'));
  // "The Family Farm" never appears in the trigger's own label or the new
  // "Remove from '[Story]'" item (only the CURRENT story's name would), so
  // this stays unambiguous whether the memory starts unassigned or already
  // in "Summer at the Lake" — unlike matching on "Summer at the Lake"
  // itself, which both the checkmark trigger's label and the remove item's
  // text now also contain once a memory is already in that story.
  await waitFor(() => expect(panel.getByRole('button', { name: /The Family Farm/ })).toBeInTheDocument());
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

describe('ChatHero — assign memory to story', () => {
  it('first assignment (no prior story): picking a story sends the PATCH and toasts "Added to X"', async () => {
    fetchMock = makeFetchMock(memoryFixture(null));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await openPanelAndPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Summer at the Lake' }));

    await waitFor(() => expect(screen.getByText('Added to Summer at the Lake')).toBeInTheDocument());

    const assignCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/memories/mem-1') && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(assignCall).toBeTruthy();
    expect(JSON.parse(String(assignCall?.[1]?.body))).toEqual({ action: 'assign_story', story_id: 'story-1' });
  });

  it('reassignment (memory already in a different story): picking a new story toasts "Moved to X", not "Added"', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await openPanelAndPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add to The Family Farm' }));

    await waitFor(() => expect(screen.getByText('Moved to The Family Farm')).toBeInTheDocument());
    expect(screen.queryByText('Added to The Family Farm')).toBeNull();
  });

  it('re-picking the story the memory is already in never sends a PATCH and never toasts', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await openPanelAndPicker();

    const patchCallsBefore = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length;
    fireEvent.click(screen.getByRole('button', { name: 'Summer at the Lake (current story)' }));

    // No new PATCH, no toast — give any accidental async work a tick to land, then assert nothing happened.
    await new Promise((r) => setTimeout(r, 0));
    const patchCallsAfter = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length;
    expect(patchCallsAfter).toBe(patchCallsBefore);
    expect(screen.queryByText('Added to Summer at the Lake')).toBeNull();
    expect(screen.queryByText('Moved to Summer at the Lake')).toBeNull();
  });

  it('the picker lists stories the member is subscribed to but does not own, alongside owned ones', async () => {
    const subscribedStory = { id: 'story-3', name: "Grandma's Kitchen", isOwner: false };
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
      if (url === '/api/stories' && method === 'GET') return jsonResponse({ stories: [...STORIES, subscribedStory] });
      if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
      if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [memoryFixture(null)] });
      if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await openPanelAndPicker();

    expect(screen.getByRole('button', { name: "Add to Grandma's Kitchen" })).toBeInTheDocument();
  });
});
