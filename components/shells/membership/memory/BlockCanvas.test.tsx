// Unit coverage for BlockCanvas — the block-canvas body (Memory Canvas V1).
// Fully controlled/presentational: every assertion here is about what gets
// reported to the callbacks, not persistence (that's MemoryCardView.tsx's
// job, covered in its own test file). Isolated render, no ChatProvider —
// same convention as MemoryCardView.test.tsx.
//
// Save behavior changed per the Text+Image Scope Handover (Design Handovers/
// handover_memory edit panel_08_2026/): text content commits on every
// keystroke now (onContentChange only) — there is no more onContentCommit/
// blur step, a deliberate reversal of this feature's first same-day attempt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { BlockCanvas, type SessionImage } from './BlockCanvas';
import type { MemoryBlock } from '@/services/chat/ui/v1/useMemories';

afterEach(cleanup);

function renderCanvas(blocks: MemoryBlock[], overrides: Partial<{ sessionImages: SessionImage[]; canRemove: (id: string) => boolean }> = {}) {
  const onContentChange = vi.fn();
  const onAddText = vi.fn();
  const onAddImage = vi.fn();
  const onRemove = vi.fn();
  const canRemove = overrides.canRemove ?? (() => true);
  const utils = render(
    <BlockCanvas
      blocks={blocks}
      sessionImages={overrides.sessionImages ?? []}
      onContentChange={onContentChange}
      onAddText={onAddText}
      onAddImage={onAddImage}
      onRemove={onRemove}
      canRemove={canRemove}
    />,
  );
  return { onContentChange, onAddText, onAddImage, onRemove, ...utils };
}

describe('BlockCanvas — text blocks', () => {
  it('renders a text block as a labeled textarea with its content', () => {
    renderCanvas([{ id: 'b1', type: 'text', content: 'First paragraph.' }]);
    expect(screen.getByRole('textbox', { name: 'Text block 1' })).toHaveValue('First paragraph.');
  });

  it('typing fires onContentChange with the block id and new content, on every keystroke (no blur/commit step)', () => {
    const { onContentChange } = renderCanvas([{ id: 'b1', type: 'text', content: 'Old' }]);
    const textbox = screen.getByRole('textbox', { name: 'Text block 1' });
    fireEvent.change(textbox, { target: { value: 'N' } });
    fireEvent.change(textbox, { target: { value: 'Ne' } });
    fireEvent.change(textbox, { target: { value: 'New' } });
    expect(onContentChange).toHaveBeenCalledTimes(3);
    expect(onContentChange).toHaveBeenNthCalledWith(1, 'b1', 'N');
    expect(onContentChange).toHaveBeenNthCalledWith(3, 'b1', 'New');
    // Blurring fires nothing at all — there is no separate commit step to trigger.
    fireEvent.blur(textbox);
    expect(onContentChange).toHaveBeenCalledTimes(3);
  });

  it('labels multiple text blocks by their position among text blocks only, skipping image blocks', () => {
    renderCanvas([
      { id: 'b1', type: 'text', content: 'One' },
      { id: 'b2', type: 'image', media_item_id: 'media-1' },
      { id: 'b3', type: 'text', content: 'Two' },
    ]);
    expect(screen.getByRole('textbox', { name: 'Text block 1' })).toHaveValue('One');
    expect(screen.getByRole('textbox', { name: 'Text block 2' })).toHaveValue('Two');
  });
});

describe('BlockCanvas — image blocks', () => {
  it('renders the matching session image', () => {
    renderCanvas([{ id: 'b1', type: 'image', media_item_id: 'media-1' }], {
      sessionImages: [{ id: 'media-1', url: 'https://example.test/signed.jpg', filename: 'lake.jpg' }],
    });
    const img = screen.getByAltText('lake.jpg');
    expect(img).toHaveAttribute('src', 'https://example.test/signed.jpg');
  });

  it('degrades gracefully to a placeholder when the media_item_id has no matching session image', () => {
    renderCanvas([{ id: 'b1', type: 'image', media_item_id: 'gone' }], { sessionImages: [] });
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('BlockCanvas — remove', () => {
  it('fires onRemove with the block id when removable', () => {
    const { onRemove } = renderCanvas([{ id: 'b1', type: 'text', content: 'One' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove text block' }));
    expect(onRemove).toHaveBeenCalledWith('b1');
  });

  it('disables removal (and does not fire onRemove) when canRemove returns false for that block', () => {
    const { onRemove } = renderCanvas([{ id: 'b1', type: 'text', content: 'Only passage' }], { canRemove: () => false });
    const button = screen.getByRole('button', { name: 'Remove text block' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('image blocks get their own distinct remove label', () => {
    renderCanvas([{ id: 'b1', type: 'image', media_item_id: 'media-1' }]);
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
  });
});

describe('BlockCanvas — add controls', () => {
  it('"Add text" fires onAddText', () => {
    const { onAddText } = renderCanvas([{ id: 'b1', type: 'text', content: 'One' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(onAddText).toHaveBeenCalledTimes(1);
  });

  it('"Add photo" opens a picker of the session\'s own images; picking one fires onAddImage and closes the picker', () => {
    const { onAddImage } = renderCanvas([{ id: 'b1', type: 'text', content: 'One' }], {
      sessionImages: [{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add photo' }));
    const thumb = screen.getByRole('button', { name: 'Add photo: a.jpg' });
    fireEvent.click(thumb);
    expect(onAddImage).toHaveBeenCalledWith('media-1');
    expect(screen.queryByRole('button', { name: 'Add photo: a.jpg' })).toBeNull();
  });

  it('shows an empty-state message rather than an empty grid when there are no session images', () => {
    renderCanvas([{ id: 'b1', type: 'text', content: 'One' }], { sessionImages: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Add photo' }));
    expect(screen.getByText('No photos in this conversation yet.')).toBeInTheDocument();
  });
});

describe('BlockCanvas — locked V1 scope guards', () => {
  it('never renders a drag handle or a between-block insert control', () => {
    const { container } = renderCanvas([
      { id: 'b1', type: 'text', content: 'One' },
      { id: 'b2', type: 'text', content: 'Two' },
    ]);
    expect(container.querySelector('[draggable="true"]')).toBeNull();
    // Only the two "Add text"/"Add photo" buttons at the end — no per-gap inserter.
    expect(screen.getAllByRole('button', { name: /^Add /i })).toHaveLength(2);
  });
});
