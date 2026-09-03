// Long-press → row action menu on mobile (2026-08-17), the companion fix to
// SidebarV2.touchTapTargets.test.tsx's single-tap fix (#25a). That fix
// guarded every hover utility behind `[@media(hover:hover)]:`, which as a
// deliberate, documented side effect (see System Docs/Known Gaps.md, "Sidebar
// row controls are unreachable on touch until long-press lands") left the
// kebab/invite/start-chat row controls unreachable on touch entirely until
// this shipped.
//
// TEST PLAN
//   1. Mobile (viewport <= 768px): a 450ms hold on a session row opens that
//      row's RowMenu — same menuId/menuRect state the desktop kebab's onClick
//      already drives, so this is the regression guard that the new trigger
//      path actually reaches it.
//   2. A hold released before 450ms is just a normal short tap: no menu, and
//      the row's own tap-to-select (#25a) still fires exactly once — long
//      press must never regress plain taps.
//   3. A touch that moves past the drift threshold before the timer fires
//      cancels the press — a scroll must not also open a menu.
//   4. A completed long-press must not also select the row: the trailing
//      click is a defense-in-depth check (touchend's preventDefault is the
//      primary guard, unverifiable in jsdom, so this asserts the fallback
//      ref-check inside the row's onClick).
//   5. Desktop (no viewport override, > 768px): long-press is not wired up at
//      all — holding for 450ms does nothing, proving the isMobile gate.
//   6. Story rows: same open-the-menu behavior, and firing the long press
//      also reveals the row's invite/start-chat icons — both already key
//      their opacity off `isMenuOpen`, not just hover, so setting menuId from
//      a long-press is sufficient without touching RowMenu.
//   7. storiesDisabled: the inert "soon" section renders no kebab at all, so
//      a long-press there must not open a menu either.
//
// Deliberately NOT covered: the CSS press-building highlight (pressingId) and
// the haptic tick (navigator.vibrate) — both are presentational/best-effort
// and not part of the interaction contract this file guards.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const loadSession = vi.fn();

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true, sessionId: null },
    recentSessions: [
      { id: 'session-1', title: 'A conversation', memoryCount: 0, starred: false },
    ],
    loadSession: (...args: unknown[]) => loadSession(...args),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

// happy-dom's real matchMedia evaluates `(max-width: 768px)` against
// window.innerWidth — same technique ChatHero.mobileSidebarScrim.test.tsx uses.
function setViewport(width: number) {
  (window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }).happyDOM.setViewport({
    width,
  });
}

function touch(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] };
}

function renderSidebar(overrides: Partial<Parameters<typeof SidebarV2>[0]> = {}) {
  const onSelectStory = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SidebarV2
      stories={[{ id: 'story-1', name: 'A Story', isOwner: true }]}
      writingPrompts={[]}
      onRowAction={vi.fn()}
      onInviteStory={vi.fn()}
      onStartStoryChat={vi.fn()}
      onSelectStory={onSelectStory}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...utils, onSelectStory, onClose };
}

/** The session row's outer wrapper div — where the long-press handlers live. */
function sessionRow() {
  return screen.getByRole('button', { name: 'A conversation' }).closest('div.group') as HTMLElement;
}

function storyRow() {
  return screen.getByRole('button', { name: 'A Story' }).closest('div.group') as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  loadSession.mockReset();
  vi.useRealTimers();
  setViewport(1024);
});

describe('SidebarV2 — long-press opens the row menu (mobile)', () => {
  beforeEach(() => setViewport(390));

  it('a 450ms hold on a session row opens its RowMenu', () => {
    renderSidebar();
    const row = sessionRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('releasing before 450ms does not open a menu, and the tap still selects the row', () => {
    renderSidebar();
    const row = sessionRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.touchEnd(row);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A conversation' }));
    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledWith('session-1');
  });

  it('a touch that drifts past the move threshold cancels the press', () => {
    renderSidebar();
    const row = sessionRow();

    fireEvent.touchStart(row, touch(50, 50));
    fireEvent.touchMove(row, touch(80, 50)); // 30px drift > 10px threshold
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // the row's own tap-to-select must still work after a cancelled press
    fireEvent.click(screen.getByRole('button', { name: 'A conversation' }));
    expect(loadSession).toHaveBeenCalledTimes(1);
  });

  it('a completed long-press does not also fire the row select on the trailing click', () => {
    renderSidebar();
    const row = sessionRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.touchEnd(row);
    // Simulates the fallback where a browser's trailing synthetic click isn't
    // suppressed — the row's own onClick ref-check must still block select.
    fireEvent.click(screen.getByRole('button', { name: 'A conversation' }));

    expect(loadSession).not.toHaveBeenCalled();
  });

  it('touchcancel (e.g. an interruption) cancels the press same as touchend', () => {
    renderSidebar();
    const row = sessionRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.touchCancel(row);
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('SidebarV2 — long-press is mobile-only', () => {
  it('does nothing on a desktop-width viewport', () => {
    renderSidebar();
    const row = sessionRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('SidebarV2 — long-press on story rows', () => {
  beforeEach(() => setViewport(390));

  it('opens the story RowMenu and reveals invite/start-chat, which share isMenuOpen', () => {
    renderSidebar();
    const row = storyRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a chat in A Story' }).className).toContain(
      'opacity-100',
    );
    expect(
      screen.getByRole('button', { name: 'Invite collaborators to A Story' }).className,
    ).toContain('opacity-100');
  });

  it('a short tap on a story row still just selects it', () => {
    const { onSelectStory } = renderSidebar();
    const row = storyRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.touchEnd(row);

    fireEvent.click(screen.getByRole('button', { name: 'A Story' }));
    expect(onSelectStory).toHaveBeenCalledTimes(1);
    expect(onSelectStory).toHaveBeenCalledWith('story-1');
  });

  it('does not open a menu for an inert (storiesDisabled) story row', () => {
    renderSidebar({ storiesDisabled: true });
    const row = storyRow();

    fireEvent.touchStart(row, touch(50, 50));
    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
