/**
 * Hand-written types for the `page-flip` engine surface we use.
 *
 * Why this file exists: `page-flip` ships no `.d.ts`, its raw `src/*.ts`
 * fails our strict config (30+ strict-null errors), and `react-pageflip`
 * types its ref handle as `any` and its event payloads as `any`. This is
 * the one place we assert the runtime shape, derived from reading
 * page-flip/src/PageFlip.ts, Flip/Flip.ts and Event/EventObject.ts (v2.0.7).
 */

export type PageFlipState = 'user_fold' | 'fold_corner' | 'flipping' | 'read';
export type PageFlipOrientation = 'portrait' | 'landscape';
export type PageFlipCorner = 'top' | 'bottom';

/** Subset of `PageFlip` (page-flip/src/PageFlip.ts) that product code may call. */
export interface PageFlipApi {
  /** Animated flips. */
  flipNext(corner?: PageFlipCorner): void;
  flipPrev(corner?: PageFlipCorner): void;
  flip(page: number, corner?: PageFlipCorner): void;
  /** Instant (non-animated) page changes. */
  turnToPage(page: number): void;
  turnToNextPage(): void;
  turnToPrevPage(): void;
  /** Read-only state. */
  getCurrentPageIndex(): number;
  getPageCount(): number;
  getOrientation(): PageFlipOrientation;
  getState(): PageFlipState;
  /** Lifecycle. */
  update(): void;
  destroy(): void;
  getUI(): { destroy(): void };
}

/** Shape of the imperative handle exposed by `react-pageflip`'s `useImperativeHandle`. */
export interface FlipBookHandle {
  pageFlip(): PageFlipApi | undefined;
}

/** Event object shape from page-flip/src/Event/EventObject.ts. */
export interface PageFlipEvent<TData> {
  data: TData;
  object: PageFlipApi;
}

export interface PageFlipInitData {
  page: number;
  mode: PageFlipOrientation;
}

export type FlipEvent = PageFlipEvent<number>;
export type ChangeStateEvent = PageFlipEvent<PageFlipState>;
export type ChangeOrientationEvent = PageFlipEvent<PageFlipOrientation>;
export type InitEvent = PageFlipEvent<PageFlipInitData>;
export type UpdateEvent = PageFlipEvent<PageFlipInitData>;
