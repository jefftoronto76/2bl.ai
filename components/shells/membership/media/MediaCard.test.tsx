import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MediaCard } from './MediaCard';
import type { MediaItemWithUrl } from '@/services/media/display-url';

// Stage 2 (media_stages_08_2026/stage-2-card-anatomy-icons): the thumbnail
// area — real photo when a display url resolves, a per-type tinted tile
// with a centered icon badge otherwise, status badge always in the
// thumbnail regardless of which. Card body/footer (filename, classification,
// extracted content, retry/download) are pre-existing and covered by
// MediaGallery.test.tsx — not re-tested here.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeItem(overrides: Partial<MediaItemWithUrl> = {}): MediaItemWithUrl {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'document',
    original_filename: 'letter.pdf',
    storage_path: 'tenant-1/media/member-1/item-1/letter.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    status: 'ready',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: '2026-08-05T00:00:00.000Z',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    url: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MediaCard — thumbnail area', () => {
  it('renders the real photo for an image item with a display url, and re-resolves a fresh one', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ url: 'https://signed.example/fresh.jpg' }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MediaCard
        item={makeItem({ type: 'image', url: 'https://signed.example/seed.jpg' })}
        onRetry={() => {}}
      />,
    );

    // Seed url (the batched GET /api/media value) shows immediately, no flicker.
    expect(screen.getByRole('img', { name: 'letter.pdf' })).toHaveAttribute(
      'src',
      'https://signed.example/seed.jpg',
    );

    // useFreshImageUrl re-resolves via GET /api/media/[id]/url on mount —
    // same 60s-expiry staleness fix already used for chat/memory images.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'letter.pdf' })).toHaveAttribute(
        'src',
        'https://signed.example/fresh.jpg',
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/media/item-1/url');
  });

  it('falls back to a tinted tile with a centered icon badge for an image item with no url yet', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<MediaCard item={makeItem({ type: 'image', url: null, status: 'processing' })} onRetry={() => {}} />);

    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to a tinted tile for document and audio items — no thumbnail fetch attempted', () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    render(<MediaCard item={makeItem({ type: 'document' })} onRetry={() => {}} />);
    expect(screen.queryByRole('img')).toBeNull();
    // No mediaItemId passed to useFreshImageUrl for a non-image type, so no
    // /url fetch fires at all.
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    render(<MediaCard item={makeItem({ type: 'audio', id: 'item-2' })} onRetry={() => {}} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the status badge regardless of thumbnail vs. fallback tile', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'https://signed.example/fresh.jpg' })));

    const { rerender } = render(
      <MediaCard item={makeItem({ type: 'document', status: 'failed' })} onRetry={() => {}} />,
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();

    rerender(
      <MediaCard
        item={makeItem({ type: 'image', status: 'ready', url: 'https://signed.example/seed.jpg' })}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
