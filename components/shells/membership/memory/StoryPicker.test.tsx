// Unit coverage for StoryPicker (assign-memory-to-story, 2026-08-13;
// remove-memory-from-story, 2026-08-14) — isolated from MemoryCardView/
// ChatHero, same convention as MemoryCardView.test.tsx and
// BlockCanvas.test.tsx (BlockInserter's own dismissal tests, which this
// component's mechanics deliberately mirror).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { StoryPicker } from './StoryPicker';
import type { Story } from '../v2/types';

afterEach(cleanup);

const STORIES: Story[] = [
  { id: 'story-1', name: 'Summer at the Lake' },
  { id: 'story-2', name: 'The Family Farm' },
];

/** Targets the trigger by its stable testid — its accessible name changes with assignment state (Plus vs. checkmark), so a role/name query would break for one state or the other. */
function openPicker() {
  fireEvent.click(screen.getByTestId('story-picker-trigger'));
}

describe('StoryPicker — opening', () => {
  it('lists every story passed in, closed by default', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Summer at the Lake/ })).toBeNull();

    openPicker();
    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to The Family Farm' })).toBeInTheDocument();
  });

  it('shows a plain empty-state line, not a styled empty-state component, when there are no accessible stories — matches BlockInserter\'s own convention', () => {
    render(<StoryPicker stories={[]} onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();
    expect(screen.getByText('No stories yet.')).toBeInTheDocument();
  });

  it('clicking "+" again closes it', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();
    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' })).toBeInTheDocument();
    openPicker();
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });
});

describe('StoryPicker — picking a story', () => {
  it('single click on a story fires onPick immediately and closes the popover — no separate confirm step', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} onPick={onPick} onRemove={vi.fn()} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Summer at the Lake' }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('story-1');
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });

  it('re-picking the story the memory is already in is a no-op — onPick is never called, no round trip', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={onPick} onRemove={vi.fn()} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Summer at the Lake (current story)' }));

    expect(onPick).not.toHaveBeenCalled();
    // Still closes, same as a real pick — no dead popover left open.
    expect(screen.queryByRole('button', { name: 'Summer at the Lake (current story)' })).toBeNull();
  });

  it('picking a DIFFERENT story than the current one still fires onPick normally', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={onPick} onRemove={vi.fn()} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add to The Family Farm' }));

    expect(onPick).toHaveBeenCalledWith('story-2');
  });
});

describe('StoryPicker — current-story highlight', () => {
  it('shows a checkmark next to the story the memory currently belongs to', () => {
    const { container } = render(<StoryPicker stories={STORIES} currentStoryId="story-2" onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();

    const currentButton = screen.getByRole('button', { name: 'The Family Farm (current story)' });
    expect(currentButton.querySelector('svg')).toBeInTheDocument();

    const otherButton = screen.getByRole('button', { name: 'Add to Summer at the Lake' });
    expect(otherButton.querySelector('svg')).toBeNull();
    void container;
  });

  it('no story is highlighted when the memory has never been assigned (currentStoryId omitted)', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();

    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' }).querySelector('svg')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to The Family Farm' }).querySelector('svg')).toBeNull();
  });
});

describe('StoryPicker — access scoping is the caller\'s job, not this component\'s', () => {
  it('renders a story the member is only subscribed to (not owned) exactly like an owned one — the picker trusts whatever `stories` it is given', () => {
    const onPick = vi.fn();
    const subscribedOnly: Story[] = [{ id: 'story-3', name: "Grandma's Kitchen", isOwner: false }];
    render(<StoryPicker stories={subscribedOnly} onPick={onPick} onRemove={vi.fn()} />);
    openPicker();

    const option = screen.getByRole('button', { name: "Add to Grandma's Kitchen" });
    expect(option).toBeInTheDocument();
    fireEvent.click(option);
    expect(onPick).toHaveBeenCalledWith('story-3');
  });
});

describe('StoryPicker — dismissal (backdrop + Escape, matches BlockInserter exactly)', () => {
  it('clicking outside the open popover (the backdrop) closes it', () => {
    const { container } = render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();
    fireEvent.click(container.querySelector('[data-testid="story-picker-backdrop"]')!);
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });

  it('Escape closes it', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });

  it('no backdrop renders while the popover is closed', () => {
    const { container } = render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    expect(container.querySelector('[data-testid="story-picker-backdrop"]')).toBeNull();
  });
});

describe('StoryPicker — trigger button reflects assignment state (remove-memory-from-story, 2026-08-14)', () => {
  it('shows the ordinary accent Plus circle, labeled "Add to a story", when the memory has no current story', () => {
    const { container } = render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Add to a story' });
    expect(trigger.className).toContain('bg-accent');
    expect(trigger.className).not.toContain('#2E7D4F');
    void container;
  });

  it('shows a green filled Check circle, labeled with the story name, when currentStoryId resolves against stories', () => {
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={vi.fn()} onRemove={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'In "Summer at the Lake" — click to change or remove' });
    expect(trigger.className).toContain('#2E7D4F');
    expect(trigger.className).not.toContain('bg-accent');
  });

  it('clicking the checkmark trigger opens the same popover as the Plus would — a visual-state change only, not a second control', () => {
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'In "Summer at the Lake" — click to change or remove' }));
    expect(screen.getByRole('button', { name: 'Add to The Family Farm' })).toBeInTheDocument();
  });
});

describe('StoryPicker — "Remove from \'[Story]\'" (remove-memory-from-story, 2026-08-14)', () => {
  it('renders at the top of the popover only when currentStoryId is set', () => {
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();
    expect(screen.getByRole('button', { name: 'Remove from "Summer at the Lake"' })).toBeInTheDocument();
  });

  it('does not render when the memory has no current story', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} onRemove={vi.fn()} />);
    openPicker();
    expect(screen.queryByText(/^Remove from/)).toBeNull();
  });

  it('clicking it fires onRemove and closes the popover — same no-confirm posture as picking a story', () => {
    const onRemove = vi.fn();
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={vi.fn()} onRemove={onRemove} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Remove from "Summer at the Lake"' })).toBeNull();
  });

  it('never calls onPick when removing', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={onPick} onRemove={vi.fn()} />);
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from "Summer at the Lake"' }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
