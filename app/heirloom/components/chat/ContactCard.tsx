'use client';

import { useState } from 'react';
import { useChatStore } from '../store/chatStore';

// Inline contact-capture card rendered after an assistant message that emitted a
// [CONTACT:] marker. The visitor shares a phone, an email, or both — whichever
// they prefer. Submit captures + persists; the decline link dismisses. One-shot:
// once handled it never reappears (gated on the store's `contact` state).
export function ContactCard() {
  const { state, captureContact } = useChatStore();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  if (state.contact !== null) return null;

  // At least one field must have a value (presence, not strict validity).
  const canSubmit = phone.trim().length > 0 || email.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    captureContact({ phone, email });
  };

  const fieldClass =
    'w-full bg-background border border-border rounded-xl px-3 py-2 font-body text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/40 transition-colors';

  return (
    <div className="flex gap-3 justify-start">
      {/* Spacer aligning the card under the assistant avatar column. */}
      <div className="flex-shrink-0 w-8" aria-hidden="true" />
      <div className="w-full max-w-[75%] rounded-2xl border border-accent/30 bg-surface px-4 py-3">
        <p className="font-body text-base text-text-primary">
          Share your phone or email so Heirloom can reach you
        </p>
        <p className="font-body text-base text-text-muted mt-1 mb-3">
          Either one works — no spam, just your story.
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
            placeholder="Phone — (555) 123-4567"
            className={fieldClass}
          />
          <label htmlFor="contact-email" className="sr-only">
            Email address
          </label>
          <input
            id="contact-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email — you@example.com"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-accent hover:bg-accent-hover text-background font-body font-medium rounded-xl px-4 py-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Keep me posted
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
