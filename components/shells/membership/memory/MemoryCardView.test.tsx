// Unit coverage for MemoryCardView (memory-panel-layout CardView chrome
// pass, 2026-08-08; block canvas / Memory Canvas V1 pass; Text+Image Scope
// Handover pass) — isolated from ChatHero/MessageList, same convention as
// MemoryPanelDivider.test.tsx. Integration with the real panel stack
// (opening from a MemorySavedReceipt click) is covered separately in
// ChatHero.memoryPanel.test.tsx. BlockCanvas.tsx's own rendering/
// interaction details (the inserter popover, per-block callbacks) are
// covered in its own test file — this file's block-canvas tests are about
// MemoryCardView's OWN logic: deriving default blocks on open, and what
// exactly gets sent to onReviseBlocks for each kind of edit.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryCardView } from './MemoryCardView';
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories';
import type { SessionImage } from './BlockCanvas';

afterEach(cleanup);

function mkMemory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: 'mem-1',
    session_id: 'sess-1',
    anchor_message_id: 'm1',
    source_kind: 'conversation',
    title: 'The Lake House',
    body: 'It was a quiet summer by the lake.',
    body_blocks: null,
    status: 'published',
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function renderCard(overrides: Partial<MemoryRow> = {}, sessionImages: SessionImage[] = []) {
  const memory = mkMemory(overrides);
  const onClose = vi.fn();
  const onRetitle = vi.fn();
  const onRemove = vi.fn();
  const onStub = vi.fn();
  const onReviseBlocks = vi.fn();
  const utils = render(
    <MemoryCardView
      memory={memory}
      onClose={onClose}
      onRetitle={onRetitle}
      onRemove={onRemove}
      onStub={onStub}
      onReviseBlocks={onReviseBlocks}
      sessionImages={sessionImages}
    />,
  );
  return { memory, onClose, onRetitle, onRemove, onStub, onReviseBlocks, ...utils };
}

/** Clicks the inserter at `slotIndex` among all "Add a block" slots, then "Add text"/"Add image" within its popover. */
function openInserter(slotIndex: number) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add a block' })[slotIndex]);
}

