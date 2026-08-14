// Covers active-story-to-top (2026-08-14, closing the other half of
// active_item_to_top — see Design Handovers/ Aug 2026 Atomic Updates/
// 07_active_item_to_top/README.md's "Open / not yet done"). Unlike the
// active session (state.sessionId, chat-store state), there's no existing
// "currently selected story" concept in the store — a story is "active"
// while its StoryView pane is open, tracked by ChatHero's own storyViewId
// state and passed down as the `activeStoryId` prop. SidebarV2 derives a
// display-ordered copy of `stories` right before rendering; the `stories`
// prop itself is never mutated.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const mockRecentSessions: never[] = [];

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true, sessionId: null },
    recentSessions: mockRecentSessions,
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

describe('SidebarV2 — active story renders first', () => {
  it('moves the active story to the top even when it is not first in the stories prop', () => {
    // stories prop order is A, B, C — the active story is C, last in the array.
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-c" />);

    expect(renderedStoryNames()).toEqual(['Story C', 'Story A', 'Story B']);
  });

  it('leaves order unchanged from prop order when no story is active', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} />);

    expect(renderedStoryNames()).toEqual(['Story A', 'Story B', 'Story C']);
  });

  it('leaves order unchanged when the active story id matches nothing in the list', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-does-not-exist" />);

    expect(renderedStoryNames()).toEqual(['Story A', 'Story B', 'Story C']);
  });

  it('leaves order unchanged when the active story is already first', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-a" />);

    expect(renderedStoryNames()).toEqual(['Story A', 'Story B', 'Story C']);
  });
});

// Covers the same sort-then-filter ordering of operations as
// SidebarV2.activeSessionToTop.test.tsx's search-composition tests: search
// filters orderedStories (active-first), not the raw `stories` prop, so a
// live search never resurfaces the pre-reorder prop order underneath the
// active-first placement.
describe('SidebarV2 — active-story-to-top composes with live search', () => {
  it('keeps the active (reordered-to-top) story first among search results when it matches the query', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-c" />);

    fireEvent.change(screen.getByLabelText('Search your story'), {
      target: { value: 'Story' },
    });

    // If search filtered the stale pre-reorder `stories` prop instead of
    // orderedStories, this would come back as ['Story A', 'Story B',
    // 'Story C'] — the active story would drop back to last.
    expect(renderedStoryNames()).toEqual(['Story C', 'Story A', 'Story B']);
  });

  it('excludes the active story from results when the query does not match it, without erroring', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-c" />);

    fireEvent.change(screen.getByLabelText('Search your story'), {
      target: { value: 'Story A' },
    });

    expect(renderedStoryNames()).toEqual(['Story A']);
  });

  it('filters case-insensitively against the reordered list, not just the raw prop order', () => {
    render(<SidebarV2 stories={mockStories} writingPrompts={[]} activeStoryId="story-b" />);

    fireEvent.change(screen.getByLabelText('Search your story'), {
      target: { value: 'story b' },
    });

    expect(renderedStoryNames()).toEqual(['Story B']);
  });
});
