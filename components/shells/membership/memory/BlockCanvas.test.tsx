// Unit coverage for BlockCanvas — the block-canvas body (Memory Canvas V1).
// Fully controlled/presentational: every assertion here is about what gets
// reported to the callbacks, not persistence (that's MemoryCardView.tsx's
// job, covered in its own test file). Isolated render, no ChatProvider —
// same convention as MemoryCardView.test.tsx.
//
// Insert control and save behavior both changed per the Text+Image Scope
// Handover (Design Handovers/handover_memory edit panel_08_2026/): a
// BlockInserter "+" sits before the first block and after every block (N
// blocks -> N+1 slots), replacing the old bottom-only "Add text"/"Add
// photo" buttons; text content commits on every keystroke (onContentChange
// only — there is no onContentCommit/blur step anymore).
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

describe('BlockCanvas — insert control (BlockInserter, before-first + after-every-block)', () => {
  it('renders exactly one more inserter slot than there are blocks — top, between, and bottom for a 2-block memory', () => {
    renderCanvas([
      { id: 'b1', type: 'text', content: 'One' },
      { id: 'b2', type: 'image', media_item_id: 'media-1' },
    ]);
    expect(screen.getAllByRole('button', { name: 'Add a block' })).toHaveLength(3);
  });

  it('a single-block memory still gets both a top and a bottom inserter', () => {
    renderCanvas([{ id: 'b1', type: 'text', content: 'Only one.' }]);
    expect(screen.getAllByRole('button', { name: 'Add a block' })).toHaveLength(2);
  });

  it('clicking "+" reveals exactly 2 options — text and image, not the reference\'s 6-type picker', () => {
    renderCanvas([{ id: 'b1', type: 'text', content: 'One' }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a block' })[0]);
    expect(screen.getByRole('button', { name: 'Add text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gallery|video|quote|divider/i })).toBeNull();
  });

  it('picking "text" from the TOP inserter fires onAddText(-1) — insert before the first block', () => {
    const { onAddText } = renderCanvas([{ id: 'b1', type: 'text', content: 'One' }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a block' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(onAddText).toHaveBeenCalledWith(-1);
  });

  it('picking "text" from the inserter AFTER a block fires onAddText with that block\'s index', () => {
    const { onAddText } = renderCanvas([
      { id: 'b1', type: 'text', content: 'One' },
      { id: 'b2', type: 'text', content: 'Two' },
    ]);
    // Slots: [0]=top, [1]=after block 0, [2]=after block 1 (bottom).
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a block' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(onAddText).toHaveBeenCalledWith(0);
  });

  it('picking "image" expands into the session\'s own photo picker rather than inserting directly; picking a photo fires onAddImage with the position and media id', () => {
    const { onAddImage } = renderCanvas([{ id: 'b1', type: 'text', content: 'One' }], {
      sessionImages: [{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }],
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a block' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    expect(onAddImage).not.toHaveBeenCalled(); // choosing "image" alone doesn't insert anything yet
    const thumb = screen.getByRole('button', { name: 'Add photo: a.jpg' });
    fireEvent.click(thumb);
    expect(onAddImage).toHaveBeenCalledWith(-1, 'media-1');
    expect(screen.queryByRole('button', { name: 'Add photo: a.jpg' })).toBeNull(); // closed after picking
  });

  it('shows an empty-state message rather than an empty grid when there are no session images', () => {
    renderCanvas([{ id: 'b1', type: 'text', content: 'One' }], { sessionImages: [] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add a block' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    expect(screen.getByText('No photos in this conversation yet.')).toBeInTheDocument();
  });

  it('clicking "+" again closes it', () => {
    renderCanvas([{ id: 'b1', type: 'text', content: 'One' }]);
    const inserter = screen.getAllByRole('button', { name: 'Add a block' })[0];
    fireEvent.click(inserter);
    expect(screen.getByRole('button', { name: 'Add text' })).toBeInTheDocument();
    fireEvent.click(inserter);
    expect(screen.queryByRole('button', { name: 'Add text' })).toBeNull();
  });
});

describe('BlockCanvas — locked V1 scope guards', () => {
  it('never renders a drag handle', () => {
    const { container } = renderCanvas([
      { id: 'b1', type: 'text', content: 'One' },
      { id: 'b2', type: 'text', content: 'Two' },
    ]);
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });
});
