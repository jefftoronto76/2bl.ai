import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Regression test for the kebab-delete-not-gated-by-row-type bug found in the
// CLAUDE.md docs audit (commit 72e0618): the delete confirmation dialog was
// already target-aware, but onConfirm always called deleteSession(id) —
// including for story rows. This test exercises both paths through the real
// ChatHero + SidebarV2 + ConfirmDeleteModal stack (not just the isolated
// handler) so a regression here is caught by component behavior, not just a
// unit assertion on a callback.
//
// Updated 2026-08-10 (real story creation/persistence, artifacts.type='story'):
// stories are no longer ephemeral local state — creation and delete both hit
// real endpoints (POST /api/stories, DELETE /api/stories/[id]) now. The gating
// this test guards is still correct (a story delete must never hit
// DELETE /api/sessions/[id], the conversation path) — only the "story has no
// backend" premise the old assertions encoded is gone.

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

const CONVERSATION = {
  id: 'sess-1',
  messages: [
    { id: 'm1', role: 'user', content: 'hello there', timestamp: 1 },
    { id: 'm2', role: 'assistant', content: 'hi, how can I help', timestamp: 2 },
  ],
  updated_at: '2026-07-30T00:00:00.000Z',
  visitor_name: null,
  title: 'A real conversation',
  starred: false,
};

// Every request the fetch mock actually saw, for assertions on what did (or
// deliberately did not) hit the network.
let requestLog: { url: string; method: string }[] = [];
let storyIdCounter = 0;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  requestLog.push({ url, method });
  if (url === '/api/sessions' && method === 'GET') {
    return jsonResponse({ sessions: [CONVERSATION] });
  }
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  if (url.startsWith('/api/sessions/') && method === 'DELETE') {
    return jsonResponse({ ok: true });
  }
  if (url.startsWith('/api/sessions/') && method === 'PATCH') {
    return jsonResponse({ ok: true });
  }
  if (url === '/api/stories' && method === 'GET') {
    return jsonResponse({ stories: [] });
  }
  if (url === '/api/stories' && method === 'POST') {
    const parsedBody = init?.body ? JSON.parse(init.body as string) : {};
    storyIdCounter += 1;
    return jsonResponse({
      story: { id: `story-${storyIdCounter}`, name: parsedBody.name, description: parsedBody.description || undefined },
    });
  }
  if (url.startsWith('/api/stories/') && method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  fetchMock.mockClear();
  requestLog = [];
  storyIdCounter = 0;
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

// The sidebar's "Create" story button is only ever exercised in tests via
// fireEvent, which — unlike a real pointer — does not respect the button's
// (separately noted, pre-existing) `pointer-events-none` styling. That's a
// distinct, out-of-scope observation about story creation being currently
// unreachable via a real click; it doesn't affect this test's validity as a
// check on the delete-gating logic itself once a story row exists.
//
// Creation is now a real POST /api/stories round trip (fire-and-forget from
// ChatHero's handleCreateStory), so the modal closing no longer means the
// row exists yet — wait for the name to actually render before returning.
async function createStory(name: string) {
  fireEvent.click(screen.getByText('Create'));
  const dialog = await screen.findByRole('dialog', { name: 'Begin a new story' });
  fireEvent.change(within(dialog).getByLabelText('Story name'), { target: { value: name } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Create story/i }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Begin a new story' })).toBeNull());
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
}

// "A real conversation" (or any active session's title) renders twice once
// it's the active session — once as the sidebar row, once as the ChatHeader
// "Switch conversation" label — so scope to the sidebar row specifically
// (the one wrapped in the row's `.group` container) rather than assuming a
// single match.
function sidebarRowFor(rowName: string): HTMLElement {
  const candidates = screen.getAllByText(rowName);
  const row = candidates.map(el => el.closest('div.group')).find((el): el is HTMLElement => el !== null);
  if (!row) throw new Error(`No sidebar row container found for "${rowName}"`);
  return row;
}

function openKebabFor(rowName: string, kebabLabel: 'Conversation options' | 'Story options') {
  const row = sidebarRowFor(rowName);
  fireEvent.click(within(row).getByRole('button', { name: kebabLabel }));
}

describe('Kebab delete — gated correctly by row type (regression, commit 72e0618)', () => {
  it('deleting a story row calls DELETE /api/stories/[id] (not /api/sessions) and removes it from the sidebar', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('A real conversation').length).toBeGreaterThan(0));

    await createStory('My Test Story');
    expect(screen.getByText('My Test Story')).toBeInTheDocument();

    requestLog = []; // isolate: only count requests from here on

    openKebabFor('My Test Story', 'Story options');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Delete story' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^Delete$/ }));

    // Removed from the sidebar (optimistic — useStories.discard removes
    // immediately, before the DELETE call settles).
    await waitFor(() => expect(screen.queryByText('My Test Story')).toBeNull());
    expect(screen.getByText('Deleted')).toBeInTheDocument();

    // The regression this guards against: a story delete must hit the real
    // story endpoint, never the conversation one (the old bug called
    // deleteSession(id) — DELETE /api/sessions/{storyId} — for every row
    // type regardless of target).
    const deleteCalls = requestLog.filter(r => r.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].url).toBe('/api/stories/story-1');
  });

  it('deleting a conversation row still soft-deletes it server-side as before', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('A real conversation').length).toBeGreaterThan(0));
    requestLog = [];

    openKebabFor('A real conversation', 'Conversation options');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Delete chat' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(screen.queryByText('A real conversation')).toBeNull());
    expect(screen.getByText('Deleted')).toBeInTheDocument();

    // Unchanged behavior: the real conversation delete path still hits the
    // real API — this must NOT regress to the story's local-only path.
    const deleteCalls = requestLog.filter(r => r.method === 'DELETE' && r.url === `/api/sessions/${CONVERSATION.id}`);
    expect(deleteCalls).toHaveLength(1);
  });

  it('star and rename remain correct no-ops on story rows (unchanged by this fix)', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('A real conversation').length).toBeGreaterThan(0));

    await createStory('Untouched Story');
    requestLog = [];

    openKebabFor('Untouched Story', 'Story options');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Star' }));
    // No-op: story still present, no request fired, no rename input appeared.
    expect(screen.getByText('Untouched Story')).toBeInTheDocument();
    expect(requestLog).toHaveLength(0);

    openKebabFor('Untouched Story', 'Story options');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(screen.getByText('Untouched Story')).toBeInTheDocument();
    expect(requestLog).toHaveLength(0);
  });
});

