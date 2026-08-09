// Integration coverage for the photo-bookmark feature (2026-08-08),
// end to end through the mounted Heirloom chat tree — mirrors
// bookmark-scoping-and-retry.test.tsx's mocking convention. Proves the two
// concrete scenarios this task exists for:
//   1. A photo message with NO caption text can now be bookmarked at all —
//      before this feature, the whole-message bookmark only ever rendered
//      when userMsg.text was non-empty (see MessageList.tsx's
//      `{userMsg.text && ...}` gate), so a caption-less photo upload had no
//      bookmark control anywhere.
//   2. Two photos attached to the SAME chat message resolve to two
//      independent memories — the actual bug this task exists to fix (the
//      old anchor_message_id-alone key would have collided).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { ChatProvider } from '../chatStore';
import { ChatHero } from '../ChatHero';
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
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// No caption text alongside the two uploads — the exact case that couldn't
// be bookmarked before this feature.
const SESSION = {
  id: 'sess-photo',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: '[MEDIA_UPLOAD: a.jpg | media-a | image] [MEDIA_UPLOAD: b.jpg | media-b | image]',
      timestamp: 1,
    },
  ],
  updated_at: '2026-08-08T00:00:00.000Z',
  visitor_name: null,
  title: 'Photo session',
  starred: false,
  memory_count: 0,
};

function readyMediaItem(id: string, filename: string) {
  return {
    id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-photo',
    story_id: null,
    type: 'image',
    original_filename: filename,
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: 'ready',
    derived_content: `A caption for ${filename}`,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    url: `https://example.test/${filename}`,
  };
}

describe('Photo bookmark — two photos on one message resolve independently', () => {
  let postMemoryCalls: Array<Record<string, unknown>>;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [SESSION] });
    if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
    if (url.startsWith('/api/media')) {
      return jsonResponse({ items: [readyMediaItem('media-a', 'a.jpg'), readyMediaItem('media-b', 'b.jpg')] });
    }
    if (url.endsWith('/memories') && method === 'GET') return jsonResponse({ memories: [] });
    if (url.endsWith('/memories') && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      postMemoryCalls.push(body);
      return jsonResponse({
        memory: {
          id: `mem-${body.media_item_id}`,
          session_id: 'sess-photo',
          anchor_message_id: body.anchor_message_id,
          media_item_id: body.media_item_id,
          source_kind: 'photo',
          title: `A caption for ${body.media_item_id}`,
          body: `A caption for ${body.media_item_id}`,
          status: 'draft',
          created_at: '2026-08-08T00:00:00.000Z',
          updated_at: '2026-08-08T00:00:00.000Z',
        },
      });
    }
    if (url.includes('/memories/') && method === 'PATCH') return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  });

  beforeEach(() => {
    postMemoryCalls = [];
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

  /** Scopes assertions to one photo's own thumbnail + action row + memory slot — the `group` div MessageList.tsx wraps around each image upload. */
  function photoGroup(filename: string): HTMLElement {
    const imgs = screen.getAllByAltText(filename);
    const group = imgs[0].closest('.group');
    if (!group) throw new Error(`no .group ancestor found for ${filename}`);
    return group as HTMLElement;
  }

  it('bookmarks a caption-less photo message, and two photos on the same message resolve to two independent draft cards — not a collision', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByAltText('a.jpg').length).toBeGreaterThan(0));

    // No caption text on this message at all — confirm the OLD whole-message
    // bookmark control (gated on caption text) never renders here.
    expect(screen.queryByRole('button', { name: 'Keep this as a memory' })).not.toBeInTheDocument();

    const groupA = photoGroup('a.jpg');
    const groupB = photoGroup('b.jpg');

    fireEvent.click(within(groupA).getByRole('button', { name: 'Bookmark as a memory' }));
    await waitFor(() => expect(within(groupA).getByRole('button', { name: 'Keep this' })).toBeInTheDocument());

    expect(postMemoryCalls).toEqual([{ anchor_message_id: 'm1', source_kind: 'photo', media_item_id: 'media-a' }]);
    // Photo B is completely untouched by photo A's bookmark.
    expect(within(groupB).getByRole('button', { name: 'Bookmark as a memory' })).toBeInTheDocument();
    expect(within(groupB).queryByRole('button', { name: 'Keep this' })).not.toBeInTheDocument();

    fireEvent.click(within(groupB).getByRole('button', { name: 'Bookmark as a memory' }));
    await waitFor(() => expect(within(groupB).getByRole('button', { name: 'Keep this' })).toBeInTheDocument());

    expect(postMemoryCalls).toEqual([
      { anchor_message_id: 'm1', source_kind: 'photo', media_item_id: 'media-a' },
      { anchor_message_id: 'm1', source_kind: 'photo', media_item_id: 'media-b' },
    ]);
    // Photo A's draft card is still there — B's bookmark didn't collide with
    // or replace it (the actual bug this task exists to fix).
    expect(within(groupA).getByRole('button', { name: 'Keep this' })).toBeInTheDocument();

    // "Keep" photo A — its own saved receipt appears with a working "+",
    // and photo B (still a draft) is unaffected.
    fireEvent.click(within(groupA).getByRole('button', { name: 'Keep this' }));
    await waitFor(() => expect(within(groupA).getByRole('button', { name: 'Add to a story' })).toBeInTheDocument());
    expect(within(groupB).getByRole('button', { name: 'Keep this' })).toBeInTheDocument();

    fireEvent.click(within(groupA).getByRole('button', { name: 'Add to a story' }));
    await waitFor(() => expect(screen.getByText('Coming soon')).toBeInTheDocument());
  });

  it('"+" (add to a memory) on the photo action row is a stub — fires the toast and does not call create()', async () => {
    render(
      <ChatProvider>
        <ChatHero />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getAllByAltText('a.jpg').length).toBeGreaterThan(0));

    const groupA = photoGroup('a.jpg');
    fireEvent.click(within(groupA).getByRole('button', { name: 'Add to a memory' }));

    await waitFor(() => expect(screen.getByText('Coming soon')).toBeInTheDocument());
    expect(postMemoryCalls).toEqual([]);
  });
});
