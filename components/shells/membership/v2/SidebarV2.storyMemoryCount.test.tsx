// Covers the story-row memory-count badge (sidebar-story-memory-badge) —
// reuses the same SidebarMemoryCount mark already used for conversation rows
// (session.memoryCount) and the Sessions header total, now also on each
// story row via story.memoryCount (services/crm/story-containments.ts's
// getMemoryCountsForStories, threaded through listStories -> GET
// /api/stories). Matches SidebarMemoryCount's own render-nothing-at-zero
// convention (SidebarV2.tsx) rather than inventing a separate empty state
// for stories.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true },
    recentSessions: [
      { id: 'session-1', title: 'A conversation', memoryCount: 0, starred: false },
    ],
    loadSession: vi.fn(),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

afterEach(cleanup);

describe('SidebarV2 — story-row memory count badge', () => {
  it('shows the memory count for a story with memories', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Life in Full', memoryCount: 3 }]}
        writingPrompts={[]}
      />
    );

    expect(screen.getByTitle('3 memories kept')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders no badge for a story with zero memories', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Life in Full', memoryCount: 0 }]}
        writingPrompts={[]}
      />
    );

    expect(screen.queryByTitle(/memories kept|memory kept/)).not.toBeInTheDocument();
  });

  it('renders no badge for a story whose memoryCount is undefined — same as zero, not an error state', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Life in Full' }]}
        writingPrompts={[]}
      />
    );

    expect(screen.queryByTitle(/memories kept|memory kept/)).not.toBeInTheDocument();
  });

  it('uses singular "memory" phrasing for a count of exactly 1', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Life in Full', memoryCount: 1 }]}
        writingPrompts={[]}
      />
    );

    expect(screen.getByTitle('1 memory kept')).toBeInTheDocument();
  });
});
