'use client';

// components/shells/membership/v2/ChatDrawerV2.tsx
//
// The right-anchored chat drawer with a two-state expansion:
//   • default     — sized by `defaultWidthClassName` (the app's current width)
//   • full screen — 100vw, driven by the `isFullScreen` prop
//
// Pure presentation: the parent owns isOpen / isFullScreen and the handlers.
//
// The built-in header (title + expand + close) is optional. The Heirloom mount
// passes showHeader={false} and keeps the v1 ChatHeader inside children — it
// carries the account dropdown, sign-in telemetry (logAuthStep), and the
// OAuth-popup exit-warning flag, none of which this minimal header has. The
// full-screen toggle lives in ChatHeader's right cluster in that setup.
//
// The body is position: relative — the V2 modals use `absolute inset-0`, so
// they overlay the drawer (below the header), not the whole page. This body
// also publishes itself as the overlay host (ChatOverlayProvider) so
// descendants (e.g. ChatInput's VoiceImmersive portal) can use `absolute
// inset-0` overlays that are transform-safe and drawer-relative.
//
// Workspace sizing (story-deck workspace fixes, 2026-09): the body also
// provides WorkspaceContext, so descendants can ask the drawer itself to
// grow instead of squeezing what shares its row:
//   • 'navExpanded'      → `navExpandedWidthClassName` in place of the
//                          default width (the docked Nav's rail→expanded
//                          delta), so Chat/panels keep their exact widths.
//   • 'landscapePreview' → a min-width wide enough for PreviewModal's
//                          Landscape page (min-width beats width, so this
//                          reads as max(current width, landscape width)).
// Full screen (100vw) ignores both — there's no room left to grow, so the
// content inside absorbs the difference in that case only.

import { ReactNode, useCallback, useMemo, useState } from 'react';
import { ChevronDown, Maximize2, Minimize2, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { ChatOverlayProvider } from './ChatOverlayHost';
import { WorkspaceProvider, type WorkspaceContextValue, type WorkspaceWidthRequest } from './WorkspaceContext';

export interface ChatDrawerV2Props {
  /** Slide the drawer in (true) or off-screen (false). Default true. */
  isOpen?: boolean;
  /** Full-screen (100vw) when true; otherwise `defaultWidthClassName`. */
  isFullScreen: boolean;
  /** Toggle between default width and full screen. */
  onToggleFullScreen: () => void;
  /** Close the drawer (X). */
  onClose: () => void;
  /** Header title on the left. Default "Your Story". */
  title?: string;
  /**
   * Render the built-in minimal header (title + expand + close). Pass false
   * when the drawer content provides its own header (e.g. the v1 ChatHeader).
   * Default true.
   */
  showHeader?: boolean;
  /**
   * Tailwind width class for the DEFAULT (non-full-screen) state. Keep this in
   * sync with the app's current drawer width — that value is owned by whatever
   * mounts the drawer today, so it's passed in rather than hard-coded.
   * Default: w-[clamp(680px,50vw,1120px)].
   */
  defaultWidthClassName?: string;
  /**
   * Tailwind width class used instead of `defaultWidthClassName` while a
   * descendant reports the docked Nav as expanded (WorkspaceContext
   * 'navExpanded'). Should equal the default width plus the Nav's
   * rail→expanded delta. Omit it and the Nav never grows the drawer.
   */
  navExpandedWidthClassName?: string;
  /** Drawer body — typically <Sidebar/> + header content + transcript. */
  children: ReactNode;
}

export function ChatDrawerV2({
  isOpen = true,
  isFullScreen,
  onToggleFullScreen,
  onClose,
  title = 'Your Story',
  showHeader = true,
  defaultWidthClassName = 'w-[clamp(680px,50vw,1120px)]',
  navExpandedWidthClassName,
  children,
}: ChatDrawerV2Props) {
  // Published to descendants so they can portal overlays into this body.
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);

  const [requests, setRequests] = useState<Record<WorkspaceWidthRequest, boolean>>({
    navExpanded: false,
    landscapePreview: false,
  });
  const setWidthRequest = useCallback((key: WorkspaceWidthRequest, active: boolean) => {
    setRequests((prev) => (prev[key] === active ? prev : { ...prev, [key]: active }));
  }, []);
  const workspace = useMemo<WorkspaceContextValue>(
    () => ({ isFullScreen, onToggleFullScreen, setWidthRequest }),
    [isFullScreen, onToggleFullScreen, setWidthRequest],
  );

  const widthClassName = isFullScreen
    ? 'w-screen'
    : requests.navExpanded && navExpandedWidthClassName
    ? navExpandedWidthClassName
    : defaultWidthClassName;
  // Static arbitrary value so Tailwind can see it. 1.286 and 660px/74vh
  // are PreviewModal's own Landscape ratio and desktop page-height cap;
  // +232px = ~136px for its arrows/gaps/padding plus 2×48px so the Nav
  // rail (z-[93], above Preview) never covers the left arrow.
  const landscapeClassName =
    !isFullScreen && requests.landscapePreview
      ? 'min-w-[min(100vw,calc(min(74vh,660px)*1.286+232px))]'
      : '';

  return (
    <div
      className={[
        'fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-background',
        'shadow-[-30px_0_80px_-30px_rgba(0,0,0,0.7)]',
        'transition-[transform,width,min-width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]',
        widthClassName,
        landscapeClassName,
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      ].join(' ')}
      role="dialog"
      aria-label={title}
      aria-modal="true"
      aria-hidden={!isOpen}
      // React 19 boolean `inert`: while closed, the off-screen drawer is
      // removed from the tab order and the accessibility tree entirely —
      // translate-x alone leaves its content keyboard-reachable.
      inert={!isOpen}
    >
      {showHeader && (
        <header className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
          <button
            type="button"
            className="flex items-center gap-1.5 font-body text-text-primary font-semibold text-base hover:bg-text-primary/10 rounded-lg px-2 py-1.5 transition-colors"
          >
            <span>{title}</span>
            <ChevronDown size={14} className="text-text-muted" />
          </button>

          <div className="flex items-center gap-1">
            <IconButton
              label={isFullScreen ? 'Exit full screen' : 'Expand to full screen'}
              onClick={onToggleFullScreen}
              className="relative before:absolute before:content-[''] before:-inset-y-1 before:-inset-x-[2px]"
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
            <IconButton
              label="Close"
              onClick={onClose}
              className="relative before:absolute before:content-[''] before:-inset-y-1 before:-inset-x-[2px]"
            >
              <X size={18} />
            </IconButton>
          </div>
        </header>
      )}

      {/* Body — `relative`; the V2 modals AND the VoiceImmersive overlay scope here. */}
      <div ref={setOverlayHost} className="relative flex flex-1 min-h-0">
        <ChatOverlayProvider value={overlayHost}>
          <WorkspaceProvider value={workspace}>{children}</WorkspaceProvider>
        </ChatOverlayProvider>
      </div>
    </div>
  );
}
