// Covers active-session-to-top (2026-08-13): recentSessions arrives
// server-sorted by updated_at DESC (services/crm/sessions.ts), and merely
// switching to an older session (no new message sent) never touches
// updated_at — so without a client-side reorder, the active row just sits
// wherever it naturally falls instead of surfacing at the top. SidebarV2
// derives a display-ordered copy right before rendering; recentSessions
// itself is never mutated.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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
