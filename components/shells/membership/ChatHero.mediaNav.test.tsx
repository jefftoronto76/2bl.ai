import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHero } from './ChatHero';
import { ChatDrawerV2 } from './v2/ChatDrawerV2';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';
import type { MediaItem } from '@/services/media/types';

// Regression coverage for the "MediaGallery exists but is unmounted from
// navigation" gap (System Docs/Known Gaps.md, Design Handovers/media-items-spec
// doc): SidebarV2 already had a "Media" nav button with an onMedia prop, but
// ChatHero never passed a handler, so the button rendered inert
// (opacity-40 pointer-events-none) and MediaGallery.tsx was unreachable.
// These tests exercise the real ChatHero + SidebarV2 + MediaGallery stack,
// mounted the same way HeirloomApp.tsx mounts it (inside ChatDrawerV2, so the
// overlay-host portal MediaGallery relies on is actually present).

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

const MEDIA_ITEM: MediaItem = {
  id: 'media-1',
  tenant_id: 't1',
  member_id: 'm1',
  chat_id: 'sess-1',
  story_id: null,
  type: 'image',
  original_filename: 'family-photo.jpg',
  storage_path: 'members/m1/family-photo.jpg',
  file_size_bytes: 245_760,
  mime_type: 'image/jpeg',
  status: 'ready',
  derived_content: null,
  classification: 'photo',
  error_message: null,
  processed_at: '2026-08-01T00:00:00.000Z',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') {
    return jsonResponse({ sessions: [] });
  }
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url === '/api/media' && method === 'GET') {
    return jsonResponse({ items: [MEDIA_ITEM] });
  }
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

// MediaGallery portals into ChatDrawerV2's overlay host (ChatOverlayProvider) —
// the same wiring VoiceImmersive relies on — so the real mount shape from
// HeirloomApp.tsx (ChatDrawerV2 wrapping ChatHero) is required for the portal
// target to exist at all.
function renderHeirloomChat() {
  return render(
    <ChatProvider>
      <ChatDrawerV2 isFullScreen={false} onToggleFullScreen={() => {}} onClose={() => {}} showHeader={false}>
        <ChatHero />
      </ChatDrawerV2>
    </ChatProvider>,
  );
}

describe('Media nav — wired into SidebarV2 (desktop)', () => {
  it('opens MediaGallery from the sidebar, loads real items, and closes via its own close button', async () => {
    renderHeirloomChat();
    await screen.findByRole('button', { name: 'Media' });

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));

    const heading = await screen.findByRole('heading', { name: 'Media' });
    expect(heading).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/media');
    await screen.findByText('family-photo.jpg');
    expect(screen.getByText('Ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Media' })).toBeNull());
  });
});

// Mobile viewport (390px) — required per CLAUDE.md's "Mobile-First,
// Responsive on First Pass" principle. The mobile SidebarV2 instance is a
// separate React tree (slide-in overlay, not the docked desktop one), so the
// wiring needs its own coverage there.
describe('Media nav at 390px (mobile overlay sidebar)', () => {
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

  it('opens MediaGallery and dismisses the sidebar overlay, same as New Chat does', async () => {
    renderHeirloomChat();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('button', { name: 'Media' });

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));

    await screen.findByRole('heading', { name: 'Media' });
    // The sidebar overlay's own "New Chat" button (unique to the sidebar tree)
    // should be gone — same dismissal behavior as selecting a conversation.
    expect(screen.queryByRole('button', { name: 'New Chat' })).toBeNull();
  });

  // Regression: the mobile "Media" button lives in the overlay sidebar, which
  // unmounts in the same state update that opens the gallery (see previous
  // test). document.activeElement reverts to <body> the instant that happens
  // — before useModalA11y's effect ever runs — so restoring focus to
  // "whatever was focused" would strand it nowhere. ChatHero passes the
  // persistent hamburger button as an explicit restoreFocusRef instead.
  it('restores focus to the hamburger button on close, not the vanished Media button', async () => {
    renderHeirloomChat();

    const hamburger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(hamburger);
    const mediaButton = await screen.findByRole('button', { name: 'Media' });

    mediaButton.focus();
    fireEvent.click(mediaButton);
    await screen.findByRole('heading', { name: 'Media' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Media' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Close media gallery' }));
    await waitFor(() => expect(document.activeElement).toBe(hamburger));
  });
});
