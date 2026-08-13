import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MediaGallery } from './MediaGallery';
import type { MediaItem } from '@/services/media/types';

// Covers the retry-endpoint's status gate loosening from 'failed'-only to
// any settled state ('ready' or 'failed'): the gallery's action button must
// now also appear on 'ready' items, labeled distinctly from the failed-item
// case ("Reprocess" vs "Try again") since re-running analysis on an
// already-successful item is a different action from recovering a failure.

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

function mockMediaList(items: MediaItem[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ items })),
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MediaGallery — retry/reprocess button', () => {
  it('renders "Try again" for a failed item', async () => {
    mockMediaList([makeItem({ status: 'failed', derived_content: null, error_message: 'boom' })]);
    render(<MediaGallery onClose={() => {}} sessionId="chat-1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Reprocess/ })).toBeNull();
  });

  it('renders "Reprocess" for a ready item, alongside Download', async () => {
    mockMediaList([makeItem({ status: 'ready' })]);
    render(<MediaGallery onClose={() => {}} sessionId="chat-1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Reprocess/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Download/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('renders neither Try-again nor Reprocess for pending or processing items', async () => {
    mockMediaList([
      makeItem({ id: 'item-1', status: 'pending', derived_content: null }),
      makeItem({ id: 'item-2', status: 'processing', derived_content: null }),
    ]);
    render(<MediaGallery onClose={() => {}} sessionId="chat-1" />);

    await waitFor(() => expect(screen.getAllByText('Processing').length).toBe(2));
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reprocess/ })).toBeNull();
  });
});
