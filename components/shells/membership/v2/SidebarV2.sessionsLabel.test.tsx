// Covers the user-visible label of the sessions list after the 2026-08-16
// "Memories" -> "Sessions" rename (PR #403), which shipped as a copy-only
// change with no test behind it.
//
// The aria-label is asserted alongside the visible text on purpose. They are
// the accessible name of the same toggle, so letting them diverge breaks WCAG
// 2.5.3 (Label in Name) — a getByRole query keyed on the accessible name is
// what actually pins that, since it fails if the aria-label regresses even
// while the visible span still reads correctly.
//
// Deliberately NOT covered here: the "No memories yet" empty state ~15 lines
// below the header. It still says "memories" while the header says "Sessions",
// and that is a live product decision, not an oversight — see the SidebarV2
// row in System Docs/Public Site.md. Asserting either wording here would
// quietly harden one side of a question that is still open.

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

describe('SidebarV2 — sessions list label', () => {
  it('labels the list "Sessions" in both the visible text and the toggle\'s accessible name', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    // Keyed on the accessible name, so a regressed aria-label fails here even
    // if the visible span is still right.
    const toggle = screen.getByRole('button', { name: 'Sessions' });

    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Sessions');
    expect(toggle).not.toHaveTextContent(/Memories/);
  });
});
