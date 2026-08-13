'use client';

// Add-to-memory slide-in panel — Stage 3 of media_stages_08_2026. Design
// spec says "reuses SessionMemoriesPanel in select mode"; that component
// doesn't exist anywhere in real code (confirmed in this stage's
// investigation), so this is the minimal select-multiple list built to
// match existing memory-panel list styling instead (memoryKinds.ts's
// KIND_ICONS, the same per-kind icon set MemoryCard/MemoryCardView use).
//
// Which memories to show: the media item's OWN originating chat
// (item.chat_id), not a `memories` prop threaded down from ChatHero — the
// design prototype's mock data has no real per-session memory model to
// scope against, but ours does (useMemories is chat-session-scoped), and a
// media item can only sensibly be "added to" a memory that lives in the
// same chat it was uploaded in. Works identically whether the card is in
// the standalone MediaPage or the in-chat MediaGallery, with no memories
// prop plumbing needed through either.
//
// No real persistence: the only real media<->memory relationship in this
// schema is memories.media_item_id, a 1:1 FK set ONLY at memory-CREATION
// time (createPhotoMemoryFromMedia) — "create a new memory from this
// photo," not "attach this existing photo to an existing memory." The
// many-to-many table that would support the latter (photo_artifacts) is
// schema-only, zero application code references it (System Docs/Database
// Schema.md). So this matches the design's own spec exactly: toast on
// confirm, no write, same as Edit/Upload's stub posture — unlike those,
// though, the SELECTION list itself is real (the session's actual saved
// memories), not fabricated.

import { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useMemories } from '@/services/chat/ui/v1/useMemories';
import { KIND_ICONS, memoryKindOf } from '../memory/memoryKinds';
import { useModalA11y } from '../v2/useModalA11y';
import type { MediaItemWithUrl } from '@/services/media/display-url';

interface AddToMemoryPanelProps {
  item: MediaItemWithUrl | null;
  onClose: () => void;
  flash: (message: string) => void;
}

export function AddToMemoryPanel({ item, onClose, flash }: AddToMemoryPanelProps) {
  const open = item !== null;
  const memories = useMemories(item?.chat_id ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Fresh selection every time a different card opens this panel — a
  // leftover check-mark from the last item would misrepresent what's about
  // to be "added" for this one.
  useEffect(() => {
    setSelected(new Set());
  }, [item?.id]);

  useModalA11y(open, dialogRef, onClose, closeButtonRef);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const count = selected.size;
    flash(count === 1 ? 'Added to memory' : `Added to ${count} memories`);
    // Same "toast, then close after a short delay" as the design spec —
    // gives the toast a beat to register before the panel slides away.
    setTimeout(onClose, 600);
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 z-[79] bg-black/45 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add to memory"
        inert={!open}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-y-0 right-0 z-[80] w-[min(400px,100vw)] bg-background border-l border-border flex flex-col transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus:outline-none ${
          open ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-display text-[15px] text-text-primary">Add to memory</h3>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close add to memory panel"
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {memories.memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-4">
              <p className="font-body text-sm text-text-muted">
                No memories saved in this chat yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {memories.memories.map((memory) => {
                const Icon = KIND_ICONS[memoryKindOf(memory.source_kind).icon] ?? KIND_ICONS.feather;
                const isSelected = selected.has(memory.id);
                return (
                  <button
                    key={memory.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggle(memory.id)}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isSelected ? 'bg-accent/10' : 'hover:bg-text-primary/[0.05]'
                    }`}
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 grid place-items-center text-accent">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1 font-body text-sm text-text-primary truncate">
                      {memory.title}
                    </span>
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-md border grid place-items-center transition-colors ${
                        isSelected ? 'bg-accent border-accent text-background' : 'border-border text-transparent'
                      }`}
                    >
                      <Check size={13} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex-shrink-0">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-background font-body text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {selected.size === 0
              ? 'Add to memory'
              : `Add to ${selected.size} ${selected.size === 1 ? 'memory' : 'memories'}`}
          </button>
        </div>
      </div>
    </>
  );
}
