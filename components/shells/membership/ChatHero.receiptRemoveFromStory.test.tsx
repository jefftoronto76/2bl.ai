import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for MemorySavedReceipt's own StoryPicker -> "Remove
// from '[Story]'" flow (remove-memory-from-story, threaded to the receipt as
// a fourth real caller found while rebasing this pass onto
// memory-receipt-story-picker/PR #391). Mirrors
// ChatHero.receiptAssignStory.test.tsx's setup exactly — scoped to what's
// specific to the receipt as a separate surface from MemoryCardView's own
// panel header (covered in ChatHero.removeMemoryFromStory.test.tsx): the
// receipt reuses ChatHero's own shared handleRemoveMemoryFromStory (no
// second scoped handler), and removing must never open the memory panel as
// a side effect.

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

// Scoped to the transcript's own scroll region, same as
// ChatHero.receiptAssignStory.test.tsx's openReceiptPicker — the panel's own
// (closed-by-default) copy of StoryPicker never mounts here since this
// suite never clicks a receipt row to open it.
async function openReceiptPicker() {
  await waitFor(() => expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument());
  const transcript = within(screen.getByRole('log', { name: 'Conversation' }));
  await waitFor(() => expect(transcript.getByTestId('story-picker-trigger')).toBeInTheDocument());
  fireEvent.click(transcript.getByTestId('story-picker-trigger'));
  await waitFor(() => expect(transcript.getByRole('button', { name: 'Remove from "Summer at the Lake"' })).toBeInTheDocument());
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

describe('ChatHero — remove memory from story from the in-transcript receipt', () => {
  it('clicking "Remove from" sends the real remove_story PATCH, toasts, and never opens the memory panel', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    const transcript = await openReceiptPicker();

    fireEvent.click(transcript.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    await waitFor(() => expect(screen.getByText('Removed from Summer at the Lake')).toBeInTheDocument());

    const removeCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/memories/mem-1') && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(removeCall).toBeTruthy();
    expect(JSON.parse(String(removeCall?.[1]?.body))).toEqual({ action: 'remove_story' });

    // Removing is not "open this memory" — the panel never mounts.
    expect(screen.queryByRole('textbox', { name: 'Memory title' })).toBeNull();
  });

  it('after removal, the receipt\'s trigger reverts to the accent Plus circle', async () => {
    fetchMock = makeFetchMock(memoryFixture('story-1'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    const transcript = await openReceiptPicker();

    fireEvent.click(transcript.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    await waitFor(() => expect(transcript.getByRole('button', { name: 'Add to a story' })).toBeInTheDocument());
  });
});
