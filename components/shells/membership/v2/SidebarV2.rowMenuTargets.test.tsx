// Covers RowMenu's target-aware MENU_ITEMS filtering (Updated Story Kebabs
// handover, 2026-08-13). MENU_ITEMS used to be a single flat list rendered
// identically at both call sites — moveToChapter/removeFromChapter showed on
// story rows too, purely by omission (they're chapter-related, no-op'd for
// stories elsewhere, never actually story-relevant). Adding the new
// story-only 'admin' item without real filtering would have shown it on
// conversation rows too. This test covers both directions: the new item's
// own gating, and regression coverage that the pre-existing chapter items
// are now correctly conversation-only.
//
// Story fixtures that need the kebab visible set isOwner: true — the
// separate story-kebab-owner-only pass (also 2026-08-13, merged after this
// file was written) hides the whole kebab trigger for a non-owned story, so
// without it these tests would never find "Story options" to click at all.
// Ownership gating itself is covered by SidebarV2.storyKebabOwnership.test.tsx.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

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

describe('SidebarV2 — RowMenu target-aware MENU_ITEMS', () => {
  it('story row kebab shows Admin, not Move to chapter / Remove from chapter', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Story', isOwner: true }]}
        writingPrompts={[]}
        onRowAction={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Story options' }));

    expect(screen.getByRole('menuitem', { name: /admin/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move to chapter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /remove from chapter/i })).not.toBeInTheDocument();
  });

  it('conversation row kebab shows Move to chapter / Remove from chapter, not Admin', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Story' }]}
        writingPrompts={[]}
        onRowAction={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Conversation options' }));

    expect(screen.getByRole('menuitem', { name: /move to chapter/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /remove from chapter/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /admin/i })).not.toBeInTheDocument();
  });

  it('clicking Admin on a story row dispatches onRowAction with target=story, action=admin', () => {
    const onRowAction = vi.fn();
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Story', isOwner: true }]}
        writingPrompts={[]}
        onRowAction={onRowAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Story options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /admin/i }));

    expect(onRowAction).toHaveBeenCalledWith('story', 'story-1', 'admin');
  });
});
