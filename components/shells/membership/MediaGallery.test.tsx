// Coverage for MediaGallery's own /api/media loading states — added when
// wiring it into navigation made a previously-unreachable component
// reachable for the first time. A rejected fetch or non-OK response used to
// be indistinguishable from "you have no media" (items stayed [], the empty
// state rendered regardless), which fails CLAUDE.md's error-handling
// principle now that a real user can actually hit it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MediaGallery } from './MediaGallery';
import type { MediaItem } from '@/services/media/types';

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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MediaGallery — /api/media loading states', () => {
  it('renders the real empty state when the request succeeds with zero items', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })));
    render(<MediaGallery onClose={() => {}} />);

    await screen.findByText(/No media yet/);
    expect(screen.queryByText(/Couldn't load your media/)).toBeNull();
  });

  it('renders a distinct failure state (not "No media yet") on a rejected fetch, with a working retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ items: [MEDIA_ITEM] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MediaGallery onClose={() => {}} />);

    await screen.findByText(/Couldn't load your media/);
    expect(screen.queryByText(/No media yet/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    await screen.findByText('family-photo.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders the failure state (not an empty gallery) on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401)));
    render(<MediaGallery onClose={() => {}} />);

    await screen.findByText(/Couldn't load your media/);
    expect(screen.queryByText(/No media yet/)).toBeNull();
  });

  it('loads real items and clears the failure state once a retry succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse({ items: [MEDIA_ITEM] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MediaGallery onClose={() => {}} />);
    await screen.findByText(/Couldn't load your media/);

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    await waitFor(() => expect(screen.queryByText(/Couldn't load your media/)).toBeNull());
    expect(screen.getByText('family-photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
