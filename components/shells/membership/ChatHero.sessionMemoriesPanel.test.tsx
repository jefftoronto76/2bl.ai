import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for the session memories panel (session_memories_panel
// handover, 2026-08-14 — see Design Handovers/ Aug 2026 Atomic Updates/
// 11_session_memory_icon_gap/README.md): a new ChatHeader icon opens a
// third-pane list of every memory (draft + published) kept during the
// active session; tapping one opens it into the existing single-memory
// MemoryCardView editor. Same integration-test shape as
// ChatHero.mediaPanel.test.tsx (mutual exclusion, forceCollapsed, mobile
// bottom sheet) — this is the same third-pane mechanism, one more pane.

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
  id: 'sess-session-memories',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-14T00:00:00.000Z',
  visitor_name: null,
  title: 'Session memories test session',
  starred: false,
  memory_count: 1,
};

const PUBLISHED_MEMORY = {
  id: 'mem-published',
  session_id: 'sess-session-memories',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-14T00:00:00.000Z',
  updated_at: '2026-08-14T00:00:00.000Z',
};

const DRAFT_MEMORY = {
  id: 'mem-draft',
  session_id: 'sess-session-memories',
  anchor_message_id: 'm1',
  source_kind: 'conversation',
  title: 'Still Gathering This One',
  body: 'Not finished yet.',
  status: 'draft',
  created_at: '2026-08-14T00:05:00.000Z',
  updated_at: '2026-08-14T00:05:00.000Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories') && method === 'GET') return jsonResponse({ memories: [PUBLISHED_MEMORY, DRAFT_MEMORY] });
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

async function renderReady() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
}

describe('Session memories panel — desktop', () => {
  it('opens via the chat-header icon, lists every memory (draft + published), and the close button reverses it', async () => {
    await renderReady();

    expect(screen.queryByRole('heading', { name: 'Memories from this chat' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument());

    const panel = within(screen.getByTestId('third-pane-panel'));
    expect(panel.getByText('2 memories this session')).toBeInTheDocument();
    expect(panel.getByText('The Lake House')).toBeInTheDocument();
    expect(panel.getByText('Still Gathering This One')).toBeInTheDocument();
    // Exactly one row is labeled Draft — the published row isn't.
    expect(panel.getAllByText('Draft')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close session memories panel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Memories from this chat' })).toBeNull());
  });

  it('tapping a listed memory opens it into MemoryCardView and closes the panel', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument());

    const row = within(screen.getByTestId('third-pane-panel')).getByRole('button', { name: /The Lake House/i });
    fireEvent.click(row);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
    expect(screen.queryByRole('heading', { name: 'Memories from this chat' })).toBeNull();
  });

  it('opening Media closes the session memories panel, and opening the session memories panel closes Media', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Media from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Memories from this chat' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull();
  });

  it('opening a transcript memory receipt closes the session memories panel', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
    expect(screen.queryByRole('heading', { name: 'Memories from this chat' })).toBeNull();
  });

  it('force-collapses the sidebar rail while open, and restores it on close', async () => {
    await renderReady();
    const aside = document.querySelector('aside');

    expect(aside?.className).toContain('w-64');

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument());
    expect(aside?.className).toContain('w-12');

    fireEvent.click(screen.getByRole('button', { name: 'Close session memories panel' }));
    await waitFor(() => expect(aside?.className).toContain('w-64'));
  });
});

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.mediaPanel.test.tsx already
// uses to reach the mobile branch.
describe('Session memories panel — mobile (390px)', () => {
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

  it('opens as a bottom sheet, and tapping a row transitions to the mobile full-screen memory overlay', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Memories from this chat' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Memories from this chat' })).toBeInTheDocument();

    const row = within(screen.getByRole('dialog', { name: 'Memories from this chat' })).getByRole('button', {
      name: /The Lake House/i,
    });
    fireEvent.click(row);

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Memory' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Memories from this chat' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House');
  });

  it('closes via its own close button', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Memories from this chat' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Memories from this chat' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close session memories panel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Memories from this chat' })).toBeNull());
  });
});
