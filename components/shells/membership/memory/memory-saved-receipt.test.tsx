// Unit coverage for MemorySavedReceipt (`saved` state) after the 2026-08-08
// fixes pass: primary-circle icon is kind-specific (not the fixed
// checkmark it replaced), no inline rename affordance remains, and the
// subtitle stays exactly "Kept" with its inline kind glyph. Source
// material: the diff audit against Design Handovers/design_handoff_memories_08_2026/
// README.md §5 and README_processing_and_saved_states.md's "Saved state:
// receipt copy" section.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
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
  it('renders the kind-specific icon in the primary circle, sized 12 — not the old checkmark', () => {
    const { container } = render(<MemorySavedReceipt memory={memory({ source_kind: 'photo' })} onRetitle={() => {}} />);

    expect(container.querySelector('svg.lucide-check')).toBeNull();

    // Same Icon renders twice: the 22px primary circle and the 10px inline
    // glyph before "Kept" — both are the kind icon now, not two different ones.
    const kindIcons = container.querySelectorAll('svg.lucide-image');
    expect(kindIcons.length).toBe(2);
    expect(kindIcons[0].getAttribute('width')).toBe('12');
    expect(kindIcons[0].getAttribute('height')).toBe('12');
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
});
