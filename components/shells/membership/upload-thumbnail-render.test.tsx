// Rendering-layer coverage for the thumbnail+shimmer upload UI
// (UploadThumbnail.tsx + ImageLightbox.tsx), replacing the deleted
// upload-card-render.test.tsx which covered the card family this superseded.
// Mounts ChatProvider + MessageList directly (MessageList takes `messages`
// as a plain prop — no session-load/fetch machinery needed to seed message
// content), wrapped in a ChatOverlayProvider the same way ChatDrawerV2 wires
// it in the real app, so the lightbox's portal target actually exists.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore, type ClientMediaItem } from './chatStore';
import { MessageList } from './MessageList';
import { ChatOverlayProvider } from './v2/ChatOverlayHost';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({ isLoaded: true, isSignedIn: true, user: { providerUserId: 'u1', isPlatformAdmin: false } }),
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

const fetchCalls: Array<{ url: string; method: string }> = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  fetchCalls.push({ url, method });
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories')) return jsonResponse({ memories: [] });
  if (url.startsWith('/api/media/') && url.endsWith('/retry') && method === 'POST') return jsonResponse({ ok: true });
  if (url.startsWith('/api/media')) return jsonResponse({ items: [] });
  return jsonResponse({ ok: true });
});

beforeEach(() => {
  fetchCalls.length = 0;
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

function mkItem(overrides: {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error_message?: string | null;
  url?: string | null;
}): ClientMediaItem {
  return {
    id: overrides.id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: 'sess-1',
    story_id: null,
    type: 'image',
    original_filename: 'campfire.jpg',
    storage_path: '',
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: overrides.status,
    derived_content: overrides.status === 'ready' ? 'two people at a campfire' : null,
    classification: null,
    error_message: overrides.error_message ?? null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    url: overrides.url ?? 'https://example.test/signed/campfire.jpg',
  };
}

/** A plain upload marker, no caption text alongside it. */
const CAPTIONLESS_UPLOAD_MESSAGE = {
  id: 'm1',
  role: 'user' as const,
  content: '[MEDIA_UPLOAD: campfire.jpg | media-1 | image]',
  timestamp: 1,
};

/** A client-side upload failure — no media_items row ever existed, so this
 *  must never route through UploadThumbnail (see MessageList.tsx's comment
 *  on userMsg.failures). */
const CLIENT_SIDE_FAILURE_MESSAGE = {
  id: 'm2',
  role: 'user' as const,
  content: '[MEDIA_UPLOAD_FAILED: broken.jpg]',
  timestamp: 2,
};

/** Mirrors ChatDrawerV2's own body wiring — a relative host div publishing
 *  itself via ChatOverlayProvider, so ImageLightbox's portal target exists.
 *  `seedItems` renders one button per item so a test can seed an initial
 *  status, then click a second button to upsert the SAME id at a new status
 *  (mirroring addMediaItem's real upsert-by-id path — see chatStore.tsx). */
function Harness({
  messages,
  seedItems = [],
}: {
  messages: typeof CAPTIONLESS_UPLOAD_MESSAGE[];
  seedItems?: ClientMediaItem[];
}) {
  const { addMediaItem } = useChatStore();
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setOverlayHost} className="relative">
      <ChatOverlayProvider value={overlayHost}>
        {seedItems.map((item, i) => (
          <button key={i} onClick={() => addMediaItem(item)}>
            {`seed-${item.status}`}
          </button>
        ))}
        <MessageList messages={messages} isLoading={false} errorType={null} />
      </ChatOverlayProvider>
    </div>
  );
}

describe('UploadThumbnail rendering — status drives the overlay, never the element type', () => {
  it('renders the thumbnail with a shimmer overlay while status is processing, no retry badge', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'processing' })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-processing'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    expect(img).toBeInTheDocument();
    expect(img.parentElement?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('renders a static thumbnail once ready, with no shimmer overlay, and opens the lightbox on tap', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'ready' })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-ready'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    expect(img.parentElement?.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();

    expect(screen.queryByRole('dialog', { name: 'campfire.jpg' })).not.toBeInTheDocument();
    fireEvent.click(img);

    const dialog = await screen.findByRole('dialog', { name: 'campfire.jpg' });
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'campfire.jpg' })).not.toBeInTheDocument());
  });

  it('renders a retry badge with the SANITIZED error phrase, never the raw error_message, once status is failed', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'failed', error_message: 'Deepgram API error: 401 unauthorized' })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-failed'));
    });

    const retryBadge = await screen.findByRole('button', { name: /Retry —/ });
    expect(retryBadge.getAttribute('aria-label')).not.toMatch(/Deepgram/);
    expect(retryBadge.getAttribute('aria-label')).not.toMatch(/401/);
  });

  it('clicking the retry badge issues POST /api/media/{id}/retry', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'failed', error_message: 'Storage object not available after 4 attempts' })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-failed'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry —/ }));
    });

    await waitFor(() =>
      expect(fetchCalls.some(c => c.url === '/api/media/media-1/retry' && c.method === 'POST')).toBe(true),
    );
  });

  it('a client-side (pre-upload) failure still renders FailedUploadChip, never UploadThumbnail', async () => {
    render(
      <ChatProvider>
        <Harness messages={[CLIENT_SIDE_FAILURE_MESSAGE]} />
      </ChatProvider>,
    );

    expect(screen.getByText('broken.jpg — upload failed')).toBeInTheDocument();
    expect(screen.queryByAltText('broken.jpg')).not.toBeInTheDocument();
  });

  it('regression guard: the same <img> DOM node persists across a processing → ready status change (no remount)', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[
            mkItem({ id: 'media-1', status: 'processing' }),
            mkItem({ id: 'media-1', status: 'ready' }),
          ]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-processing'));
    });

    const imgDuringProcessing = await screen.findByAltText('campfire.jpg');

    // Same media item id, new status — mirrors the real Realtime/polling path
    // (addMediaItem upserts by id, see chatStore.tsx). This is the exact
    // status transition that used to swap UploadRunningCard for
    // UploadReadyCard — three different component types at the same JSX
    // position — forcing React to unmount/remount the whole subtree. This
    // test proves UploadThumbnail's structural fix: same element type, same
    // JSX position, at every status, so React only patches attributes
    // instead of tearing down and rebuilding the node.
    await act(async () => {
      fireEvent.click(screen.getByText('seed-ready'));
    });

    const imgAfterReady = await screen.findByAltText('campfire.jpg');
    expect(imgAfterReady).toBe(imgDuringProcessing);
  });
});
