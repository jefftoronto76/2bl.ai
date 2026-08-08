// Unit coverage for MemorySavedReceipt (`saved` state) after the 2026-08-08
// fixes pass: primary-circle icon is kind-specific, the small glyph before
// "Kept" is a checkmark (a distinct job from the kind icon above it, not a
// redundant copy of it), no inline rename affordance remains, and the
// subtitle text stays exactly "Kept". Source material: the diff audit
// against Design Handovers/design_handoff_memories_08_2026/README.md §5 and
// README_processing_and_saved_states.md's "Saved state: receipt copy"
// section.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { MemorySavedReceipt } from './MemoryCard';
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories';

afterEach(cleanup);

function memory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: 'mem-1',
    session_id: 'sess-1',
    anchor_message_id: 'm1',
    source_kind: 'photo',
    title: 'The Lake House',
    body: 'It was a quiet summer by the lake.',
    status: 'published',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MemorySavedReceipt', () => {
  it('renders the kind-specific icon in the primary circle, sized 12', () => {
    const { container } = render(<MemorySavedReceipt memory={memory({ source_kind: 'photo' })} onRetitle={() => {}} />);

    const kindIcons = container.querySelectorAll('svg.lucide-image');
    expect(kindIcons.length).toBe(1);
    expect(kindIcons[0].getAttribute('width')).toBe('12');
    expect(kindIcons[0].getAttribute('height')).toBe('12');
  });

  it('renders a checkmark, sized 10, next to "Kept" — a distinct glyph from the kind icon above it', () => {
    const { container } = render(<MemorySavedReceipt memory={memory({ source_kind: 'photo' })} onRetitle={() => {}} />);

    const checks = container.querySelectorAll('svg.lucide-check');
    expect(checks.length).toBe(1);
    expect(checks[0].getAttribute('width')).toBe('10');
    expect(checks[0].getAttribute('height')).toBe('10');
  });

  it('varies the icon by source_kind rather than using one fixed glyph', () => {
    const { container } = render(<MemorySavedReceipt memory={memory({ source_kind: 'audio' })} onRetitle={() => {}} />);
    expect(container.querySelector('svg.lucide-mic')).not.toBeNull();
    expect(container.querySelector('svg.lucide-image')).toBeNull();
  });

  it('has no edit button or text input anywhere in the rendered output', () => {
    render(<MemorySavedReceipt memory={memory()} onRetitle={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText('Edit title')).toBeNull();
  });

  it('renders the title as plain read-only text and the subtitle stays "Kept"', () => {
    render(<MemorySavedReceipt memory={memory({ title: 'The Lake House' })} onRetitle={() => {}} />);
    expect(screen.getByText('The Lake House').tagName).toBe('SPAN');
    expect(screen.getByText('Kept')).toBeInTheDocument();
  });

  // memory-panel-layout Stage A: the row opens the memory panel when a
  // handler is passed, and stays fully inert (no button semantics at all)
  // when it isn't — same optional-handler posture as every other callback
  // in this file.
  it('calls onOpen with the memory on click when a handler is passed', () => {
    const onOpen = vi.fn();
    const m = memory();
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(m);
  });

  it('calls onOpen on Enter and Space, not on other keys', () => {
    const onOpen = vi.fn();
    const m = memory();
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} onOpen={onOpen} />);
    const row = screen.getByRole('button');

    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('has no button role at all when onOpen is omitted', () => {
    render(<MemorySavedReceipt memory={memory()} onRetitle={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
