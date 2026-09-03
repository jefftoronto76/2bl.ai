import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MediaPage } from './MediaPage';
import type { MediaItem } from '@/services/media/types';

// Loading-state skeleton coverage for the standalone Media page — mirrors
// MediaGallery.test.tsx's equivalent (in-chat panel), per Design Handovers/
// Aug 2026 Atomic Updates/10_media_list_skeleton/README.md.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
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
    derived_content: 'Some extracted text.',
    classification: null,
    error_message: null,
    processed_at: '2026-08-05T00:00:00.000Z',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

// Real fetches resolve too fast to observe the loading state, so this holds
// the fetch open until the test explicitly resolves it.
function deferredMediaList(items: MediaItem[]): () => void {
  let resolveFetch!: () => void;
  const promise = new Promise<Response>((resolve) => {
    resolveFetch = () => resolve(jsonResponse({ items }));
  });
  vi.stubGlobal('fetch', vi.fn(() => promise));
  return resolveFetch;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MediaPage — loading skeleton', () => {
  it('shows a 6-card shimmer skeleton while loading, then swaps to real content', async () => {
    const resolveFetch = deferredMediaList([makeItem({ status: 'ready' })]);
    render(<MediaPage open onClose={() => {}} onFlash={() => {}} />);

    const loadingRegion = screen.getByLabelText('Loading media');
    expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
    expect(loadingRegion.querySelectorAll('.animate-upload-shimmer')).toHaveLength(6 * 3);

    resolveFetch();

    await waitFor(() => expect(screen.queryByLabelText('Loading media')).toBeNull());
    expect(screen.getByText('letter.pdf')).toBeInTheDocument();
  });
});

describe('MediaPage — sort toggle', () => {
  it('defaults to Newest (no sort param); switching to Oldest resets the list and refetches with sort=oldest', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        requestedUrls.push(url);
        const items = url.includes('sort=oldest')
          ? [makeItem({ id: 'old-1', original_filename: 'oldest.pdf' })]
          : [makeItem({ id: 'new-1', original_filename: 'newest.pdf' })];
        return Promise.resolve(jsonResponse({ items }));
      }),
    );

    render(<MediaPage open onClose={() => {}} onFlash={() => {}} />);

    await waitFor(() => expect(screen.getByText('newest.pdf')).toBeInTheDocument());
    expect(requestedUrls[0]).not.toContain('sort=');

    const newestTab = screen.getByRole('tab', { name: /newest/i });
    const oldestTab = screen.getByRole('tab', { name: /oldest/i });
    expect(newestTab).toHaveAttribute('aria-selected', 'true');
    expect(oldestTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(oldestTab);

    // Reset, not appended: the newest-sorted item is gone, not just joined
    // by the oldest-sorted one — proves pagination state was cleared rather
    // than the two sorts' pages getting mixed together.
    await waitFor(() => expect(screen.getByText('oldest.pdf')).toBeInTheDocument());
    expect(screen.queryByText('newest.pdf')).toBeNull();
    expect(oldestTab).toHaveAttribute('aria-selected', 'true');
    expect(newestTab).toHaveAttribute('aria-selected', 'false');
    expect(requestedUrls.some((u) => u.includes('sort=oldest'))).toBe(true);
  });
});
