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

// Guards the narrow-mobile fit of the footer spine (2026-08-15). NOTE: these
// are structural assertions, not pixel ones — happy-dom has no layout engine, so
// nothing here can prove the row actually fits its 261px budget at a 375px
// viewport. That was measured in headless Chromium against real DM Sans (263.0px
// at the original padding, 243.0px tightened, 217.3px once the label became
// "Keep") and is verified on the Vercel preview; see the sizing comment in
// MemoryCard.tsx. What these DO catch is the ways a later edit silently
// reintroduces the clipping from inside this component: re-inflating the
// horizontal padding, re-lengthening the label, or dropping the overflow-x-auto
// safety net. The other half of the 2026-08-15 fix lived OUTSIDE this component
// — MessageList.tsx was rendering the guide-anchored slot inside an ml-[60px]
// wrapper — and is covered by MessageList.memorySlotIndent.test.tsx instead.
describe('MemoryCard — footer spine survives narrow mobile widths', () => {
  const spineOf = (label: string) => screen.getByRole('button', { name: label }).parentElement!;

  it('scrolls rather than clips: the spine is a horizontal scroll container', () => {
    render(<MemoryCard memory={memory()} onKeep={noop} onDiscard={noop} onRetitle={noop} />);

    const spine = spineOf('Discard');
    expect(spine.className).toContain('overflow-x-auto');
    // An edge swipe inside the row must not trigger iOS back-navigation.
    expect(spine.className).toContain('overscroll-x-contain');
  });

  it('keeps the tightened horizontal padding — the whole reason the row fits at 375px', () => {
    render(<MemoryCard memory={memory()} onKeep={noop} onDiscard={noop} onRetitle={noop} />);

    expect(screen.getByRole('button', { name: 'Keep' }).className).toContain('px-3');
    expect(screen.getByRole('button', { name: 'Rewrite' }).className).toContain('px-2.5');
    expect(screen.getByRole('button', { name: 'Discard' }).className).toContain('px-2.5');
  });

  it('holds the "one line, never wraps, never reorders" constraint and the 44px tap target', () => {
    render(<MemoryCard memory={memory()} onKeep={noop} onDiscard={noop} onRetitle={noop} />);

    const spine = spineOf('Discard');
    // The constraint the fix was explicitly not allowed to relax.
    expect(spine.className).not.toContain('flex-wrap');
    expect([...spine.children].map(el => el.textContent?.trim())).toEqual(['Keep', 'Rewrite', 'Discard']);

    for (const label of ['Keep', 'Rewrite', 'Discard']) {
      const btn = screen.getByRole('button', { name: label });
      // Buttons scroll out of view, they never compress to fit.
      expect(btn.className).toContain('whitespace-nowrap');
      expect(btn.className).toContain('shrink-0');
      // Only horizontal padding was reduced — the tap target is untouched.
      expect(btn.className).toContain('[@media(hover:none)]:min-h-[44px]');
    }
  });
});

describe('MemoryCard — Keep action unaffected by this change', () => {
  it('still calls onKeep when "Keep" is clicked, whether the real photo rendered or the placeholder did', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });
});
