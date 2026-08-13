// Covers active-session-to-top (2026-08-13): recentSessions arrives
// server-sorted by updated_at DESC (services/crm/sessions.ts), and merely
// switching to an older session (no new message sent) never touches
// updated_at — so without a client-side reorder, the active row just sits
// wherever it naturally falls instead of surfacing at the top. SidebarV2
// derives a display-ordered copy right before rendering; recentSessions
// itself is never mutated.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const mockRecentSessions = [
  { id: 'session-a', title: 'Session A', memoryCount: 0, starred: false },
  { id: 'session-b', title: 'Session B', memoryCount: 0, starred: false },
  { id: 'session-c', title: 'Session C', memoryCount: 0, starred: false },
];

let mockSessionId: string | null = null;

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true, sessionId: mockSessionId },
    recentSessions: mockRecentSessions,
    loadSession: vi.fn(),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

afterEach(() => {
  cleanup();
  mockSessionId = null;
});

function renderedTitles() {
  return screen.getAllByText(/^Session [ABC]$/).map((el) => el.textContent);
}

describe('SidebarV2 — active session renders first', () => {
  it('moves the active session to the top even when it is not the most recently updated one', () => {
    // Server order is A, B, C (most-recently-updated first) — the active
    // session is C, the LEAST recently updated of the three.
    mockSessionId = 'session-c';

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    expect(renderedTitles()).toEqual(['Session C', 'Session A', 'Session B']);
  });

  it('leaves order unchanged from server order when no session is active', () => {
    mockSessionId = null;

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    expect(renderedTitles()).toEqual(['Session A', 'Session B', 'Session C']);
  });

  it('leaves order unchanged when the active session id matches nothing in the list', () => {
    mockSessionId = 'session-does-not-exist';

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    expect(renderedTitles()).toEqual(['Session A', 'Session B', 'Session C']);
  });

  it('leaves order unchanged when the active session is already first', () => {
    mockSessionId = 'session-a';

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    expect(renderedTitles()).toEqual(['Session A', 'Session B', 'Session C']);
  });
});

// Covers the 2026-08-13 merge of this branch with the sidebar search+collapse
// redesign (2026-08-13-sidebar-search-collapse) — both landed on main the
// same day, on separate branches, and both touch the same recentSessions
// render loop in SidebarV2. filteredSessions is derived from orderedSessions
// (not recentSessions directly, see SidebarV2.tsx's own comment on the merge
// conflict this caused), specifically so a live search never resurfaces the
// pre-reorder server order underneath the active-first placement.
describe('SidebarV2 — active-session-to-top composes with live search', () => {
  it('keeps the active (reordered-to-top) session first among search results when it matches the query', () => {
    // Server order is A, B, C; active session is C (least recently updated).
    mockSessionId = 'session-c';

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    fireEvent.change(screen.getByLabelText('Search your story'), {
      target: { value: 'Session' },
    });

    // If search filtered the stale pre-reorder recentSessions array instead
    // of orderedSessions, this would come back as ['Session A', 'Session B',
    // 'Session C'] — the active session would drop back to last.
    expect(renderedTitles()).toEqual(['Session C', 'Session A', 'Session B']);
  });

  it('excludes the active session from results when the query does not match it, without erroring', () => {
    mockSessionId = 'session-c';

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    fireEvent.change(screen.getByLabelText('Search your story'), {
      target: { value: 'Session A' },
    });

    expect(renderedTitles()).toEqual(['Session A']);
  });

  it('filters case-insensitively against the reordered list, not just the raw server order', () => {
    mockSessionId = 'session-b';

    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    fireEvent.change(screen.getByLabelText('Search your story'), {
      target: { value: 'session b' },
    });

    expect(renderedTitles()).toEqual(['Session B']);
  });
});
