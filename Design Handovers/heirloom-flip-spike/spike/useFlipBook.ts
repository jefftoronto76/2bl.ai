import { useCallback, useRef, useState } from 'react';

export type FlipDirection = 'forward' | 'back';
export type FlipPhase = 'idle' | 'flipping';

export interface FlipBookState {
  pageIndex: number;
  pageCount: number;
  phase: FlipPhase;
  /** Direction of the flip in progress; null while idle. */
  direction: FlipDirection | null;
  canNext: boolean;
  canPrev: boolean;
}

export interface FlipBookActions {
  /** Advance immediately. Returns false when refused (at the end, or a flip is in progress). */
  next: () => boolean;
  prev: () => boolean;
  /** Called by the surface when its animation has finished. */
  settle: () => void;
}

interface Internal {
  pageIndex: number;
  phase: FlipPhase;
  direction: FlipDirection | null;
}

/**
 * State model for the read view: state changes first, the surface animates in
 * response. One flip at a time; the synchronous lock closes the window between
 * two clicks that land before React re-renders.
 */
export function useFlipBook(pageCount: number, initialIndex = 0): FlipBookState & FlipBookActions {
  const [state, setState] = useState<Internal>({ pageIndex: initialIndex, phase: 'idle', direction: null });
  const lock = useRef(false);
  const index = useRef(initialIndex);

  const move = useCallback(
    (direction: FlipDirection): boolean => {
      if (lock.current) return false;
      const target = direction === 'forward' ? index.current + 1 : index.current - 1;
      if (target < 0 || target > pageCount - 1) return false;
      lock.current = true;
      index.current = target;
      setState({ pageIndex: target, phase: 'flipping', direction });
      return true;
    },
    [pageCount],
  );

  const next = useCallback(() => move('forward'), [move]);
  const prev = useCallback(() => move('back'), [move]);

  const settle = useCallback(() => {
    lock.current = false;
    setState((s) => (s.phase === 'idle' ? s : { ...s, phase: 'idle', direction: null }));
  }, []);

  return {
    ...state,
    pageCount,
    canNext: state.pageIndex < pageCount - 1,
    canPrev: state.pageIndex > 0,
    next,
    prev,
    settle,
  };
}
