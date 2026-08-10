// Covers a regression where the Stories "Create" button's className carried
// two unconditional, trailing classes (opacity-40 pointer-events-none) with
// no disabled: prefix — independent of the button's real
// disabled={storiesDisabled || !onCreateStory} logic. The button was
// functionally enabled (correct disabled prop, correct onClick wiring) but
// rendered permanently greyed out and unclickable regardless of state.
//
// A test that only asserts on the `disabled` attribute/prop can't catch
// this class of bug — the disabled logic was correct all along. This test
// inspects the rendered class list directly instead.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('../chatStore', () => ({
  useChatStore: () => ({
    state: { isMember: true },
    recentSessions: [],
    loadSession: vi.fn(),
    newChat: vi.fn(),
  }),
}));

import { SidebarV2 } from './SidebarV2';

afterEach(cleanup);

describe('SidebarV2 — Stories Create button', () => {
  it('renders enabled (not greyed out, not pointer-events-none) and is clickable when storiesDisabled is omitted and onCreateStory is supplied', () => {
    const onCreateStory = vi.fn();
    render(<SidebarV2 stories={[]} writingPrompts={[]} onCreateStory={onCreateStory} />);

    const button = screen.getByRole('button', { name: /create/i });

    expect(button).not.toBeDisabled();
    expect(button.className).not.toMatch(/(?:^|\s)opacity-40(?:\s|$)/);
    expect(button.className).not.toMatch(/(?:^|\s)pointer-events-none(?:\s|$)/);

    fireEvent.click(button);
    expect(onCreateStory).toHaveBeenCalledTimes(1);
  });

  it('still renders disabled (greyed out) when storiesDisabled is true', () => {
    const onCreateStory = vi.fn();
    render(
      <SidebarV2 stories={[]} writingPrompts={[]} onCreateStory={onCreateStory} storiesDisabled />
    );

    const button = screen.getByRole('button', { name: /create/i });

    expect(button).toBeDisabled();
    expect(button.className).toMatch(/disabled:opacity-40/);

    fireEvent.click(button);
    expect(onCreateStory).not.toHaveBeenCalled();
  });
});
