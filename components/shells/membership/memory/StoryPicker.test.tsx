// Unit coverage for StoryPicker (assign-memory-to-story, 2026-08-13) —
// isolated from MemoryCardView/ChatHero, same convention as
// MemoryCardView.test.tsx and BlockCanvas.test.tsx (BlockInserter's own
// dismissal tests, which this component's mechanics deliberately mirror).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { StoryPicker } from './StoryPicker';
import type { Story } from '../v2/types';

afterEach(cleanup);

const STORIES: Story[] = [
  { id: 'story-1', name: 'Summer at the Lake' },
  { id: 'story-2', name: 'The Family Farm' },
];

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Add to a story' }));
}

describe('StoryPicker — opening', () => {
  it('lists every story passed in, closed by default', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Summer at the Lake/ })).toBeNull();

    openPicker();
    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to The Family Farm' })).toBeInTheDocument();
  });

  it('shows a plain empty-state line, not a styled empty-state component, when there are no accessible stories — matches BlockInserter\'s own convention', () => {
    render(<StoryPicker stories={[]} onPick={vi.fn()} />);
    openPicker();
    expect(screen.getByText('No stories yet.')).toBeInTheDocument();
  });

  it('clicking "+" again closes it', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} />);
    openPicker();
    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' })).toBeInTheDocument();
    openPicker();
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });
});

describe('StoryPicker — picking a story', () => {
  it('single click on a story fires onPick immediately and closes the popover — no separate confirm step', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} onPick={onPick} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Summer at the Lake' }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('story-1');
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });

  it('re-picking the story the memory is already in is a no-op — onPick is never called, no round trip', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={onPick} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Summer at the Lake (current story)' }));

    expect(onPick).not.toHaveBeenCalled();
    // Still closes, same as a real pick — no dead popover left open.
    expect(screen.queryByRole('button', { name: 'Summer at the Lake (current story)' })).toBeNull();
  });

  it('picking a DIFFERENT story than the current one still fires onPick normally', () => {
    const onPick = vi.fn();
    render(<StoryPicker stories={STORIES} currentStoryId="story-1" onPick={onPick} />);
    openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Add to The Family Farm' }));

    expect(onPick).toHaveBeenCalledWith('story-2');
  });
});

describe('StoryPicker — current-story highlight', () => {
  it('shows a checkmark next to the story the memory currently belongs to', () => {
    const { container } = render(<StoryPicker stories={STORIES} currentStoryId="story-2" onPick={vi.fn()} />);
    openPicker();

    const currentButton = screen.getByRole('button', { name: 'The Family Farm (current story)' });
    expect(currentButton.querySelector('svg')).toBeInTheDocument();

    const otherButton = screen.getByRole('button', { name: 'Add to Summer at the Lake' });
    expect(otherButton.querySelector('svg')).toBeNull();
    void container;
  });

  it('no story is highlighted when the memory has never been assigned (currentStoryId omitted)', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} />);
    openPicker();

    expect(screen.getByRole('button', { name: 'Add to Summer at the Lake' }).querySelector('svg')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to The Family Farm' }).querySelector('svg')).toBeNull();
  });
});

describe('StoryPicker — access scoping is the caller\'s job, not this component\'s', () => {
  it('renders a story the member is only subscribed to (not owned) exactly like an owned one — the picker trusts whatever `stories` it is given', () => {
    const onPick = vi.fn();
    const subscribedOnly: Story[] = [{ id: 'story-3', name: "Grandma's Kitchen", isOwner: false }];
    render(<StoryPicker stories={subscribedOnly} onPick={onPick} />);
    openPicker();

    const option = screen.getByRole('button', { name: "Add to Grandma's Kitchen" });
    expect(option).toBeInTheDocument();
    fireEvent.click(option);
    expect(onPick).toHaveBeenCalledWith('story-3');
  });
});

describe('StoryPicker — dismissal (backdrop + Escape, matches BlockInserter exactly)', () => {
  it('clicking outside the open popover (the backdrop) closes it', () => {
    const { container } = render(<StoryPicker stories={STORIES} onPick={vi.fn()} />);
    openPicker();
    fireEvent.click(container.querySelector('[data-testid="story-picker-backdrop"]')!);
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });

  it('Escape closes it', () => {
    render(<StoryPicker stories={STORIES} onPick={vi.fn()} />);
    openPicker();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Add to Summer at the Lake' })).toBeNull();
  });

  it('no backdrop renders while the popover is closed', () => {
    const { container } = render(<StoryPicker stories={STORIES} onPick={vi.fn()} />);
    expect(container.querySelector('[data-testid="story-picker-backdrop"]')).toBeNull();
  });
});
