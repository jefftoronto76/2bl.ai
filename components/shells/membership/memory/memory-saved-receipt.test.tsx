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
import type { Story } from '../v2/types';

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

// "+" (add to a story) — real now (assign-memory-to-story), same StoryPicker
// popover MemoryCardView's own header "+" already uses (see
// MemoryCardView.test.tsx for the popover's own mechanics — backdrop/Escape
// dismissal, no-op re-pick — covered there, not duplicated here).
describe('MemorySavedReceipt — "+" (add to a story)', () => {
  it('opens the story popover without opening the memory panel', () => {
    const onOpen = vi.fn();
    const onAssignStory = vi.fn();
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    const m = memory();
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} onOpen={onOpen} stories={stories} onAssignStory={onAssignStory} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to a story' }));
    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' })).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('picking a story calls onAssignStory with that story\'s id', () => {
    const onAssignStory = vi.fn();
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    render(<MemorySavedReceipt memory={memory()} onRetitle={() => {}} stories={stories} onAssignStory={onAssignStory} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to a story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Summer at the Lake' }));
    expect(onAssignStory).toHaveBeenCalledWith('story-1');
  });

  it('highlights the memory\'s current story with a checkmark, and re-picking it is a no-op', () => {
    const onAssignStory = vi.fn();
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    const m = memory({ storyId: 'story-1' });
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} stories={stories} onAssignStory={onAssignStory} />);

    // Targeted by StoryPicker's own stable testid, not the "Add to a story"
    // label — the trigger's own accessible name has since changed to the
    // checkmark state's 'In "X" — click to change or remove' now that this
    // memory already has a storyId (trigger-checkmark-state, 2026-08-14).
    fireEvent.click(screen.getByTestId('story-picker-trigger'));
    const currentStoryBtn = screen.getByRole('button', { name: 'Summer at the Lake (current story)' });
    expect(currentStoryBtn.querySelector('svg')).not.toBeNull();
    fireEvent.click(currentStoryBtn);
    expect(onAssignStory).not.toHaveBeenCalled();
  });

  it('a "+" click does not open the memory panel even via keyboard', () => {
    const onOpen = vi.fn();
    render(
      <MemorySavedReceipt
        memory={memory()}
        onRetitle={() => {}}
        onOpen={onOpen}
        stories={[]}
        onAssignStory={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add to a story' }), { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not render "+" when onAssignStory is omitted', () => {
    render(<MemorySavedReceipt memory={memory()} onRetitle={() => {}} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Add to a story' })).toBeNull();
  });
});

// Trigger checkmark state + remove-from-story (remove-memory-from-story,
// 2026-08-14) — MemorySavedReceipt's own coverage of the same StoryPicker
// behavior MemoryCardView.test.tsx already covers in isolation; this file
// only asserts MemorySavedReceipt's OWN wiring (onRemoveFromStory threaded
// to StoryPicker's onRemove), not StoryPicker's internal mechanics.
describe('MemorySavedReceipt — trigger state + "Remove from \'[Story]\'"', () => {
  it('shows the checkmark trigger, not "+", once the memory already belongs to a story', () => {
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    const m = memory({ storyId: 'story-1' });
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} stories={stories} onAssignStory={vi.fn()} onRemoveFromStory={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'In "Summer at the Lake" — click to change or remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to a story' })).toBeNull();
  });

  it('picking "Remove from" calls onRemoveFromStory', () => {
    const onRemoveFromStory = vi.fn();
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    const m = memory({ storyId: 'story-1' });
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} stories={stories} onAssignStory={vi.fn()} onRemoveFromStory={onRemoveFromStory} />);

    fireEvent.click(screen.getByTestId('story-picker-trigger'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    expect(onRemoveFromStory).toHaveBeenCalledTimes(1);
  });

  it('does not open the memory panel when removing', () => {
    const onOpen = vi.fn();
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    const m = memory({ storyId: 'story-1' });
    render(
      <MemorySavedReceipt
        memory={m}
        onRetitle={() => {}}
        onOpen={onOpen}
        stories={stories}
        onAssignStory={vi.fn()}
        onRemoveFromStory={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('story-picker-trigger'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('defaults onRemoveFromStory to a safe no-op when omitted — omitting it does not break the "+"/checkmark trigger', () => {
    const stories: Story[] = [{ id: 'story-1', name: 'Summer at the Lake' }];
    const m = memory({ storyId: 'story-1' });
    render(<MemorySavedReceipt memory={m} onRetitle={() => {}} stories={stories} onAssignStory={vi.fn()} />);

    fireEvent.click(screen.getByTestId('story-picker-trigger'));
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Remove from "Summer at the Lake"' }))).not.toThrow();
  });
});

// Real photo thumbnail (2026-08-08) — same sessionImages lookup pattern
// already applied to BlockCanvas.tsx's ImageBlockRow, MemoryCard's own
// draft state, and the memory panel's block canvas.
describe('MemorySavedReceipt — real photo thumbnail replaces the icon circle', () => {
  it('renders a real 34px thumbnail instead of the icon circle when media_item_id resolves in sessionImages', () => {
    const { container } = render(
      <MemorySavedReceipt
        memory={memory({ media_item_id: 'media-1' })}
        onRetitle={() => {}}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    const img = screen.getByAltText('a.jpg');
    expect(img).toBeInTheDocument();
    expect(img.className).toContain('object-cover');
    // The wrapping thumbnail box, not the icon circle.
    expect(img.closest('span')?.className).toContain('size-[34px]');
    expect(img.closest('span')?.className).toContain('rounded-[9px]');
    // The icon circle (kind-specific glyph) is gone, replaced, not alongside.
    expect(container.querySelector('svg.lucide-image')).toBeNull();
  });

  it('falls back to the icon circle when media_item_id does not resolve in sessionImages', () => {
    const { container } = render(
      <MemorySavedReceipt
        memory={memory({ media_item_id: 'media-missing' })}
        onRetitle={() => {}}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg.lucide-image')).not.toBeNull();
  });

  it('falls back to the icon circle when there is no media_item_id at all — non-photo memories completely unaffected', () => {
    const { container } = render(
      <MemorySavedReceipt
        memory={memory({ source_kind: 'audio', media_item_id: null })}
        onRetitle={() => {}}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg.lucide-mic')).not.toBeNull();
  });

  it('defaults sessionImages to [] when the prop is omitted — non-breaking for existing callers', () => {
    const { container } = render(<MemorySavedReceipt memory={memory({ media_item_id: 'media-1' })} onRetitle={() => {}} />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg.lucide-image')).not.toBeNull();
  });

  it('a real thumbnail does not interfere with opening the memory panel', () => {
    const onOpen = vi.fn();
    const m = memory({ media_item_id: 'media-1' });
    render(
      <MemorySavedReceipt
        memory={m}
        onRetitle={() => {}}
        onOpen={onOpen}
        sessionImages={[{ id: 'media-1', url: 'https://example.test/a.jpg', filename: 'a.jpg' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(m);
  });
});
