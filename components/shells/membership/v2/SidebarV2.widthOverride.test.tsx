import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Same store stub the other SidebarV2 unit tests use — width is pure
// presentation, so the real store buys nothing here.
vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true },
    recentSessions: [],
    loadSession: vi.fn(),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

// SidebarV2 serves two jobs from one component: the desktop DOCKED sidebar (a
// persistent column beside the chat, where w-64/256px is the intended size)
// and the MOBILE OVERLAY drawer (which sits ON the chat and should cover most
// of the screen). Both shared the same hard-coded w-64, so the mobile drawer
// covered a 256px sliver of a ~390px viewport. expandedWidthClassName is the
// seam that lets the overlay caller widen itself WITHOUT moving the docked
// sidebar — these tests pin both halves of that.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sidebar = () => screen.getByRole('complementary');

describe('SidebarV2 — expandedWidthClassName', () => {
  it('defaults to w-64 so the docked desktop sidebar is unchanged', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);

    expect(sidebar().className).toContain('w-64');
  });

  it('renders the override in place of w-64 when provided', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} expandedWidthClassName="w-full" />);

    expect(sidebar().className).toContain('w-full');
    // Not merely additive: two width classes on one element is a
    // source-order coin flip in the emitted CSS, so the default must be gone.
    expect(sidebar().className).not.toContain('w-64');
  });

  it('leaves the collapsed icon rail at w-12 — a fixed rail by definition', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} expandedWidthClassName="w-full" />);

    // No onClose ⇒ this instance renders the collapse chevron (the mobile
    // overlay renders a Close-X instead, and never collapses).
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar().className).toContain('w-12');
    expect(sidebar().className).not.toContain('w-full');
  });

  it('leaves the collapsed rail at w-12 under forceCollapsed too', () => {
    render(
      <SidebarV2 stories={[]} writingPrompts={[]} expandedWidthClassName="w-full" forceCollapsed />,
    );

    expect(sidebar().className).toContain('w-12');
    expect(sidebar().className).not.toContain('w-full');
  });
});

// Sidenav Expand toggle fix, 2026-09-22 — see Known Gaps.md's corrected
// entry. A prior pass concluded the toggle was correctly hidden while
// forceCollapsed; that was wrong per the Sept 2026 handover's own item 43
// ("manually re-expand" must keep working throughout, not just resolve
// correctly once the panel closes). These pin the corrected behavior.
describe('SidebarV2 — Expand/Collapse toggle stays available under forceCollapsed', () => {
  it('renders and is clickable while forceCollapsed is true', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);

    // Label reflects the member's own `expanded` preference (default true),
    // not the panel's visual override — same as the still-w-64-under-the-
    // hood behavior `isExpanded`'s formula already relied on.
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeEnabled();
  });

  it('clicking the toggle while forceCollapsed does not change the rendered width — the panel still wins visually', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar().className).toContain('w-12');
    expect(sidebar().className).not.toContain('w-64');
  });

  it('a manual re-expand clicked while forceCollapsed takes effect the moment forceCollapsed clears', () => {
    // `expanded` is internal state (defaults to true), not a prop — so this
    // first collapses it via the toggle itself (a real "Collapse sidebar"
    // click, same as a member would do before any panel ever opens), THEN
    // forces the panel open, confirming the toggle is still there and
    // reflects the member's own last choice, then manually re-expands it
    // (the handover's item 43 scenario) and confirms that choice is honored
    // the instant the panel closes — not stuck at whatever it was when the
    // panel opened.
    const { rerender } = render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(sidebar().className).toContain('w-12');

    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);
    expect(sidebar().className).toContain('w-12');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    // Still visually collapsed — the panel's override wins while it's open.
    expect(sidebar().className).toContain('w-12');

    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed={false} />);
    expect(sidebar().className).toContain('w-64');
    expect(sidebar().className).not.toContain('w-12');
  });
});

// Preview-vs-nav stacking fix, 2026-09 — PreviewModal is a `fixed inset-0
// z-[92]` overlay that painted over the (unpositioned) sidebar entirely,
// since a static element's z-index is inert regardless of value. happy-dom
// can't assert real paint order, so this pins the class contract the fix
// depends on instead — a real browser check happens on the Vercel preview.
describe('SidebarV2 — stacks above PreviewModal (z-[92]) and below the kebab-delete toast (z-[100])', () => {
  it('is a positioned element with z-[93], both desktop-docked and mobile-overlay', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    expect(sidebar().className).toContain('relative');
    expect(sidebar().className).toContain('z-[93]');
    cleanup();

    // Mobile overlay usage (onClose provided, no forceCollapsed) is the same
    // <aside> — confirms the bump isn't accidentally scoped to one caller.
    render(<SidebarV2 stories={[]} writingPrompts={[]} onClose={vi.fn()} expandedWidthClassName="w-full" />);
    expect(sidebar().className).toContain('relative');
    expect(sidebar().className).toContain('z-[93]');
  });
});

// Found in review, 2026-09: the z-[93] bump above ALSO floated the nav above
// several genuinely blocking, "confirm before you do anything else" modals
// that were never meant to be escapable — a different category from the
// panel-replacement overlays (Preview, MediaPage) z-[93] is actually for.
// Reads each modal's source directly rather than fully rendering it (each
// needs its own mocked props/stores just to reach this one className) —
// same convention as this codebase's other CSS-only regression tests (e.g.
// the .hl-animate-slide-right fill-mode test reads globals.css as text).
// Pins the INVARIANT (must clear the sidebar), not one-off numbers, so a
// future sidebar z-index change can't silently reintroduce this gap.
describe('SidebarV2 — the blocking-modal tier stays above the sidebar (z-[93])', () => {
  function zIndexOf(file: string): number {
    const source = readFileSync(join(__dirname, file), 'utf-8');
    const match = source.match(/z-\[(\d+)\]/);
    if (!match) throw new Error(`No z-[...] class found in ${file}`);
    return Number(match[1]);
  }

  it.each([
    'BeginStoryModal.tsx',
    'ShareHeirloomModal.tsx',
    'ConfirmDeleteModal.tsx',
    'CoverBackPanel.tsx',
  ])('%s\'s backdrop sits above the sidebar', (file) => {
    expect(zIndexOf(file)).toBeGreaterThan(93);
  });

  it('both of InviteCollaboratorsModal\'s backdrops (outer + nested warning) sit above the sidebar', () => {
    const source = readFileSync(join(__dirname, 'InviteCollaboratorsModal.tsx'), 'utf-8');
    const matches = [...source.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const z of matches) {
      expect(z).toBeGreaterThan(93);
    }
  });
});
