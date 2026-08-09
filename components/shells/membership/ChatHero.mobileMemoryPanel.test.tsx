import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Integration coverage for Stage F (2026-08-09): tapping a saved memory on
// mobile now opens the memory panel as a full-screen overlay — previously
// the receipt had no button role at all at mobile widths (see the removed
// "Stage A is desktop-only" describe block this replaces, formerly in
// ChatHero.memoryPanel.test.tsx). Distinct from Media's own mobile bottom
// sheet (ChatHero.mediaPanel.test.tsx): no rounding, no partial height, no
// scrim — see ChatHero.tsx's own comment on why a scrim is skipped here.

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
  id: 'sess-mobile-panel',
  messages: [
    { id: 'm1', role: 'user', content: 'Tell me about the lake house.', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'It sounds like a beautiful memory.', timestamp: 2 },
  ],
  updated_at: '2026-08-09T00:00:00.000Z',
  visitor_name: null,
  title: 'Mobile panel test session',
  starred: false,
  memory_count: 1,
};

const SAVED_MEMORY = {
  id: 'mem-1',
  session_id: 'sess-mobile-panel',
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

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.kebabDelete.test.tsx and
// ChatHero.mediaPanel.test.tsx already use to reach the mobile branch.
describe('Memory panel — Stage F (390px full-screen overlay)', () => {
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

  async function renderReady() {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('The Lake House').length).toBeGreaterThan(0));
  }

  it('the saved receipt now has a button role, and tapping it opens the full-screen panel', async () => {
    await renderReady();

    expect(screen.getByRole('button', { name: /The Lake House/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Memory' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /The Lake House/i }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));
    expect(screen.getByRole('dialog', { name: 'Memory' })).toBeInTheDocument();
  });

  it('closing via the panel\'s own close button reverses it', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: /The Lake House/i }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));

    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Memory' })).toBeNull());
  });

  it('opening Media closes the mobile memory panel, and opening a memory closes Media', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: /The Lake House/i }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Memory' })).toBeInTheDocument());

    // Media's own mobile entry point is the sidebar's Media button, reached
    // through the hamburger — same path ChatHero.mediaPanel.test.tsx uses.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: 'Media' });
    fireEvent.click(screen.getByRole('button', { name: 'Media' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Media' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Memory' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /The Lake House/i }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Memory' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Media' })).toBeNull();
  });
});

describe('Memory panel — Stage F overlay does not leak into desktop', () => {
  it('the full-screen mobile wrapper never renders at desktop widths', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: /The Lake House/i }).length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole('button', { name: /The Lake House/i })[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House'));

    // The desktop panel opened (Stage A-E's own third-pane wrapper), not the
    // mobile full-screen dialog — the two are mutually exclusive by isMobile.
    expect(screen.queryByRole('dialog', { name: 'Memory' })).toBeNull();
  });
});
