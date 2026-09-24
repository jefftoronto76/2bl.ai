// Active story (the one whose StoryView pane is open — ChatHero's
// storyViewId, passed as `activeStoryId`) is highlighted IN PLACE (2026-09,
// story-deck workspace fixes item 2), replacing the 2026-08-14
// active-story-to-top reorder. The `stories` prop order is always kept.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true, sessionId: null },
    recentSessions: [],
    loadSession: vi.fn(),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

const mockStories = [
  { id: 'story-a', name: 'Story A' },
  { id: 'story-b', name: 'Story B' },
  { id: 'story-c', name: 'Story C' },
];

afterEach(() => {
  cleanup();
});

function renderedStoryNames() {
  return screen.getAllByText(/^Story [ABC]$/).map((el) => el.textContent);
}

function rowButton(name: string) {
  return screen.getByText(name).closest('button')!;
}

describe('SidebarV2 — active story is highlighted in place', () => {
  it('keeps prop order when the active story is not first', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-c" />);
    expect(renderedStoryNames()).toEqual(['Story A', 'Story B', 'Story C']);
  });

  it('marks only the active story row with aria-current and the active background', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-b" />);
    expect(rowButton('Story B')).toHaveAttribute('aria-current', 'true');
    expect(rowButton('Story B').className).toContain('bg-text-primary/10');
    expect(rowButton('Story A')).not.toHaveAttribute('aria-current');
    expect(rowButton('Story A').className).not.toContain('bg-text-primary/10');
    expect(rowButton('Story C')).not.toHaveAttribute('aria-current');
  });

  it('highlights nothing when no story is active', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} />);
    for (const n of ['Story A', 'Story B', 'Story C']) {
      expect(rowButton(n)).not.toHaveAttribute('aria-current');
    }
  });

  it('keeps prop order under search and still highlights the matching active story', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-c" />);
    fireEvent.change(screen.getByLabelText('Search your story'), { target: { value: 'story' } });
    expect(renderedStoryNames()).toEqual(['Story A', 'Story B', 'Story C']);
    expect(rowButton('Story C')).toHaveAttribute('aria-current', 'true');
  });
});
