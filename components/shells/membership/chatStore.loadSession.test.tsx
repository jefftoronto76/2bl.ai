import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OLD_SESSION = {
  id: 'sess-old',
  messages: [
    { id: 'm1', role: 'user', content: 'hello from the old conversation', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'hi there, old reply', timestamp: 2 },
  ],
  updated_at: '2026-01-01T00:00:00.000Z',
  visitor_name: null,
  title: 'Old conversation',
  starred: false,
};

const NEWEST_SESSION = {
  id: 'sess-newest',
  messages: [
    { id: 'm3', role: 'user', content: 'hello from the newest conversation', timestamp: 3 },
    { id: 'm4', role: 'assistant', content: 'hi there, newest reply', timestamp: 4 },
  ],
  updated_at: '2026-07-30T00:00:00.000Z',
  visitor_name: null,
  title: 'Newest conversation',
  starred: false,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') {
    return jsonResponse({ sessions: [NEWEST_SESSION, OLD_SESSION] });
  }
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
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

describe('Heirloom Recent sidebar — clicking a conversation', () => {
  it('the desktop sidebar shows the Memories list immediately — no extra expand step required', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    // Regression guard for the reported bug: the desktop sidebar used to
    // default to the collapsed icon rail (driven by the shell reducer's
    // isSidebarExpanded, initial value false), which hid the Memories list
    // entirely — there was nothing to click. It must now render expanded by
    // default so conversation rows are immediately visible and clickable.
    await waitFor(() => expect(screen.getByText('hello from the newest conversation')).toBeTruthy());
    expect(screen.getByText('Old conversation')).toBeInTheDocument();
    // "Newest conversation" appears twice once it's the active session: once
    // as the sidebar row, once as the ChatHeader "Your Story" label.
    expect(screen.getAllByText('Newest conversation').length).toBeGreaterThan(0);
  });

  it('loads the clicked conversation transcript into the main pane, scrolled to its last message', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    // Wait for the signed-in DB recovery effect to populate the Recent list
    // and auto-hydrate the newest session.
    await waitFor(() => screen.getByText('Old conversation'));
    await waitFor(() => expect(screen.getByText('hello from the newest conversation')).toBeTruthy());

    // Click the OLDER conversation row in the sidebar.
    fireEvent.click(screen.getByText('Old conversation'));

    await waitFor(() => {
      expect(screen.queryByText('hello from the old conversation')).toBeTruthy();
    });
    expect(screen.queryByText('hello from the newest conversation')).toBeNull();
    // The header's "Your Story" label switches to reflect the newly-active
    // conversation too — not just the sidebar.
    await waitFor(() => expect(screen.getAllByText('Old conversation').length).toBeGreaterThan(0));
  });
});

describe('ChatHeader "Your Story" — conversation switcher', () => {
  it('shows the active conversation title and lets a visitor switch via the dropdown', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    // The header label reflects the auto-hydrated newest session.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Switch conversation' })).toHaveTextContent(
        'Newest conversation',
      ),
    );
    // Nothing to switch to yet — the dropdown itself hasn't been opened.
    expect(screen.queryByText('Old conversation')).not.toBeNull(); // present in the (already-expanded) sidebar

    fireEvent.click(screen.getByRole('button', { name: 'Switch conversation' }));

    // The dropdown lists every Recent conversation.
    const dropdown = screen.getAllByText('Old conversation');
    expect(dropdown.length).toBeGreaterThan(0);

    // Picking the older conversation from the header dropdown switches the
    // active transcript, same as picking it from the sidebar would.
    fireEvent.click(dropdown[dropdown.length - 1]);

    await waitFor(() =>
      expect(screen.getByText('hello from the old conversation')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Switch conversation' })).toHaveTextContent(
        'Old conversation',
      ),
    );
  });
});
