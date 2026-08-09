// Unit coverage for MemoryCard (`draft` state) — the sessionImages
// real-photo lookup pattern already applied to BlockCanvas.tsx's
// ImageBlockRow and the memory panel (MemoryCardView.tsx), now applied
// here too (2026-08-08): a DRAFT photo memory already has a real
// media_item_id at create time (createPhotoMemoryFromMedia sets it before
// Keep, not after), so this card can show the real photo instead of
// always falling back to the dashed placeholder, same as the saved
// receipt/panel states.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { MemoryCard } from './MemoryCard';
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories';

afterEach(cleanup);

function memory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: 'mem-1',
    session_id: 'sess-1',
    anchor_message_id: 'm1',
    source_kind: 'photo',
    title: 'A quiet afternoon',
    body: 'A quiet afternoon by the lake.',
    status: 'draft',
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

describe('MemoryCard — draft photo memory shows the real photo when sessionImages resolves it', () => {
  it('renders the real photo instead of the dashed placeholder when media_item_id resolves in sessionImages', () => {
    render(
      <MemoryCard
        memory={memory({ media_item_id: 'media-1' })}
        onKeep={noop}
        onDiscard={noop}
        onRetitle={noop}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    expect(screen.getByAltText('a.jpg')).toBeInTheDocument();
    expect(screen.queryByText('Photo')).toBeNull();
  });

  it('falls back to the dashed placeholder when media_item_id is set but does not resolve (stale/removed)', () => {
    render(
      <MemoryCard
        memory={memory({ media_item_id: 'media-missing' })}
        onKeep={noop}
        onDiscard={noop}
        onRetitle={noop}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the dashed placeholder when there is no media_item_id at all — unaffected, same as before this fix', () => {
    render(
      <MemoryCard
        memory={memory({ media_item_id: null })}
        onKeep={noop}
        onDiscard={noop}
        onRetitle={noop}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('defaults sessionImages to [] when the prop is omitted entirely — non-breaking for existing callers', () => {
    render(<MemoryCard memory={memory({ media_item_id: 'media-1' })} onKeep={noop} onDiscard={noop} onRetitle={noop} />);

    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a non-photo (conversation) draft memory shows no media block at all, real photo or placeholder — completely unaffected', () => {
    render(
      <MemoryCard
        memory={memory({ source_kind: 'conversation', media_item_id: null })}
        onKeep={noop}
        onDiscard={noop}
        onRetitle={noop}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    expect(screen.queryByText('Photo')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('MemoryCard — Keep action unaffected by this change', () => {
  it('still calls onKeep when "Keep this" is clicked, whether the real photo rendered or the placeholder did', () => {
    const onKeep = vi.fn();
    render(
      <MemoryCard
        memory={memory({ media_item_id: 'media-1' })}
        onKeep={onKeep}
        onDiscard={noop}
        onRetitle={noop}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep this' }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });
});
