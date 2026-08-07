'use client';

/**
 * MemoryCanvasList — the panel's list view.
 *
 * Two modes, one component:
 *  - Browse (default): click a row to open it in CardView.
 *  - Select (`selectMode`): opened from a photo's "Add to a memory" action.
 *    Rows toggle on click — no separate checkbox, the row's own border/background
 *    IS the selected state (a checkbox square was tried and removed; the
 *    highlight alone reads clearly enough). A save bar appears inside THIS
 *    panel, never outside it, once at least one row is checked.
 *
 * Counts, rows, and the "kept this session" copy are unchanged from the
 * sidebar-count logic in design_handoff_memories/SidebarMemoryCount.tsx —
 * this just renders the full row instead of a count badge.
 */

import { useState } from 'react';
import { X, Check, ChevronRight, Bookmark, Feather, Image, Video, Mic, FileText } from 'lucide-react';
import { kindOf } from '../design_handoff_memories/MemoryKinds';

// The canonical `Memory` shape is defined in design_handoff_memories/README.md §3
// (not exported as a .ts file there). Re-declared here for this component only.
type Memory = {
  id: string;
  title: string;
  passage: string;
  kind: string;
  createdAt: string;
};

// MemoryKindSpec.icon is a string (lucide icon name) so the table in
// MemoryKinds.ts stays framework-agnostic. Resolve it to a component here,
// at the one place that actually renders it.
const KIND_ICONS = { feather: Feather, image: Image, video: Video, mic: Mic, 'file-text': FileText } as const;

type Props = {
  memories: Memory[];
  onClose: () => void;
  onOpen: (id: string) => void;
  selectMode?: boolean;
  /** Called once, when Save is pressed, with every checked memory id. */
  onConfirm?: (memoryIds: string[]) => void;
};

export function MemoryCanvasList({ memories, onClose, onOpen, selectMode, onConfirm }: Props) {
  const [checked, setChecked] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    if (saved) return;
    setChecked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const save = () => {
    setSaved(true);
    onConfirm?.(checked);
    // Hold the confirmed state on screen briefly so it registers before the
    // panel closes — the parent should call onClose ~700ms after onConfirm.
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-[18px] py-[14px]">
        <div>
          <h3 className="m-0 font-display text-lg font-medium text-text-primary">
            {selectMode ? 'Add photo to which memories?' : 'Memories from this chat'}
          </h3>
          <p className="mt-0.5 font-mono text-[11px] tracking-[0.06em] text-text-tertiary">
            {selectMode ? 'Select one or more' : `${memories.length} kept this session`}
          </p>
        </div>
        <button aria-label="Close" onClick={onClose} className="grid place-items-center rounded-lg border-none bg-transparent p-1.5 text-text-secondary">
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-5">
        {memories.map((m) => {
          const K = kindOf(m.kind);
          const KindIcon = KIND_ICONS[K.icon as keyof typeof KIND_ICONS] ?? Feather;
          const on = checked.includes(m.id);
          return (
            <button
              key={m.id}
              disabled={saved}
              onClick={() => (selectMode ? toggle(m.id) : onOpen(m.id))}
              className={[
                'flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                on ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong',
              ].join(' ')}
            >
              <span className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <KindIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-display text-base font-medium text-text-primary">{m.title}</span>
                  <span className="shrink-0 font-mono text-[10px] tracking-wide text-text-tertiary">{m.createdAt}</span>
                </span>
                <span className="mt-0.5 block truncate font-body text-[13px] text-text-secondary">{m.passage}</span>
              </span>
              {!selectMode && <ChevronRight size={16} className="shrink-0 text-text-tertiary" />}
            </button>
          );
        })}
      </div>

      {selectMode && checked.length > 0 && (
        <div className="flex flex-shrink-0 items-center gap-2.5 border-t border-border bg-surface px-[18px] py-3.5">
          <span className="flex-1 font-body text-[13px] text-text-primary">
            {checked.length} {checked.length === 1 ? 'memory' : 'memories'} selected
          </span>
          <button
            disabled={saved}
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-[10px] border-none bg-accent px-4 py-2 font-body text-[13px] font-semibold text-background disabled:opacity-70"
          >
            {saved ? <Check size={14} /> : <Bookmark size={14} />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
