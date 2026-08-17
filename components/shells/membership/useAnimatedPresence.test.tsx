// Unit coverage for the mobile drawer's exit-animation timing (2026-08-17).
//
// The mobile sidebar had an entrance animation (hl-animate-sheet-left) and no
// exit: ChatHero renders it conditionally, so closing unmounted the node on
// the same tick and the reverse keyframe never got to run. This hook is the
// one central mechanism that delays the unmount; every close trigger routes
// through it rather than carrying its own delay.
//
// TEST PLAN — timing and presence, which is all this hook owns:
//   1. Opening is synchronous. No animation gate on the way in — the entrance
//      keyframe plays on mount, so presence must be immediate or the element
//      misses its own first frame.
//   2. Closing keeps the element mounted for exactly the exit duration, with
//      isExiting true for that whole window and false again once it unmounts.
//      A too-early unmount is the original bug; a stuck isExiting would leave
//      the exit class applied to a re-opened drawer.
//   3. Rapid re-open mid-exit — the edge case called out in the task. The
//      element must stay mounted, drop isExiting, and critically must NOT
//      unmount when the original timer would have fired. That cancelled timer
//      is the thing that would otherwise yank an open drawer off screen a
//      moment after the user re-opened it.
//   4. Repeated close→open→close cycles settle correctly, so the cancel path
//      cannot leak a timer that unmounts a later, legitimately-open drawer.
//   5. Zero duration (the reduced-motion path) unmounts on the next macrotask
//      rather than waiting out an animation that the stylesheet has disabled.
//   6. A closed element never schedules anything, and unmounting mid-exit
//      cannot fire a timer into a dead tree.
//
// Fake timers throughout: this is a hook about elapsed milliseconds, so the
// assertions are about exact boundaries rather than "eventually".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimatedPresence } from './useAnimatedPresence';

const EXIT_MS = 240;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useAnimatedPresence — opening', () => {
  it('is present immediately when it starts open', () => {
    const { result } = renderHook(() => useAnimatedPresence(true, EXIT_MS));

    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(false);
  });

  it('is absent when it starts closed, and schedules nothing', () => {
    const { result } = renderHook(() => useAnimatedPresence(false, EXIT_MS));

    expect(result.current.isPresent).toBe(false);
    expect(result.current.isExiting).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('becomes present on the same tick it is opened', () => {
    const { result, rerender } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: false },
    });

    rerender({ open: true });

    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(false);
  });
});

describe('useAnimatedPresence — closing', () => {
  it('stays mounted and marked exiting for the full duration, then unmounts', () => {
    const { result, rerender } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: true },
    });

    rerender({ open: false });

    // The whole point: still on screen, now playing its exit.
    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(true);

    // One millisecond short of the duration it must still be there — this is
    // the assertion that fails if someone shortens the delay below the CSS.
    act(() => { vi.advanceTimersByTime(EXIT_MS - 1); });
    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(true);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.isPresent).toBe(false);
    expect(result.current.isExiting).toBe(false);
  });

  it('leaves no timer pending once it has unmounted', () => {
    const { rerender } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(EXIT_MS); });

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useAnimatedPresence — rapid re-open during the exit animation', () => {
  it('cancels the pending unmount and stays mounted past the original deadline', () => {
    const { result, rerender } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(100) }); // mid-flight
    expect(result.current.isExiting).toBe(true);

    rerender({ open: true });

    // Never left the DOM, and no longer exiting — so the caller swaps the exit
    // class back for the entrance one on a node that was continuously mounted.
    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    // The regression that matters: the original timer must not still be armed.
    // If it were, the drawer the user just re-opened would vanish here.
    act(() => { vi.advanceTimersByTime(EXIT_MS * 2); });
    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(false);
  });

  it('survives a burst of close/open toggles and settles open', () => {
    const { result, rerender } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: true },
    });

    for (let i = 0; i < 5; i++) {
      rerender({ open: false });
      act(() => { vi.advanceTimersByTime(20); });
      rerender({ open: true });
      act(() => { vi.advanceTimersByTime(20); });
    }

    act(() => { vi.advanceTimersByTime(EXIT_MS * 2); });
    expect(result.current.isPresent).toBe(true);
    expect(result.current.isExiting).toBe(false);
  });

  it('settles closed when the burst ends on a close', () => {
    const { result, rerender } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: true },
    });

    for (let i = 0; i < 3; i++) {
      rerender({ open: false });
      act(() => { vi.advanceTimersByTime(30); });
      rerender({ open: true });
      act(() => { vi.advanceTimersByTime(30); });
    }
    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(EXIT_MS); });

    expect(result.current.isPresent).toBe(false);
    expect(result.current.isExiting).toBe(false);
  });
});

describe('useAnimatedPresence — reduced motion (zero duration)', () => {
  it('unmounts on the next macrotask instead of waiting out a disabled animation', () => {
    const { result, rerender } = renderHook(({ open }) => useAnimatedPresence(open, 0), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    act(() => { vi.advanceTimersByTime(0); });

    expect(result.current.isPresent).toBe(false);
    expect(result.current.isExiting).toBe(false);
  });
});

describe('useAnimatedPresence — teardown', () => {
  it('clears a pending exit timer when the component unmounts mid-animation', () => {
    const { rerender, unmount } = renderHook(({ open }) => useAnimatedPresence(open, EXIT_MS), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
