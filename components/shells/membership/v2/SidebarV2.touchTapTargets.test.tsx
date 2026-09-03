// Covers the mobile single-tap fix (2026-08-16): sidebar rows used to need
// two taps on iOS Safari — the first only "armed" the hover state (row
// background highlight + the kebab/invite/start-chat reveal), the second
// fired the real onClick (loadSession / onSelectStory).
//
// Root cause: every `hover:`/`group-hover:` utility in SidebarV2 compiled to
// a bare `:hover` pseudo-class (tailwind.config.js does not enable
// `hoverOnlyWhenSupported`, and this repo is on Tailwind v3 where that is
// opt-in). WebKit's touch heuristic suppresses the first tap's click when the
// synthesized hover changes what's rendered under the finger — which is
// exactly what a row-background change plus an opacity-0 → opacity-100 icon
// reveal does.
//
// TEST PLAN
//   1. Class contract (the real regression guard). jsdom cannot reproduce
//      WebKit's tap heuristic, so the durable assertion is structural: no
//      element SidebarV2 renders — including the RowMenu portal, which lands
//      on document.body rather than inside `container` — may carry an
//      unguarded `hover:`/`group-hover:` utility. Every one must be prefixed
//      with `[@media(hover:hover)]:`. This fails on any future unguarded
//      hover class added to the component, which a behavioural test in jsdom
//      never would.
//   2. Reveal controls are inert on touch. The kebab/invite/start-chat
//      buttons stay in the DOM at opacity-0 on touch devices; without
//      `[@media(hover:none)]:pointer-events-none` they would be invisible but
//      still tappable, so a tap near the right edge of a row would hit an
//      unseeable control instead of selecting the row.
//   3. Single activation still fires the row's real action — one click, one
//      loadSession/onSelectStory. Session rows also assert (2026-08-17) that
//      SidebarV2 itself never calls onClose as a side effect of selection —
//      story rows have no such assertion here since SidebarV2 only forwards
//      onSelectStory; whether a story tap closes the mobile sidebar is
//      decided one level up, in ChatHero's handleSelectStory (it does, but
//      only when the story is non-empty and StoryView actually opens — see
//      ChatHero.selectStory.test.tsx). Passes before the fix too (jsdom has
//      no hover heuristic); it is here so the guard classes can never be
//      "fixed" by breaking selection itself.
//
// Deliberately NOT covered: desktop hover reveal. That is pure CSS inside a
// media query jsdom does not evaluate — verified on the Vercel preview.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const loadSession = vi.fn();

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true, sessionId: null },
    recentSessions: [
      { id: 'session-1', title: 'A conversation', memoryCount: 2, starred: false },
    ],
    loadSession: (...args: unknown[]) => loadSession(...args),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

afterEach(() => {
  cleanup();
  loadSession.mockReset();
});

const HOVER_GUARD = '[@media(hover:hover)]:';
const TOUCH_ONLY = '[@media(hover:none)]:';

/** Every class token currently in the document, portal content included. */
function allClassTokens(): { token: string; el: Element }[] {
  return Array.from(document.body.querySelectorAll('[class]')).flatMap((el) =>
    el.className
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => ({ token, el })),
  );
}

/** A token is unguarded when it applies a hover utility outside a (hover: hover) query. */
function isUnguardedHover(token: string): boolean {
  if (token.startsWith(HOVER_GUARD) || token.startsWith(TOUCH_ONLY)) return false;
  return /(?:^|:)(?:group-)?hover:/.test(token);
}

function renderFullSidebar() {
  return render(
    <SidebarV2
      stories={[{ id: 'story-1', name: 'A Story', isOwner: true }]}
      writingPrompts={[{ id: 'wp-1', text: 'Tell me about a first job.' }]}
      starredConversationIds={['session-1']}
      starredStoryIds={['story-1']}
      onRowAction={vi.fn()}
      onInviteStory={vi.fn()}
      onStartStoryChat={vi.fn()}
      onSelectStory={vi.fn()}
      onCreateStory={vi.fn()}
      onMedia={vi.fn()}
      onShareHeirloom={vi.fn()}
      onSelectPrompt={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('SidebarV2 — hover styles are guarded behind (hover: hover)', () => {
  it('renders no unguarded hover: / group-hover: utility anywhere in the sidebar', () => {
    renderFullSidebar();

    const offenders = allClassTokens().filter(({ token }) => isUnguardedHover(token));

    expect(
      offenders.map(({ token }) => token),
      'unguarded hover utilities re-introduce the iOS two-tap bug',
    ).toEqual([]);
  });

  it('renders no unguarded hover: / group-hover: utility inside an open row menu', () => {
    renderFullSidebar();
    // RowMenu portals to document.body, so it is invisible to a container-only
    // scan and needs opening explicitly.
    fireEvent.click(screen.getByRole('button', { name: 'Conversation options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const offenders = allClassTokens().filter(({ token }) => isUnguardedHover(token));

    expect(offenders.map(({ token }) => token)).toEqual([]);
  });

  it('makes the hover-revealed row controls non-tappable on touch devices', () => {
    renderFullSidebar();

    for (const name of [
      'Conversation options',
      'Story options',
      'Start a chat in A Story',
      'Invite collaborators to A Story',
    ]) {
      expect(
        screen.getByRole('button', { name }).className,
        `${name} is invisible on touch — it must not stay tappable`,
      ).toContain(`${TOUCH_ONLY}pointer-events-none`);
    }
  });
});

describe('SidebarV2 — a single activation selects the row', () => {
  it('one click on a session row loads it without closing the mobile overlay', () => {
    const onClose = vi.fn();
    render(
      <SidebarV2
        stories={[]}
        writingPrompts={[]}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'A conversation' }));

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledWith('session-1');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('one click on a story row selects it', () => {
    const onSelectStory = vi.fn();
    render(
      <SidebarV2
        stories={[{ id: 'story-1', name: 'A Story', isOwner: true }]}
        writingPrompts={[]}
        onSelectStory={onSelectStory}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'A Story' }));

    expect(onSelectStory).toHaveBeenCalledTimes(1);
    expect(onSelectStory).toHaveBeenCalledWith('story-1');
  });
});
