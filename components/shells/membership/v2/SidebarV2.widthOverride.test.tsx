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

// forceCollapsed is a default, not a lock (story-deck workspace fixes
// item 1, 2026-09). Expanding the Nav grows the Workspace itself instead of
// squeezing an open panel, so a manual expand clicked while a panel is open
// takes effect immediately. Opening a panel (forceCollapsed false→true)
// still auto-collapses to the rail. This supersedes the 2026-09-22 fix,
// which kept the toggle clickable but deferred its visual effect until the
// panel closed.
describe('SidebarV2 — manual expand wins over forceCollapsed', () => {
  it('auto-collapses to the rail when forceCollapsed is set, with a clickable Expand toggle', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);

    expect(sidebar().className).toContain('w-12');
    // Label/rotation now track the RENDERED state, not the stored preference.
    const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(toggle).toBeEnabled();
  });

  it('a manual expand while forceCollapsed takes effect immediately', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(sidebar().className).toContain('w-64');
    expect(sidebar().className).not.toContain('w-12');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(sidebar().className).toContain('w-12');
  });

  it('re-collapses to the rail each time a panel opens (forceCollapsed false→true)', () => {
    const { rerender } = render(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(sidebar().className).toContain('w-64');

    // Panel closes, then a new one opens.
    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed={false} />);
    expect(sidebar().className).toContain('w-64');
    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);
    expect(sidebar().className).toContain('w-12');
  });

  it('keeps the member\'s last explicit choice once the panel closes', () => {
    // Collapsed before any panel, expanded manually while one is open →
    // stays expanded after it closes.
    const { rerender } = render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed={false} />);
    expect(sidebar().className).toContain('w-64');

    // Expanded before, left at the auto-rail during the panel → back to
    // expanded after (the auto-collapse never touched the preference).
    cleanup();
    const second = render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    second.rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed />);
    expect(sidebar().className).toContain('w-12');
    second.rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed={false} />);
    expect(sidebar().className).toContain('w-64');
  });

  it('reports its rendered state through onRenderedExpandedChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SidebarV2 stories={[]} writingPrompts={[]} onRenderedExpandedChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<SidebarV2 stories={[]} writingPrompts={[]} forceCollapsed onRenderedExpandedChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('animates width on the drawer\'s own curve so Chat holds steady while both move', () => {
    render(<SidebarV2 stories={[]} writingPrompts={[]} />);
    expect(sidebar().className).toContain('duration-500');
    expect(sidebar().className).toContain('ease-[cubic-bezier(.22,1,.36,1)]');
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
