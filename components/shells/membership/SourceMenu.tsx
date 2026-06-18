'use client';

// components/shells/membership/SourceMenu.tsx
//
// The composer "+" source menu — one list of media sources, two presentations:
//   • variant="popover" — desktop: an upward-opening popover, positioned by a
//                         `relative` wrapper around the "+" in ChatInput.
//   • variant="sheet"   — mobile: a bottom sheet (portal to <body>) + scrim.
//
// Pure presentation. ChatInput owns `open` + the per-source actions and passes
// them down via onSelect(key) / onClose().

import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon, FileText, Mic, Folder } from 'lucide-react';

export type SourceKey = 'camera' | 'library' | 'scan' | 'record' | 'browse';

// Order matters: "Take a photo" is promoted to the top (most-common action).
export const SOURCES: { key: SourceKey; label: string; icon: typeof Camera }[] = [
  { key: 'camera', label: 'Take a photo', icon: Camera },
  { key: 'library', label: 'Photo library', icon: ImageIcon },
  { key: 'scan', label: 'Scan a document', icon: FileText },
  { key: 'record', label: 'Record audio', icon: Mic },
  { key: 'browse', label: 'Browse files', icon: Folder },
];

const cn = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

function Rows({ onSelect, large }: { onSelect: (k: SourceKey) => void; large?: boolean }) {
  return (
    <>
      {SOURCES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="menuitem"
          onClick={() => onSelect(key)}
          className={cn(
            'flex items-center w-full text-left rounded-[10px] font-body font-medium text-text-primary',
            'hover:bg-text-primary/[0.07] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            large ? 'gap-3.5 px-3 min-h-[52px] text-base' : 'gap-3 px-2.5 py-2.5 text-[15px]',
          )}
        >
          <Icon size={large ? 20 : 18} className="flex-shrink-0 text-accent" />
          <span>{label}</span>
        </button>
      ))}
    </>
  );
}

export function SourceMenu({
  open,
  variant,
  onSelect,
  onClose,
}: {
  open: boolean;
  variant: 'popover' | 'sheet';
  onSelect: (k: SourceKey) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  if (variant === 'popover') {
    // Positioned by the `relative` wrapper in ChatInput; opens upward because
    // the composer sits at the bottom of the drawer. Outside-click / Esc are
    // handled by ChatInput (it owns the wrapper ref).
    return (
      <div
        role="menu"
        aria-label="Add to your story"
        className="hl-animate-modal absolute bottom-[calc(100%+12px)] left-0 z-40 w-60 rounded-2xl bg-surface border border-border shadow-[0_22px_60px_-18px_rgba(0,0,0,0.6)] p-1.5"
      >
        <Rows onSelect={onSelect} />
      </div>
    );
  }

  // sheet (mobile) — portal so the scrim covers the whole viewport.
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Add to your story">
      <div
        className="hl-animate-fade absolute inset-0 bg-black/45"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="hl-animate-sheet absolute left-0 right-0 bottom-0 rounded-t-2xl bg-surface border-t border-border p-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className="mx-auto mb-2 mt-1 h-1 w-9 rounded-full bg-border" aria-hidden="true" />
        <div role="menu" aria-label="Add to your story">
          <Rows onSelect={onSelect} large />
        </div>
      </div>
    </div>,
    document.body,
  );
}
