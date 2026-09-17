'use client';

// components/shells/membership/v2/CoverBackPanel.tsx
//
// Cover/back page editor — Story Deck & Memory Panel handover, Phase 4,
// 2026-09. Opened from StoryView.tsx's Add menu ("Cover page" / "Back
// page"). Same modal chrome/a11y as BeginStoryModal.tsx (useModalA11y,
// Button/IconButton, the same field/label style constants) — nothing new
// invented here.
//
// STUB ONLY, per product decision — no schema, no API, no persistence:
// this round has zero backend counterpart for cover/back pages (confirmed
// repo-wide before building this — no `cover`/`backPage` column, type, or
// route exists anywhere). Saved data lives in StoryView.tsx's own local
// component state (`cover`/`backPage`), passed in here as `initial` and
// handed back via `onSave` — it resets the moment the page reloads or a
// different story is opened. The image slot below is a purely decorative
// placeholder (no file input, no upload) for the same reason.
//
// Field set (3 fixed templates each, a heading, an optional short text, an
// optional image slot when the template calls for one) is this round's own
// proposal per the brief's "small, fixed set of predefined templates" — not
// confirmed against any future backend design. See the handover's own
// README.md, "Known-unknowns."

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Bookmark, ImagePlus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { useModalA11y } from './useModalA11y';

export interface CoverBackData {
  templateId: string;
  heading: string;
  text: string;
  hasImage: boolean;
}

interface Template {
  id: string;
  label: string;
  image: boolean;
}

const COVER_TEMPLATES: Template[] = [
  { id: 'photo', label: 'Photo cover', image: true },
  { id: 'classic', label: 'Classic title', image: false },
  { id: 'line', label: 'Title + line', image: false },
];

const BACK_TEMPLATES: Template[] = [
  { id: 'closing', label: 'Closing note', image: false },
  { id: 'photo', label: 'Photo + line', image: true },
  { id: 'blank', label: 'Blank', image: false },
];

export interface CoverBackPanelProps {
  kind: 'cover' | 'back';
  open: boolean;
  /** Existing saved data to edit, or null when adding it for the first time. */
  initial: CoverBackData | null;
  onClose: () => void;
  onSave: (data: CoverBackData) => void;
  /** Only ever called when `initial` is non-null — the panel has no "Remove"
   *  action to offer on a not-yet-saved cover/back. */
  onRemove: () => void;
}

export function CoverBackPanel({ kind, open, initial, onClose, onSave, onRemove }: CoverBackPanelProps) {
  const templates = kind === 'cover' ? COVER_TEMPLATES : BACK_TEMPLATES;
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [heading, setHeading] = useState('');
  const [text, setText] = useState('');
  const headingRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Re-seeds from `initial` (or resets to the first template) every time the
  // panel opens — same reset-on-open posture as BeginStoryModal.tsx.
  useEffect(() => {
    if (!open) return;
    setTemplateId(initial?.templateId ?? templates[0].id);
    setHeading(initial?.heading ?? '');
    setText(initial?.text ?? '');
    // `templates` is a fresh array literal per `kind` value, not per render —
    // safe to depend on its first element without it thrashing the effect.
  }, [open, initial, templates]);

  useModalA11y(open, dialogRef, onClose, headingRef);

  if (!open) return null;

  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const canSave = heading.trim().length > 0;
  const title = kind === 'cover' ? 'Cover page' : 'Back page';

  const field =
    'w-full mt-2 px-3 py-2.5 bg-background/60 border border-border rounded-xl ' +
    'font-body text-base text-text-primary placeholder-text-muted ' +
    'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all';
  const label = 'font-mono text-[11px] tracking-[0.18em] uppercase text-text-muted';

  const submit = () => {
    if (!canSave) return;
    onSave({ templateId, heading: heading.trim(), text: text.trim(), hasImage: template.image });
  };

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-[80] flex items-center justify-center p-5 bg-black/55 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-[min(480px,100%)] max-h-[92%] overflow-y-auto bg-surface border border-border rounded-2xl shadow-2xl p-7 focus:outline-none"
      >
        <div className="absolute top-3.5 right-3.5">
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent mb-4">
          {kind === 'cover' ? <BookOpen size={21} /> : <Bookmark size={21} />}
        </div>

        <h2 className="font-display font-medium text-text-primary text-[27px] leading-tight tracking-tight">
          {title}
        </h2>
        <p className="font-body text-sm text-text-muted leading-relaxed mt-2">
          Pick a template, then fill in the details.
        </p>

        <div className="mt-6">
          <span className={label}>Template</span>
          <div role="group" aria-label="Template" className="flex gap-2 mt-2.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={templateId === t.id}
                onClick={() => setTemplateId(t.id)}
                className={`flex-1 flex flex-col items-center gap-2 py-2.5 px-1.5 rounded-xl border-[1.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  templateId === t.id ? 'border-accent bg-accent/10' : 'border-border bg-transparent'
                }`}
              >
                <span className="w-full aspect-[3/4] rounded-md bg-background border border-border flex flex-col items-center justify-center gap-1">
                  {t.image && <span className="w-[58%] h-[40%] rounded-sm bg-border" />}
                  <span className="w-[55%] h-[3px] rounded-sm bg-text-muted/60" />
                </span>
                <span className={`font-body text-[11px] font-semibold text-center ${templateId === t.id ? 'text-accent' : 'text-text-muted'}`}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {template.image && (
          <div className="mt-4">
            <span className={label}>Image</span>
            <div className="mt-2.5 h-[120px] rounded-xl border border-dashed border-border bg-background/60 flex flex-col items-center justify-center gap-1.5 text-text-muted">
              <ImagePlus size={20} aria-hidden />
              <span className="font-body text-xs">Drop a photo, or add one later</span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <span className={label}>{kind === 'cover' ? 'Title' : 'Heading'}</span>
          <input
            ref={headingRef}
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={kind === 'cover' ? 'e.g. A Life in Full' : 'e.g. With love, always'}
            aria-label={kind === 'cover' ? 'Title' : 'Heading'}
            className={field}
          />
        </div>

        <div className="mt-4">
          <span className={label}>
            {kind === 'cover' ? 'Subtitle' : 'Closing line'}{' '}
            <span className="font-body normal-case tracking-normal text-text-muted/70">· optional</span>
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={kind === 'cover' ? 'The story of...' : 'A line to leave the reader with.'}
            aria-label={kind === 'cover' ? 'Subtitle' : 'Closing line'}
            className={`${field} resize-none leading-relaxed`}
          />
        </div>

        <div className="flex items-center justify-between gap-2.5 mt-6">
          {initial ? (
            <button
              type="button"
              onClick={onRemove}
              className="px-4 py-2 rounded-lg font-body text-base font-medium text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Remove {kind === 'cover' ? 'cover' : 'back page'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
