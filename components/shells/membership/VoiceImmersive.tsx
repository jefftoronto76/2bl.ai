'use client';

// components/shells/membership/VoiceImmersive.tsx
//
// Full-screen voice recording overlay for the Heirloom composer.
// Portaled to document.body — escapes ChatDrawerV2's transform ancestor.
//
// Mobile  (≤768px): fills the entire viewport.
// Desktop (>768px): centered 480×720px panel with a scrim behind it.
//
// Pure presentation. ChatInput owns all recording state and passes it
// via props. onPause collapses the overlay without stopping the recording
// (returns to the compact VoiceBar). onClose cancels recording entirely.

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AudioLines, Feather, Mic } from 'lucide-react';
import { useMediaQuery } from '@mantine/hooks';

export interface VoiceImmersiveProps {
  open: boolean;
  /** Top-bar X — cancels recording entirely. */
  onClose: () => void;
  /** Done button — confirms recording → triggers transcription. */
  onDone: () => void;
  /** Skip button — cancels recording and focuses the textarea. */
  onSkipToTyping: () => void;
  /** Last assistant message, displayed as the guide's current question. */
  guidanceQuestion: string;
  isRecording: boolean;
  /** Elapsed recording seconds, lifted from ChatInput. */
  elapsedSeconds: number;
  /** Footer pause/collapse button — hides the overlay, leaves recording running. */
  onPause: () => void;
}

const cn = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

function fmtTime(secs: number) {
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function GuideAvatar() {
  return (
    <span className="grid place-items-center w-11 h-11 rounded-full bg-accent/15 text-accent flex-shrink-0">
      <Feather size={20} />
    </span>
  );
}

export function VoiceImmersive({
  open,
  onClose,
  onDone,
  onSkipToTyping,
  guidanceQuestion,
  elapsedSeconds,
  onPause,
}: VoiceImmersiveProps) {
  const isMobile = useMediaQuery('(max-width: 768px)') ?? true;
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc → cancel (onClose)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Focus first button when opened
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>('button');
    first?.focus();
  }, [open]);

  if (!open) return null;

  const time = fmtTime(elapsedSeconds);

  // Shared interior layout — same for mobile and desktop
  const interior = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Voice recording"
      className={cn(
        'relative flex flex-col w-full h-full overflow-hidden',
        // Radial gradient: surface at centre, background at edges
        'bg-[radial-gradient(ellipse_at_50%_30%,rgb(var(--color-surface))_0%,rgb(var(--hl-bg))_100%)]',
        !isMobile && 'rounded-3xl',
      )}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-4">
        <span className="font-mono text-[15px] tracking-wide text-text-primary tabular-nums">
          {time}
        </span>
        <button
          type="button"
          aria-label="Cancel recording"
          onClick={onClose}
          className="grid place-items-center w-11 h-11 rounded-full text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── Guide section ───────────────────────────────────────────────── */}
      <div className="px-8 pt-2 pb-6 flex flex-col gap-3">
        <GuideAvatar />
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
          Your Guide Asks
        </p>
        {guidanceQuestion ? (
          <p className="font-display italic text-[27px] leading-[1.25] font-normal text-text-primary max-w-[360px]">
            {guidanceQuestion}
          </p>
        ) : null}
      </div>

      {/* ── Listening orb (absolute, centred horizontally, ~48% from top) ── */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '48%', transform: 'translate(-50%, -50%)' }}>
        {/* Outer ring — 200px, slow pulse */}
        <span className="hl-orb-pulse-slow absolute inset-0 m-auto block rounded-full bg-accent/10"
          style={{ width: 200, height: 200, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          aria-hidden="true"
        />
        {/* Mid ring — 150px, faster pulse */}
        <span className="hl-orb-pulse absolute rounded-full bg-accent/16"
          style={{ width: 150, height: 150, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', position: 'absolute' }}
          aria-hidden="true"
        />
        {/* Inner solid circle — 104px */}
        <span className="absolute rounded-full bg-accent grid place-items-center"
          style={{ width: 104, height: 104, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          aria-hidden="true"
        >
          <Mic size={40} className="text-background" />
        </span>
        {/* Spacer so the containing div has height */}
        <span className="block" style={{ width: 200, height: 200 }} aria-hidden="true" />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-4"
        style={{ bottom: 30 }}
      >
        {/* Status line */}
        <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-recpulse flex-shrink-0" aria-hidden="true" />
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-accent">
            {`Listening · ${time}`}
          </span>
        </div>

        {/* Three controls */}
        <div className="flex items-center gap-6">
          {/* Pause / collapse */}
          <button
            type="button"
            aria-label="Collapse to compact recording bar"
            onClick={onPause}
            className="grid place-items-center rounded-full border border-border text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: 52, height: 52 }}
          >
            <X size={20} />
          </button>

          {/* Done */}
          <button
            type="button"
            aria-label="Finish recording"
            onClick={onDone}
            className="grid place-items-center rounded-full bg-text-primary text-background hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: 64, height: 64 }}
          >
            <Check size={24} />
          </button>

          {/* Skip to typing */}
          <button
            type="button"
            aria-label="Skip to typing"
            onClick={onSkipToTyping}
            className="grid place-items-center rounded-full border border-border text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: 52, height: 52 }}
          >
            <AudioLines size={20} />
          </button>
        </div>

        {/* Labels */}
        <p className="font-body text-[13px] text-text-muted select-none">
          Pause · Done · Skip to typing
        </p>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[90]" data-voice-immersive>
      {isMobile ? (
        // Mobile: full-viewport, slides up
        <div className="hl-animate-sheet absolute inset-0">
          {interior}
        </div>
      ) : (
        // Desktop: scrim + centred panel
        <>
          {/* Scrim — clicking it does nothing; only top-bar X cancels */}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div
            className="hl-animate-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
            style={{ width: 480, maxHeight: 720 }}
          >
            {interior}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
