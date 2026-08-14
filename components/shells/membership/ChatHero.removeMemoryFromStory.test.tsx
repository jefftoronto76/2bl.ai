import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for MemoryCardView's checkmark trigger -> StoryPicker
// -> "Remove from '[Story]'" flow through the real ChatHero + useMemories
// stack (remove-memory-from-story, 2026-08-14). Mirrors
// ChatHero.assignMemoryToStory.test.tsx's setup — focused on ChatHero's own
// orchestration (handleRemoveMemoryFromStory's toast copy and the real PATCH
// body sent), not StoryPicker's own mechanics (StoryPicker.test.tsx) or
// removeMemoryFromStory's own DB logic (services/crm/story-containments.test.ts).

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
  updated_at: '2026-08-14T00:00:00.000Z',
  visitor_name: null,
  title: 'Panel test session',
  starred: false,
  memory_count: 1,
};

const STORIES = [{ id: 'story-1', name: 'Summer at the Lake' }];

function memoryFixture(storyId: string | null) {
  return {
    id: 'mem-1',
    session_id: 'sess-panel',
    anchor_message_id: 'm2',
    source_kind: 'conversation',
    title: 'The Lake House',
    body: 'It was a quiet summer by the lake.',
    status: 'published',
    created_at: '2026-08-14T00:00:00.000Z',
    updated_at: '2026-08-14T00:00:00.000Z',
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

async function openPanelAndPicker() {
  await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
  // Scoped to the third pane, and targeted by StoryPicker's own stable
  // testid rather than title/label text — MemorySavedReceipt's own
  // in-transcript StoryPicker (memory-receipt-story-picker, PR #391) is the
  // SAME shared `memories` state, so it renders side by side with the exact
  // same testid/label once a story is assigned; both must resolve to a
  // single match. See ChatHero.assignMemoryToStory.test.tsx's own
  // openPanelAndPicker for the identical reasoning.
  const panel = within(screen.getByTestId('third-pane-panel'));
  fireEvent.click(panel.getByTestId('story-picker-trigger'));
  await waitFor(() => expect(panel.getByRole('button', { name: 'Remove from "Summer at the Lake"' })).toBeInTheDocument());
  return panel;
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

describe('ChatHero — remove memory from story', () => {
  it('clicking "Remove from" sends the remove_story PATCH and toasts "Removed from X"', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    const panel = await openPanelAndPicker();

    fireEvent.click(panel.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    // The toast lives outside the third pane — a single global instance.
    await waitFor(() => expect(screen.getByText('Removed from Summer at the Lake')).toBeInTheDocument());

    const removeCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/memories/mem-1') && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(removeCall).toBeTruthy();
    expect(JSON.parse(String(removeCall?.[1]?.body))).toEqual({ action: 'remove_story' });
  });

  it('after removal, the trigger reverts to the accent Plus circle', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    const panel = await openPanelAndPicker();

    fireEvent.click(panel.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    // Scoped to the panel — MemorySavedReceipt's own trigger in the
    // transcript reverts to the identical "Add to a story" label at the
    // same time (same shared `memories` state), so an unscoped query here
    // would find two matches.
    await waitFor(() => expect(panel.getByRole('button', { name: 'Add to a story' })).toBeInTheDocument());
  });
});
