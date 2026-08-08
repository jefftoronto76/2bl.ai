import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for memory-panel-layout Stage A: clicking a saved
// memory receipt in the real ChatHero + MessageList + MemoryCard stack opens
// the panel with that memory's content; the close button reverses it. Also
// guards the Stage A `!isMobile` scoping — the panel must not be reachable
// at mobile widths yet (that's Stage F's job).

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
  updated_at: '2026-08-08T00:00:00.000Z',
  visitor_name: null,
  title: 'Panel test session',
  starred: false,
  memory_count: 1,
};

const SAVED_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-panel',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [SAVED_MEMORY] });
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

describe('Memory panel — Stage A (desktop)', () => {
  it('opens the panel with the clicked memory\'s content, and the close button reverses it', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    // Panel not open yet — its body text (distinct from the receipt's own
    // title-only content) must not be on screen.
    expect(screen.queryByText('It was a quiet summer by the lake.')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);

    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'The Lake House' })).toBeInTheDocument());
    expect(screen.getByText('It was a quiet summer by the lake.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));

    await waitFor(() => expect(screen.queryByText('It was a quiet summer by the lake.')).toBeNull());
  });
});

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.kebabDelete.test.tsx already
// uses to reach the mobile branch.
describe('Memory panel — Stage A is desktop-only (390px)', () => {
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

  it('the saved receipt has no button role at mobile widths — nothing to click yet', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /The Lake House/i })).toBeNull();
  });
});
