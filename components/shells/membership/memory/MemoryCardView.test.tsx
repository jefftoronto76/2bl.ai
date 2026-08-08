// Unit coverage for MemoryCardView (memory-panel-layout CardView chrome
// pass, 2026-08-08) — isolated from ChatHero/MessageList, same convention
// as MemoryPanelDivider.test.tsx. Integration with the real panel stack
// (opening from a MemorySavedReceipt click) is covered separately in
// ChatHero.memoryPanel.test.tsx.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryCardView } from './MemoryCardView';
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories';

afterEach(cleanup);

function mkMemory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: 'mem-1',
    session_id: 'sess-1',
    anchor_message_id: 'm1',
    source_kind: 'conversation',
    title: 'The Lake House',
    body: 'It was a quiet summer by the lake.',
    status: 'published',
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function renderCard(overrides: Partial<MemoryRow> = {}) {
  const memory = mkMemory(overrides);
  const onClose = vi.fn();
  const onRetitle = vi.fn();
  const onRemove = vi.fn();
  const onStub = vi.fn();
  const utils = render(
    <MemoryCardView memory={memory} onClose={onClose} onRetitle={onRetitle} onRemove={onRemove} onStub={onStub} />,
  );
  return { memory, onClose, onRetitle, onRemove, onStub, ...utils };
}

describe('MemoryCardView — header', () => {
  it('shows the title in an editable input and the passage as plain read-only text', () => {
    renderCard();
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('The Lake House');
    expect(screen.getByText('It was a quiet summer by the lake.')).toBeInTheDocument();
  });

  it('the passage is never an editable field — renameMemory() only ever touches title', () => {
    const { container } = renderCard();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('title commits on blur only when changed, not on every keystroke', () => {
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

  it('switching to a different open memory resets any uncommitted draft', () => {
    const memory = mkMemory();
    const onRetitle = vi.fn();
    const { rerender } = render(
      <MemoryCardView memory={memory} onClose={vi.fn()} onRetitle={onRetitle} onRemove={vi.fn()} onStub={vi.fn()} />,
    );
    const input = screen.getByRole('textbox', { name: 'Memory title' });
    fireEvent.change(input, { target: { value: 'half-typed draft' } });

    const nextMemory = mkMemory({ id: 'mem-2', title: 'A Different Memory', body: 'Something else entirely.' });
    rerender(
      <MemoryCardView memory={nextMemory} onClose={vi.fn()} onRetitle={onRetitle} onRemove={vi.fn()} onStub={vi.fn()} />,
    );
    expect(screen.getByRole('textbox', { name: 'Memory title' })).toHaveValue('A Different Memory');
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