// Mobile viewport (390px) — required per CLAUDE.md's "Mobile-First,
// Responsive on First Pass" principle. ChatHero renders a *different* React
// tree at mobile widths (the docked SidebarV2 vs. the slide-in overlay
// SidebarV2, gated by `isMobile` + `state.isSidebarExpanded`), so the fix
// needs its own coverage there — the desktop tests above don't exercise this
// tree at all. happy-dom's real `matchMedia` evaluates `(max-width: 768px)`
// against `window.innerWidth`, so setting that to 390 before render is
// enough to route ChatHero into the mobile branch, same as a real phone.
describe('Kebab delete at 390px (mobile overlay sidebar)', () => {
  beforeEach(() => {
    // happy-dom's own viewport API — plain `window.innerWidth` assignment
    // doesn't make matchMedia's live query listeners re-evaluate; this does.
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 390,
    });
  });

  afterEach(() => {
    (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
      width: 1024,
    });
  });

  it('deleting a story row from the mobile overlay sidebar calls DELETE /api/stories/[id]', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('A real conversation').length).toBeGreaterThan(0));

    // At 390px the sidebar starts closed (mobile overlay, not docked) — open
    // it via the header's hamburger, same as a real phone tap.
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByText('Create'); // sidebar overlay mounted

    await createStory('Mobile Story');
    expect(screen.getByText('Mobile Story')).toBeInTheDocument();
    requestLog = [];

    openKebabFor('Mobile Story', 'Story options');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Delete story' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(screen.queryByText('Mobile Story')).toBeNull());
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    const deleteCalls = requestLog.filter(r => r.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].url).toBe('/api/stories/story-1');
  });

  it('deleting a conversation row from the mobile overlay sidebar still hits the real API', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getAllByText('A real conversation').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByText('Create');
    requestLog = [];

    openKebabFor('A real conversation', 'Conversation options');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirmDialog = await screen.findByRole('alertdialog', { name: 'Delete chat' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(screen.queryByText('A real conversation')).toBeNull());
    expect(
      requestLog.filter(r => r.method === 'DELETE' && r.url === `/api/sessions/${CONVERSATION.id}`),
    ).toHaveLength(1);
  });
});
