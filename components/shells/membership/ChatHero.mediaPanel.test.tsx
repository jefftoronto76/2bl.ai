import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for wiring MediaGallery into ChatHero (2026-08-09):
// the sidebar's previously-inert "Media" button (onMedia prop, always
// undefined before this change) now opens the gallery — in the same
// third-pane slot the memory panel uses on desktop, or a bottom sheet on
// mobile (no third-pane host exists there) — and is mutually exclusive with
// an open memory panel.

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
  id: 'sess-media',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-09T00:00:00.000Z',
  visitor_name: null,
  title: 'Media test session',
  starred: false,
  memory_count: 1,
};

const SAVED_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-media',
  anchor_message_id: 'm2',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  status: 'published',
  created_at: '2026-08-09T00:00:00.000Z',
  updated_at: '2026-08-09T00:00:00.000Z',
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

async function renderReady() {
  render(
    <ChatProvider>
      <ChatHero />
    </ChatProvider>,
  );
  await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));
}

describe('Media pane — desktop', () => {
  it('opens via the sidebar Media button and closes via its own close button', async () => {
    await renderReady();

    expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());
  });

  it('opening Media closes an open memory panel, and opening a memory closes Media', async () => {
    await renderReady();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: 'Memory title' })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
    expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull();
  });

  it('force-collapses the sidebar rail while open, and restores it on close', async () => {
    await renderReady();
    const aside = document.querySelector('aside');

    expect(aside?.className).toContain('w-64');

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    expect(aside?.className).toContain('w-12');

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(aside?.className).toContain('w-64'));
  });
});

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.kebabDelete.test.tsx and
// ChatHero.memoryPanel.test.tsx already use to reach the mobile branch.
describe('Media pane — mobile (390px) bottom sheet', () => {
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

  it('tapping Media closes the drawer and opens the bottom sheet; closing the sheet reverses it', async () => {
    // Can't reuse renderReady() here — at mobile widths the memory receipt
    // has no button role (Stage A is desktop-only), same as
    // ChatHero.memoryPanel.test.tsx's own mobile-width test confirms.
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));

    // At 390px the sidebar starts closed (mobile overlay, not docked) — open
    // it via the header's hamburger, same as a real phone tap.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: 'New Chat' }); // drawer overlay mounted

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument());
    // The drawer overlay itself unmounts once Media takes over the screen.
    expect(screen.queryByRole('button', { name: 'New Chat' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());
  });
});