describe('MemoryCardView — header', () => {
  it('shows the title in an editable input, and the passage as an editable text block right away', () => {
    renderCard();
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House');
    expect(screen.getByRole('textbox', { name: 'Text block 1' })).toHaveValue('It was a quiet summer by the lake.');
  });

  it('title commits on blur only when changed, not on every keystroke — unchanged, distinct from the passage\'s own save behavior', () => {
    const { onRetitle } = renderCard();
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.change(input, { target: { value: 'The Cabin' } });
    expect(onRetitle).not.toHaveBeenCalled(); // typing alone must not fire a write
    fireEvent.blur(input);
    expect(onRetitle).toHaveBeenCalledWith('The Cabin');
    expect(onRetitle).toHaveBeenCalledTimes(1);
  });

  it('blurring with an unchanged value is a no-op — no wasted write', () => {
    const { onRetitle } = renderCard();
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.blur(input);
    expect(onRetitle).not.toHaveBeenCalled();
  });

  it('blurring with an empty value reverts to the original rather than saving blank', () => {
    const { onRetitle } = renderCard();
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(onRetitle).not.toHaveBeenCalled();
    expect(input).toHaveValue('The Lake House');
  });

  it('Enter commits the same as blur', () => {
    const { onRetitle } = renderCard();
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    input.focus(); // Enter's handler calls inputRef.current.blur(), which is a no-op on an unfocused element
    fireEvent.change(input, { target: { value: 'The Cabin' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRetitle).toHaveBeenCalledWith('The Cabin');
  });

  it('Escape reverts the draft without committing', () => {
    const { onRetitle } = renderCard();
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    input.focus();
    fireEvent.change(input, { target: { value: 'The Cabin' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('The Lake House');
    expect(onRetitle).not.toHaveBeenCalled();
  });

  it('switching to a different open memory resets any uncommitted title draft', () => {
    const memory = mkMemory();
    const onRetitle = vi.fn();
    const { rerender } = render(
      <MemoryCardView
        memory={memory}
        onClose={vi.fn()}
        onRetitle={onRetitle}
        onRemove={vi.fn()}
        onStub={vi.fn()}
        onReviseBlocks={vi.fn()}
        sessionImages={[]}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.change(input, { target: { value: 'half-typed draft' } });

    const nextMemory = mkMemory({ id: 'mem-2', title: 'A Different Memory', body: 'Something else entirely.' });
    rerender(
      <MemoryCardView
        memory={nextMemory}
        onClose={vi.fn()}
        onRetitle={onRetitle}
        onRemove={vi.fn()}
        onStub={vi.fn()}
        onReviseBlocks={vi.fn()}
        sessionImages={[]}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('A Different Memory');
    // The passage default-seeds fresh from the new memory too, not the old one.
    expect(screen.getByRole('textbox', { name: 'Text block 1' })).toHaveValue('Something else entirely.');
  });

  it('"+" fires the stub callback, not a story-move popover', () => {
    const { onStub } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Add to a story' }));
    expect(onStub).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /the lake house/i })).toBeNull(); // no popover list rendered
  });

  it('Close fires onClose', () => {
    const { onClose } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Close memory panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MemoryCardView — media block', () => {
  it('renders a placeholder box for a photo-kind memory', () => {
    renderCard({ source_kind: 'photo' });
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  it('renders nothing for a conversation-kind memory — no empty box', () => {
    const { container } = renderCard({ source_kind: 'conversation' });
    expect(screen.queryByText('Photo')).toBeNull();
    expect(container.querySelector('.border-dashed')).toBeNull();
  });
});

describe('MemoryCardView — passage: block canvas renders immediately, no pencil, ever', () => {
  it('a legacy/never-edited memory (body_blocks null) gets a default single text block seeded from memory.body, with no edit affordance to click first', () => {
    const { memory } = renderCard();
    expect(screen.queryByRole('button', { name: 'Edit passage' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Text block 1' })).toHaveValue(memory.body);
  });

  it('a memory with already-populated body_blocks renders those blocks directly, in order', () => {
    renderCard({
      body_blocks: [
        { id: 'b1', type: 'text', content: 'First.' },
        { id: 'b2', type: 'image', media_item_id: 'media-1' },
      ],
    });
    expect(screen.queryByRole('button', { name: 'Edit passage' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Text block 1' })).toHaveValue('First.');
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
  });

  it('never renders a plain read-only <p> passage — the canvas is the only presentation', () => {
    const { container } = renderCard();
    // The old lazy-seed fallback rendered the passage as a <p>; that path is gone entirely.
    const passageParagraphs = Array.from(container.querySelectorAll('p')).filter((p) =>
      p.textContent?.includes('It was a quiet summer by the lake.'),
    );
    expect(passageParagraphs).toHaveLength(0);
  });
});

describe('MemoryCardView — block canvas: text content commits on every keystroke (Text+Image Scope Handover)', () => {
  it('fires onReviseBlocks once per keystroke, not once on blur', () => {
    const { onReviseBlocks } = renderCard({ body_blocks: [{ id: 'b1', type: 'text', content: 'Old' }] });
    const textbox = screen.getByRole('textbox', { name: 'Text block 1' });
    fireEvent.change(textbox, { target: { value: 'N' } });
    fireEvent.change(textbox, { target: { value: 'Ne' } });
    fireEvent.change(textbox, { target: { value: 'New' } });
    expect(onReviseBlocks).toHaveBeenCalledTimes(3);
    expect(onReviseBlocks).toHaveBeenNthCalledWith(1, [{ id: 'b1', type: 'text', content: 'N' }]);
    expect(onReviseBlocks).toHaveBeenNthCalledWith(3, [{ id: 'b1', type: 'text', content: 'New' }]);
  });

  it('blurring alone fires nothing — there is no separate commit step', () => {
    const { onReviseBlocks } = renderCard({ body_blocks: [{ id: 'b1', type: 'text', content: 'Old' }] });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Text block 1' }));
    expect(onReviseBlocks).not.toHaveBeenCalled();
  });

  it('emptying the only text block via typing still commits unconditionally — no client-side revert-on-blur guard anymore (server-side validation is the only backstop)', () => {
    const { onReviseBlocks } = renderCard({ body_blocks: [{ id: 'b1', type: 'text', content: 'Original content.' }] });
    const textbox = screen.getByRole('textbox', { name: 'Text block 1' });
    fireEvent.change(textbox, { target: { value: '' } });
    expect(onReviseBlocks).toHaveBeenCalledWith([{ id: 'b1', type: 'text', content: '' }]);
    expect(textbox).toHaveValue(''); // no revert — the reference has no such guard for typing
  });
});

describe('MemoryCardView — block canvas: structural edits (insert/remove/attach) commit immediately', () => {
  it('inserting a text block from the TOP inserter (before the first block) commits the whole updated array at the right position', () => {
    const { onReviseBlocks } = renderCard({ body_blocks: [{ id: 'b1', type: 'text', content: 'One.' }] });
    openInserter(0); // the top slot, before block 0
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(onReviseBlocks).toHaveBeenCalledWith([
      { id: expect.any(String), type: 'text', content: '' },
      { id: 'b1', type: 'text', content: 'One.' },
    ]);
  });

  it('inserting a text block from the inserter AFTER a block commits it at that position, not the end', () => {
    const { onReviseBlocks } = renderCard({
      body_blocks: [
        { id: 'b1', type: 'text', content: 'One.' },
        { id: 'b2', type: 'text', content: 'Two.' },
      ],
    });
    openInserter(1); // between block 0 and block 1
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    expect(onReviseBlocks).toHaveBeenCalledWith([
      { id: 'b1', type: 'text', content: 'One.' },
      { id: expect.any(String), type: 'text', content: '' },
      { id: 'b2', type: 'text', content: 'Two.' },
    ]);
  });

  it('attaching a photo from an inserter\'s picker commits immediately, referencing the chosen media_item_id at that position', () => {
    const { onReviseBlocks } = renderCard(
      { body_blocks: [{ id: 'b1', type: 'text', content: 'One.' }] },
      [{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }],
    );
    openInserter(1); // the bottom slot, after the only block
    fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add photo: a.jpg' }));
    expect(onReviseBlocks).toHaveBeenCalledWith([
      { id: 'b1', type: 'text', content: 'One.' },
      { id: expect.any(String), type: 'image', media_item_id: 'media-1' },
    ]);
  });

  it('removing a block commits the remaining array immediately', () => {
    const { onReviseBlocks } = renderCard({
      body_blocks: [
        { id: 'b1', type: 'text', content: 'One.' },
        { id: 'b2', type: 'image', media_item_id: 'media-1' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(onReviseBlocks).toHaveBeenCalledWith([{ id: 'b1', type: 'text', content: 'One.' }]);
  });

  it('disables removing the only remaining non-empty text block, so the passage can never be emptied via removal', () => {
    const { onReviseBlocks } = renderCard({ body_blocks: [{ id: 'b1', type: 'text', content: 'Only passage.' }] });
    const button = screen.getByRole('button', { name: 'Remove text block' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onReviseBlocks).not.toHaveBeenCalled();
  });
});

describe('MemoryCardView — footer', () => {
  it('"Talk about this" and "Use as a base" are stubbed, not silent — both fire the toast callback', () => {
    const { onStub } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Talk about this' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use as a base' }));
    expect(onStub).toHaveBeenCalledTimes(2);
  });

  it('Remove is wired for real — fires onRemove, not the stub callback', () => {
    const { onRemove, onStub } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onStub).not.toHaveBeenCalled();
  });
});
