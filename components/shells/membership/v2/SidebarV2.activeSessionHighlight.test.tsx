// Active session is highlighted IN PLACE (2026-09, story-deck workspace
// fixes item 2). The earlier active-session-to-top reorder (2026-08-13) was
// dropped as distracting: recentSessions renders in server order
// (updated_at DESC) no matter which session is active, and the active row
// is marked with aria-current + the active background instead.

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

function rowButton(title: string) {
  return screen.getByText(title).closest('button')!;
}

describe('SidebarV2 — active session is highlighted in place', () => {
  it('keeps server order when the active session is not the most recently updated one', () => {
    mockSessionId = 'session-c';
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    expect(renderedTitles()).toEqual(['Session A', 'Session B', 'Session C']);
  });

  it('marks only the active row with aria-current and the active background', () => {
    mockSessionId = 'session-c';
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    expect(rowButton('Session C')).toHaveAttribute('aria-current', 'true');
    expect(rowButton('Session C').className).toContain('bg-text-primary/10');
    expect(rowButton('Session A')).not.toHaveAttribute('aria-current');
    expect(rowButton('Session B')).not.toHaveAttribute('aria-current');
  });

  it('highlights nothing when no session is active', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    expect(renderedTitles()).toEqual(['Session A', 'Session B', 'Session C']);
    for (const t of ['Session A', 'Session B', 'Session C']) {
      expect(rowButton(t)).not.toHaveAttribute('aria-current');
    }
  });
});

describe('SidebarV2 — search filters without reordering', () => {
  it('keeps server order among search results when the active session matches', () => {
    mockSessionId = 'session-c';
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    fireEvent.change(screen.getByLabelText('Search your story'), { target: { value: 'Session' } });
    expect(renderedTitles()).toEqual(['Session A', 'Session B', 'Session C']);
    expect(rowButton('Session C')).toHaveAttribute('aria-current', 'true');
  });

  it('excludes the active session when the query does not match it', () => {
    mockSessionId = 'session-c';
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    fireEvent.change(screen.getByLabelText('Search your story'), { target: { value: 'Session A' } });
    expect(renderedTitles()).toEqual(['Session A']);
  });

  it('filters case-insensitively', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    fireEvent.change(screen.getByLabelText('Search your story'), { target: { value: 'session b' } });
    expect(renderedTitles()).toEqual(['Session B']);
  });
});
