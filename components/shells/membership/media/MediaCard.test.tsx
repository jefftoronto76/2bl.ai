import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MediaCard } from './MediaCard';
import type { MediaItemWithUrl } from '@/services/media/display-url';

// Stage 2 (media_stages_08_2026/stage-2-card-anatomy-icons): the thumbnail
// area — real photo when a display url resolves, a per-type tinted tile
// with a centered icon badge otherwise, status badge always in the
// thumbnail regardless of which. Card body/footer (filename, classification,
// extracted content, retry/download) are pre-existing and covered by
// MediaGallery.test.tsx — not re-tested here.
//
// Stage 3 (media_stages_08_2026/stage-3-icon-actions-workflows): the three
// new footer actions (add to memory / edit stub / delete) and the
// lazy-load/metadata/rename patch (Aug 2026 Atomic Updates/
// 09_media_metadata_lazyload) — covered below.

// Required on every MediaCard render since Stage 3 added these three footer
// actions; individual tests override whichever handler they're asserting on.
const noopHandlers = {
  onAddToMemory: () => {},
  onEditStub: () => {},
  onDeleteRequest: () => {},
  onRename: () => {},
};

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
        {...noopHandlers}
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
    render(<MediaCard item={makeItem({ type: 'image', url: null, status: 'processing' })} onRetry={() => {}} {...noopHandlers} />);

    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to a tinted tile for document and audio items — no thumbnail fetch attempted', () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    render(<MediaCard item={makeItem({ type: 'document' })} onRetry={() => {}} {...noopHandlers} />);
    expect(screen.queryByRole('img')).toBeNull();
    // No mediaItemId passed to useFreshImageUrl for a non-image type, so no
    // /url fetch fires at all.
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    render(<MediaCard item={makeItem({ type: 'audio', id: 'item-2' })} onRetry={() => {}} {...noopHandlers} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the status badge regardless of thumbnail vs. fallback tile', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'https://signed.example/fresh.jpg' })));

    const { rerender } = render(
      <MediaCard item={makeItem({ type: 'document', status: 'failed' })} onRetry={() => {}} {...noopHandlers} />,
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();

    rerender(
      <MediaCard
        item={makeItem({ type: 'image', status: 'ready', url: 'https://signed.example/seed.jpg' })}
        onRetry={() => {}}
        {...noopHandlers}
      />,
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});

describe('MediaCard — footer actions (Stage 3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
  });

  it('calls onAddToMemory with the item when the + button is clicked', () => {
    const onAddToMemory = vi.fn();
    const item = makeItem();
    render(<MediaCard item={item} onRetry={() => {}} {...noopHandlers} onAddToMemory={onAddToMemory} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to memory' }));
    expect(onAddToMemory).toHaveBeenCalledWith(item);
  });

  it('calls onEditStub (not a real edit surface) when the pen button is clicked', () => {
    const onEditStub = vi.fn();
    render(<MediaCard item={makeItem()} onRetry={() => {}} {...noopHandlers} onEditStub={onEditStub} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditStub).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteRequest with the item when the trash button is clicked — no direct removal', () => {
    const onDeleteRequest = vi.fn();
    const item = makeItem();
    render(<MediaCard item={item} onRetry={() => {}} {...noopHandlers} onDeleteRequest={onDeleteRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteRequest).toHaveBeenCalledWith(item);
  });

  it('keeps the existing Download/Reprocess actions alongside the new ones', () => {
    render(<MediaCard item={makeItem({ status: 'ready' })} onRetry={() => {}} {...noopHandlers} />);

    expect(screen.getByRole('button', { name: /Download/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reprocess/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to memory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});

describe('MediaCard — lazyload, metadata line, and rename (Aug 2026 Atomic Updates/09_media_metadata_lazyload)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'https://signed.example/fresh.jpg' })));
  });

  it('marks the real thumbnail img loading="lazy"', async () => {
    render(
      <MediaCard
        item={makeItem({ type: 'image', url: 'https://signed.example/seed.jpg' })}
        onRetry={() => {}}
        {...noopHandlers}
      />,
    );
    expect(screen.getByRole('img', { name: 'letter.pdf' })).toHaveAttribute('loading', 'lazy');
  });

  it('metadata line states upload date always, "Processing" appended instead of size while processing', () => {
    const { rerender } = render(
      <MediaCard item={makeItem({ status: 'ready', file_size_bytes: 2048 })} onRetry={() => {}} {...noopHandlers} />,
    );
    expect(screen.getByText(/2 KB · Uploaded/)).toBeInTheDocument();
    // Status badge (separate, in the thumbnail) is untouched by this line.
    expect(screen.getByText('Ready')).toBeInTheDocument();

    rerender(
      <MediaCard item={makeItem({ status: 'processing', file_size_bytes: 2048 })} onRetry={() => {}} {...noopHandlers} />,
    );
    expect(screen.getByText(/Uploaded .* · Processing/)).toBeInTheDocument();
    expect(screen.queryByText(/2 KB/)).toBeNull();
  });

  it('renames the file locally on Enter, without any network call', async () => {
    const onRename = vi.fn();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    render(<MediaCard item={makeItem()} onRetry={() => {}} {...noopHandlers} onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename file' }));
    const input = screen.getByDisplayValue('letter.pdf');
    fireEvent.change(input, { target: { value: 'vacation.pdf' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('item-1', 'vacation.pdf'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Escape cancels the rename without committing, reverting to the original name', () => {
    const onRename = vi.fn();
    render(<MediaCard item={makeItem()} onRetry={() => {}} {...noopHandlers} onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename file' }));
    const input = screen.getByDisplayValue('letter.pdf');
    fireEvent.change(input, { target: { value: 'oops.pdf' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename file' })).toHaveTextContent('letter.pdf');
  });

  it('does not commit an empty or unchanged name', () => {
    const onRename = vi.fn();
    render(<MediaCard item={makeItem()} onRetry={() => {}} {...noopHandlers} onRename={onRename} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename file' }));
    const input = screen.getByDisplayValue('letter.pdf');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });
});
