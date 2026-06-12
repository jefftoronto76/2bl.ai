'use client';

// components/shells/membership/v2/BeginStoryModal.tsx
//
// "Begin a new story" modal. Pure presentation — the parent owns the open/close
// state and the create handler. No store, no data, no API.
//
//   name        required — the story title
//   description optional — surfaced as the hover tooltip on the story row in
//               the sidebar's Stories section (see SidebarV2 `title={…}`)

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface BeginStoryModalProps {
  /** Whether the modal is mounted/visible. */
  open: boolean;
  /** Close without creating (backdrop click, Esc, Cancel, X). */
  onClose: () => void;
  /** Fired when Create story is pressed with a non-empty name. */
  onCreate: (name: string, description: string) => void;
}

export function BeginStoryModal({ open, onClose, onCreate }: BeginStoryModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset fields each time the modal opens, and focus the name field.
  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    const id = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const canCreate = name.trim().length > 0;

  const submit = () => {
    if (!canCreate) return;
    onCreate(name.trim(), description.trim());
  };

  if (!open) return null;

  const field =
    'w-full mt-2 px-3 py-2.5 bg-background/60 border border-border rounded-xl ' +
    'font-body text-base text-text-primary placeholder-text-muted ' +
    'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all';
  const label =
    'font-mono text-[11px] tracking-[0.18em] uppercase text-text-muted';

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-[80] flex items-center justify-center p-5 bg-black/55 backdrop-blur-sm"
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Begin a new story"
        className="relative w-[min(462px,100%)] bg-surface border border-border rounded-2xl shadow-2xl p-7"
      >
        <div className="absolute top-3.5 right-3.5">
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent mb-4">
          <BookOpen size={21} />
        </div>

        <h2 className="font-display font-medium text-text-primary text-[27px] leading-tight tracking-tight">
          Begin a new story
        </h2>
        <p className="font-body text-sm text-text-muted leading-relaxed mt-2">
          Give it a name and a line about what it holds. The description appears
          when you hover the story later.
        </p>

        <div className="mt-6">
          <span className={label}>Name</span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="e.g. A Life in Full"
            aria-label="Story name"
            className={field}
          />
        </div>

        <div className="mt-4">
          <span className={label}>
            Description{' '}
            <span className="font-body normal-case tracking-normal text-text-muted/70">
              · optional, shown on hover
            </span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="The long arc — childhood to now."
            aria-label="Story description"
            className={`${field} resize-none leading-relaxed`}
          />
        </div>

        <div className="flex justify-end gap-2.5 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canCreate}>
            <Plus size={15} />
            Create story
          </Button>
        </div>
      </div>
    </div>
  );
}
