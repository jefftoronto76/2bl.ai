// Covers the user-visible copy of the sessions list — the header that labels
// it and the empty state beneath it — after the 2026-08-16 "Memories" ->
// "Sessions" rename (PRs #403, #408).
//
// The rename shipped as a copy-only change with no test behind it, so nothing
// would have caught a partial revert: the header and the empty state live ~15
// lines apart and were renamed in two separate passes, which is exactly how
// they drifted out of sync the first time (header renamed, "No memories yet"
// left behind).
//
// The aria-label is asserted alongside the visible text on purpose. They are
// the accessible name of the same toggle, so letting them diverge breaks WCAG
// 2.5.3 (Label in Name) — a getByRole query keyed on the accessible name is
// what actually pins that, since it fails if the aria-label regresses even
// while the visible span still reads correctly.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const loadSession = vi.fn();

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true },
    recentSessions: [],
    loadSession,
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

afterEach(cleanup);

describe('SidebarV2 — sessions list copy', () => {
  it('labels the list "Sessions" in both the visible text and the toggle\'s accessible name', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    // Keyed on the accessible name, so a regressed aria-label fails here even
    // if the visible span is still right.
    const toggle = screen.getByRole('button', { name: 'Sessions' });

    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Sessions');
    expect(toggle).not.toHaveTextContent(/Memories/);
  });

  it('shows "No sessions yet" — not the old "No memories yet" — when there are no sessions and no search query', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
    expect(screen.queryByText('No memories yet')).not.toBeInTheDocument();
  });
});
