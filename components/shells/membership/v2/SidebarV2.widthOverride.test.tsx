import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

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
