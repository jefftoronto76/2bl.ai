// Coverage for the thumbnail aspect-ratio fix (UploadThumbnail.tsx +
// PendingEchoAttachment in MessageList.tsx): both used to force every image
// into a fixed 192x144 h-36/w-48 object-cover box, cropping portrait photos.
// Both now compute a bounding box (max 240x320) from the item's real
// width/height and apply it as inline style, with object-contain replacing
// object-cover. jsdom has no real CSS layout engine (getBoundingClientRect
// always returns 0), so this asserts the computed inline style values
// directly — the same signal a real layout engine would consume — rather
// than rendered pixel geometry.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ChatProvider, useChatStore, type ClientMediaItem, type PendingEcho } from './chatStore';
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

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  if (url === '/api/sessions' && method === 'GET') return jsonResponse({ sessions: [] });
  if (url.includes('/feedback')) return jsonResponse({ feedback: [] });
  if (url.includes('/memories')) return jsonResponse({ memories: [] });
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

function mkItem(overrides: {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  width?: number;
  height?: number;
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
    error_message: null,
    processed_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    url: 'https://example.test/signed/campfire.jpg',
    width: overrides.width,
    height: overrides.height,
  };
}

const CAPTIONLESS_UPLOAD_MESSAGE = {
  id: 'm1',
  role: 'user' as const,
  content: '[MEDIA_UPLOAD: campfire.jpg | media-1 | image]',
  timestamp: 1,
};

/** Same harness shape as upload-thumbnail-render.test.tsx, plus a
 *  setPendingEcho seed button so PendingEchoAttachment's own box-sizing math
 *  can be asserted directly (its real dimension source, ChatInput.tsx's
 *  Image()-decode, never resolves in jsdom — no real image decoding here —
 *  so this seeds the echo state directly, the same boundary the existing
 *  optimistic-echo.test.tsx mocks at, one level up). */
function Harness({
  messages,
  seedItems = [],
  seedEcho,
}: {
  messages: typeof CAPTIONLESS_UPLOAD_MESSAGE[];
  seedItems?: ClientMediaItem[];
  seedEcho?: PendingEcho;
}) {
  const { addMediaItem, setPendingEcho } = useChatStore();
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setOverlayHost} className="relative">
      <ChatOverlayProvider value={overlayHost}>
        {seedItems.map((item, i) => (
          <button key={i} onClick={() => addMediaItem(item)}>
            {`seed-${item.status}`}
          </button>
        ))}
        {seedEcho && (
          <button onClick={() => setPendingEcho(seedEcho)}>seed-echo</button>
        )}
        <MessageList messages={messages} isLoading={false} errorType={null} />
      </ChatOverlayProvider>
    </div>
  );
}

describe('UploadThumbnail — aspect-ratio box sizing (no cropping)', () => {
  it('a portrait image (800x1200) gets a taller-than-wide box, bounded by 240x320', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'ready', width: 800, height: 1200 })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-ready'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    // scale = min(240/800, 320/1200, 1) = 0.2667 -> 213x320
    expect(img.style.width).toBe('213px');
    expect(img.style.height).toBe('320px');
    expect(parseInt(img.style.height)).toBeGreaterThan(parseInt(img.style.width)); // taller than wide, i.e. NOT cropped to landscape
    expect(parseInt(img.style.width)).toBeLessThanOrEqual(240);
    expect(parseInt(img.style.height)).toBeLessThanOrEqual(320);
  });

  it('a landscape image (1600x900) gets a wider-than-tall box, bounded by 240x320', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'ready', width: 1600, height: 900 })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-ready'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    // scale = min(240/1600, 320/900, 1) = 0.15 -> 240x135
    expect(img.style.width).toBe('240px');
    expect(img.style.height).toBe('135px');
    expect(parseInt(img.style.width)).toBeGreaterThan(parseInt(img.style.height));
  });

  it('a square image (1000x1000) is bounded by the smaller max (240), never upscaled', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'ready', width: 1000, height: 1000 })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-ready'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    expect(img.style.width).toBe('240px');
    expect(img.style.height).toBe('240px');
  });

  it('a small image (100x150) is never upscaled past its natural size', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[CAPTIONLESS_UPLOAD_MESSAGE]}
          seedItems={[mkItem({ id: 'media-1', status: 'ready', width: 100, height: 150 })]}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-ready'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    expect(img.style.width).toBe('100px');
    expect(img.style.height).toBe('150px');
  });

  it('a ready item with unknown dimensions (historical/reloaded) gets no forced inline size — falls back to intrinsic sizing clamped by max-w-60/max-h-80, no crop', async () => {
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
    expect(img.style.width).toBe('');
    expect(img.style.height).toBe('');
    expect(img.className).toContain('object-contain');
    expect(img.className).toContain('max-w-60');
    expect(img.className).toContain('max-h-80');
    expect(img.className).not.toContain('object-cover');
  });

  it('an uploading item with unknown dimensions (rare fast-send edge case) gets the shimmer placeholder box, not a collapsed sliver', async () => {
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
    expect(img.style.width).toBe('192px');
    expect(img.style.height).toBe('144px');
  });
});

describe('PendingEchoAttachment — same box-sizing math as UploadThumbnail, applied to the pre-send echo', () => {
  it('a portrait echo attachment (800x1200) gets the same taller-than-wide box', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[]}
          seedEcho={{
            text: '',
            attachments: [
              { filename: 'campfire.jpg', previewUrl: 'blob:preview-1', type: 'image', width: 800, height: 1200 },
            ],
          }}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-echo'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    expect(img.style.width).toBe('213px');
    expect(img.style.height).toBe('320px');
  });

  it('an echo attachment with no dimensions yet (send fired before the pick-time decode resolved) gets the same shimmer placeholder box as an uploading real thumbnail', async () => {
    render(
      <ChatProvider>
        <Harness
          messages={[]}
          seedEcho={{
            text: '',
            attachments: [{ filename: 'campfire.jpg', previewUrl: 'blob:preview-1', type: 'image' }],
          }}
        />
      </ChatProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('seed-echo'));
    });

    const img = await screen.findByAltText('campfire.jpg');
    expect(img.style.width).toBe('192px');
    expect(img.style.height).toBe('144px');
  });
});
