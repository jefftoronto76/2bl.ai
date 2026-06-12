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
// they overlay the drawer (below the header), not the whole page.

import { ReactNode } from 'react';
import { ChevronDown, Maximize2, Minimize2, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

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
  children,
}: ChatDrawerV2Props) {
  return (
    <div
      className={[
        'fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-background',
        'shadow-[-30px_0_80px_-30px_rgba(0,0,0,0.7)]',
        'transition-[transform,width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]',
        isFullScreen ? 'w-screen' : defaultWidthClassName,
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
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        </header>
      )}

      {/* Body — `relative` so the V2 modals' absolute overlays scope here. */}
      <div className="relative flex flex-1 min-h-0">{children}</div>
    </div>
  );
}
