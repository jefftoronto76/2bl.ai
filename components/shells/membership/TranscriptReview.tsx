'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, X, ArrowUp, RotateCcw } from 'lucide-react';

export interface TranscriptReviewProps {
  transcript: string;
  audioBlob: Blob | null;
  onTranscriptChange: (t: string) => void;
  onSend: (keepVoice: boolean) => void;
  onReRecord: () => void;
  onCancel: () => void;
}

export function TranscriptReview({
  transcript,
  audioBlob,
  onTranscriptChange,
  onSend,
  onReRecord,
  onCancel,
}: TranscriptReviewProps) {
  const [keepVoice, setKeepVoice] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea on mount and change
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  useEffect(() => {
    autoResize();
    textareaRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  // keepVoice is only meaningful when there's an actual audio blob to store
  const canKeepVoice = audioBlob !== null;
  const canSend = transcript.trim().length > 0 || (keepVoice && canKeepVoice);

  return (
    <div className="flex flex-col gap-3 px-2 pt-2 pb-1.5">
      {/* Editable transcript */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={transcript}
          onChange={(e) => { onTranscriptChange(e.target.value); autoResize(); }}
          rows={3}
          aria-label="Edit transcript"
          className="block w-full bg-transparent text-text-primary placeholder-text-muted font-body text-base resize-none focus:outline-none leading-6 pr-8 min-h-[72px] max-h-[180px]"
          placeholder="Your words will appear here…"
        />
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          className="absolute top-0 right-0 grid place-items-center w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={14} />
        </button>
      </div>

      {/* Keep my voice toggle */}
      {canKeepVoice && (
        <button
          type="button"
          role="switch"
          aria-checked={keepVoice}
          aria-label="Keep my voice recording"
          onClick={() => setKeepVoice((v) => !v)}
          className="flex items-center gap-2.5 w-fit rounded-lg px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent group"
        >
          {/* Pill toggle */}
          <span
            className={[
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200',
              keepVoice ? 'bg-accent' : 'bg-text-primary/15',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform duration-200',
                keepVoice ? 'translate-x-4' : 'translate-x-0.5',
              ].join(' ')}
            />
          </span>
          <span className="flex items-center gap-1.5 font-body text-sm text-text-muted group-hover:text-text-primary transition-colors">
            <Mic size={13} />
            Keep my voice
          </span>
        </button>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReRecord}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] font-body text-sm text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCcw size={13} />
          Re-record
        </button>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Send"
          disabled={!canSend}
          onClick={() => onSend(keepVoice && canKeepVoice)}
          className={[
            'flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] font-body text-sm transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            canSend
              ? 'bg-accent text-background hover:bg-accent-hover'
              : 'bg-text-primary/10 text-text-muted cursor-not-allowed',
          ].join(' ')}
        >
          <ArrowUp size={14} />
          Send
        </button>
      </div>
    </div>
  );
}
