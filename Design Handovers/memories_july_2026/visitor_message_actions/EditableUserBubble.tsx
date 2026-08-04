'use client';

/**
 * EditableUserBubble — the user bubble in its editing state.
 *
 * Replaces the bubble IN PLACE (same position, same width behaviour) so nothing
 * jumps when editing starts. Type ramp is identical to the read state — 15.5/1.62 —
 * so the text does not reflow on the swap.
 *
 * Enter saves · Shift+Enter newline · Esc cancels.
 */

import { useEffect, useRef, useState } from 'react';

export type EditableUserBubbleProps = {
  initialValue: string;
  onCancel: () => void;
  onSave: (text: string) => void;
};

export function EditableUserBubble({ initialValue, onCancel, onSave }: EditableUserBubbleProps) {
  const [draft, setDraft] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const save = () => {
    const t = draft.trim();
    // No-op when unchanged or empty — must not truncate or regenerate.
    if (!t || t === initialValue) return onCancel();
    onSave(t);
  };

  return (
    <div className="flex w-full max-w-[86%] flex-col gap-2 rounded-[18px] rounded-br-[5px] border border-border-strong bg-surface p-3">
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          grow(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full resize-none overflow-hidden border-none bg-transparent p-0 font-body text-[15.5px] leading-[1.62] text-text-primary outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-[9px] border border-border px-[13px] py-[7px] font-body text-[12.5px] font-medium text-text-secondary"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!draft.trim()}
          className="rounded-[9px] bg-accent px-[15px] py-[7px] font-body text-[12.5px] font-semibold text-background hover:bg-accent-hover disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
