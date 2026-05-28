'use client';

import { useState } from 'react';
import { useChatStore } from '../store/chatStore';

// Light client-side sanity check — not full validation. Strips non-digits and
// accepts a plausible phone length (7–15 digits, covering local + E.164).
function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

// Inline contact-capture card rendered after an assistant message that emitted a
// [CONTACT:] marker. The visitor types their phone; submit captures + persists
// it, the decline link dismisses. One-shot: once handled it never reappears
// (gated on the store's `contact` state).
export function ContactCard() {
  const { state, captureContact } = useChatStore();
  const [phone, setPhone] = useState('');

  if (state.contact !== null) return null;

  const valid = isPlausiblePhone(phone);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    captureContact(phone);
  };

  return (
    <div className="flex gap-3 justify-start">
      {/* Spacer aligning the card under the assistant avatar column. */}
      <div className="flex-shrink-0 w-8" aria-hidden="true" />
      <div className="w-full max-w-[75%] rounded-2xl border border-accent/30 bg-surface px-4 py-3">
        <p className="font-body text-base text-text-primary">Want a text when your story&apos;s ready?</p>
        <p className="font-body text-base text-text-muted mt-1 mb-3">
          Drop your number and we&apos;ll keep you posted — no spam.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor="contact-phone" className="sr-only">
            Phone number
          </label>
          <input
            id="contact-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 font-body text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/40 transition-colors"
          />
          <button
            type="submit"
            disabled={!valid}
            className="w-full bg-accent hover:bg-accent-hover text-background font-body font-medium rounded-xl px-4 py-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Text me my story
          </button>
        </form>

        <button
          type="button"
          onClick={() => captureContact(null)}
          className="mt-2 w-full text-center font-body text-base text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:underline"
        >
          No thanks, continue without
        </button>
      </div>
    </div>
  );
}
