'use client';

/**
 * Typed, defaulted wrapper around `react-pageflip`'s HTMLFlipBook.
 *
 * Absorbs the three inherent frictions in the library's types:
 *  1. Every one of the 21 settings props is typed as required (README says
 *     only width/height are). We spread engine defaults so callers pass only
 *     what they mean.
 *  2. The ref handle is `any`. We expose `FlipBookHandle`.
 *  3. Event payloads are `any`. We expose typed event callbacks.
 *
 * It also fixes two runtime hazards in the wrapper:
 *  4. Stale handlers: react-pageflip only (re)binds `on*` callbacks when the
 *     page list changes, so a parent's new closure is never seen. We bind
 *     stable trampolines that read the latest callback from a ref.
 *  5. No unmount cleanup: the engine registers window-level listeners and
 *     react-pageflip never destroys it. We tear the UI layer down on unmount.
 */

import { useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { IFlipSetting } from 'react-pageflip/build/html-flip-book/settings';
import type {
  ChangeOrientationEvent,
  ChangeStateEvent,
  FlipBookHandle,
  FlipEvent,
  InitEvent,
  PageFlipApi,
  UpdateEvent,
} from './pageFlipTypes';

/** Mirrors `Settings._default` in page-flip/src/Settings.ts (v2.0.7). */
const ENGINE_DEFAULTS: Omit<IFlipSetting, 'width' | 'height'> = {
  startPage: 0,
  size: 'fixed',
  minWidth: 0,
  maxWidth: 0,
  minHeight: 0,
  maxHeight: 0,
  drawShadow: true,
  flippingTime: 1000,
  usePortrait: true,
  startZIndex: 0,
  autoSize: true,
  maxShadowOpacity: 1,
  showCover: false,
  mobileScrollSupport: true,
  swipeDistance: 30,
  clickEventForward: true,
  useMouseEvents: true,
  showPageCorners: true,
  disableFlipByClick: false,
};

export interface FlipBookEvents {
  onFlip?: (event: FlipEvent) => void;
  onChangeState?: (event: ChangeStateEvent) => void;
  onChangeOrientation?: (event: ChangeOrientationEvent) => void;
  onInit?: (event: InitEvent) => void;
  onUpdate?: (event: UpdateEvent) => void;
}

export interface FlipBookProps extends Partial<Omit<IFlipSetting, 'width' | 'height'>>, FlipBookEvents {
  /** Engine throws at construction if either is <= 0, even in `stretch` mode. */
  width: number;
  height: number;
  className?: string;
  /** HTMLFlipBook types `style` as required; we default it. Prefer className. */
  style?: CSSProperties;
  children: ReactNode;
  ref?: Ref<FlipBookHandle>;
}

export function FlipBook({
  width,
  height,
  className = '',
  style,
  children,
  onFlip,
  onChangeState,
  onChangeOrientation,
  onInit,
  onUpdate,
  ref,
  ...settings
}: FlipBookProps) {
  // (4) Latest-callback refs so the engine always sees the current handler.
  const handlers = useRef<FlipBookEvents>({});
  handlers.current = { onFlip, onChangeState, onChangeOrientation, onInit, onUpdate };

  const inner = useRef<FlipBookHandle | null>(null);
  /** Engine instance, captured from the first event that carries it. */
  const engine = useRef<PageFlipApi | null>(null);
  const pendingTeardown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({ pageFlip: () => inner.current?.pageFlip() }), []);

  // (5) Tear the engine's UI layer (DOM + window listeners) down on real unmount.
  //   - Layout phase, not passive: React has already nulled `inner` by the time
  //     a passive cleanup runs, so a useEffect cleanup silently does nothing.
  //   - Deferred by a macrotask and cancelled on re-setup so React StrictMode's
  //     simulated unmount/remount in dev does not destroy a live book.
  //   - `getUI().destroy()` rather than `destroy()`: the latter removes the
  //     React-owned root div and React then throws on unmount (removeChild).
  useLayoutEffect(() => {
    if (pendingTeardown.current !== null) {
      clearTimeout(pendingTeardown.current);
      pendingTeardown.current = null;
    }
    return () => {
      const instance = engine.current ?? inner.current?.pageFlip() ?? null;
      pendingTeardown.current = setTimeout(() => {
        instance?.getUI().destroy();
        engine.current = null;
        pendingTeardown.current = null;
      }, 0);
    };
  }, []);

  return (
    <HTMLFlipBook
      ref={inner}
      {...ENGINE_DEFAULTS}
      {...settings}
      width={width}
      height={height}
      className={className}
      style={style ?? {}}
      onFlip={(e: FlipEvent) => handlers.current.onFlip?.(e)}
      onChangeState={(e: ChangeStateEvent) => handlers.current.onChangeState?.(e)}
      onChangeOrientation={(e: ChangeOrientationEvent) => handlers.current.onChangeOrientation?.(e)}
      onInit={(e: InitEvent) => {
        engine.current = e.object;
        handlers.current.onInit?.(e);
      }}
      onUpdate={(e: UpdateEvent) => handlers.current.onUpdate?.(e)}
    >
      {children}
    </HTMLFlipBook>
  );
}
