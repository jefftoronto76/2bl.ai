// Covers the story-kebab ownership gate (2026-08-13): a story-scoped
// collaborator (subscribed via artifact_subscribers, not the owner) has no
// way to coordinate row-level actions — star/rename/invite/delete/admin —
// with the owner, since no inter-member chat exists. The locked decision is
// to hide the kebab trigger entirely for a story the caller doesn't own,
// rather than rendering RowMenu with a filtered/empty item list. This only
// applies to story rows — conversation rows have no ownership concept and
// must keep showing their kebab regardless.

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

describe('SidebarV2 — story-row kebab ownership gate', () => {
  it('shows the kebab trigger for an owned story', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-owned', name: 'My Story', isOwner: true }]}
        writingPrompts={[]}
        onRowAction={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Story options' })).toBeInTheDocument();
  });

  it('hides the kebab trigger for a non-owned (subscribed-only) story', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-subscribed', name: 'Shared Story', isOwner: false }]}
        writingPrompts={[]}
        onRowAction={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Story options' })).not.toBeInTheDocument();
  });

  it('still shows the conversation kebab trigger even though the story kebab is hidden', () => {
    render(
      <SidebarV2
        stories={[{ id: 'story-subscribed', name: 'Shared Story', isOwner: false }]}
        writingPrompts={[]}
        onRowAction={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Conversation options' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Story options' })).not.toBeInTheDocument();
  });
});
