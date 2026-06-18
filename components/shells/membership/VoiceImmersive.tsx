'use client';

// components/shells/membership/VoiceImmersive.tsx
//
// Full-screen hands-free voice surface. Presentational only — the recording
// lifecycle (MediaRecorder, timer, transcribe) lives in ChatInput, which
// portals this into ChatDrawerV2's relative body and positions it ABSOLUTE
// (never fixed — see ChatOverlayHost.tsx for why).
//
// Reached as STEP 2 of the voice flow: inline recording bar → Expand → here.

import { Mic, X, Check, AudioLines, Minimize2, Feather } from 'lucide-react';

export function VoiceImmersive({
  elapsed,
  question,
  onMinimize,
  onCancel,
  onConfirm,
}: {
  /** "mm:ss", owned by ChatInput so inline + full-screen show the same clock. */
  elapsed: string;
  /** The guide's current question (latest assistant turn). */
  question?: string;
  /** Collapse back to the inline recording bar (recording continues). */
  onMinimize: () => void;
  /** Cancel + discard the recording. */
  onCancel: () => void;
  /** Finish → transcribe (ChatInput drops the text into the composer). */
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hands-free voice"
      className="absolute inset-0 z-[70] overflow-hidden flex flex-col motion-safe:animate-[hl-fade-in_.25s_ease]"
      style={{
        background:
          'radial-gradient(ellipse at 50% 38%, rgb(var(--color-surface)) 0%, rgb(var(--hl-bg)) 62%)',
      }}
    >
      {/* top bar — collapse + close */}
      <div className="flex items-center justify-between h-[50px] px-3">
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Collapse to composer"
          title="Collapse"
          className="grid place-items-center w-9 h-9 rounded-lg text-text-muted hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Minimize2 size={19} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          title="Close"
          className="grid place-items-center w-9 h-9 rounded-lg text-text-muted hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={20} />
        </button>
      </div>

      {/* prompt */}
      <div className="text-center px-8 pt-2">
        <div className="flex justify-center mb-3.5">
          <span className="grid place-items-center w-[46px] h-[46px] rounded-full bg-accent/15 border border-accent/30 text-accent">
            <Feather size={20} />
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-text-muted">
          Your guide asks
        </span>
        <p className="font-display font-light text-[28px] leading-snug text-text-primary mt-3 mx-auto max-w-[440px]">
          {question ?? 'I’m listening — take your time.'}
        </p>
      </div>

      {/* listening orb */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] grid place-items-center">
        <span className="absolute w-[200px] h-[200px] rounded-full bg-accent/15 motion-safe:animate-[hl-orb_2.4s_ease-in-out_infinite]" />
        <span className="absolute w-[150px] h-[150px] rounded-full bg-accent/15 motion-safe:animate-[hl-orb_2.4s_.4s_ease-in-out_infinite]" />
        <span className="relative grid place-items-center w-[104px] h-[104px] rounded-full bg-accent text-background shadow-[0_16px_40px_-10px_rgba(0,0,0,0.35)]">
          <Mic size={40} />
        </span>
      </div>

      {/* footer — status + transport */}
      <div className="absolute inset-x-0 bottom-[34px] text-center">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase text-accent mb-[18px]">
          <span className="w-2 h-2 rounded-full bg-accent animate-recpulse" />
          Listening · {elapsed}
        </div>
        <div className="flex items-center justify-center gap-[26px]">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            title="Cancel"
            className="grid place-items-center w-[54px] h-[54px] rounded-full border border-border text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={20} />
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-label="Done"
            title="Done"
            className="grid place-items-center w-16 h-16 rounded-full bg-text-primary text-background shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Check size={26} />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Skip to typing"
            title="Skip to typing"
            className="grid place-items-center w-[54px] h-[54px] rounded-full border border-border text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <AudioLines size={20} />
          </button>
        </div>
        <div className="mt-3 font-body text-[12.5px] text-text-muted">Pause · Done · Skip to typing</div>
      </div>
    </div>
  );
}
