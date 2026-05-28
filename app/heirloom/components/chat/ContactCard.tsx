'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
// Clerk v7 made the signals API the default useSignUp; the classic
// create → prepare → attempt → setActive flow lives behind the legacy export.
import { useSignUp } from '@clerk/nextjs/legacy';
import { useChatStore } from '../store/chatStore';

// Best-effort normalization to E.164 for Clerk (US-centric: bare 10 digits →
// +1XXXXXXXXXX). Clerk does the authoritative validation; a bad value just
// surfaces as a failed create, which the flow handles gracefully.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

type Step = 'collect' | 'otp' | 'done';

const FIELD_CLASS =
  'w-full bg-background border border-border rounded-xl px-3 py-2 font-body text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/40 transition-colors';
const SUBMIT_CLASS =
  'w-full bg-accent hover:bg-accent-hover text-background font-body font-medium rounded-xl px-4 py-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed';
const DECLINE_CLASS =
  'mt-2 w-full text-center font-body text-base text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:underline';

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 justify-start">
      {/* Spacer aligning the card under the assistant avatar column. */}
      <div className="flex-shrink-0 w-8" aria-hidden="true" />
      <div className="w-full max-w-[75%] rounded-2xl border border-accent/30 bg-surface px-4 py-3">
        {children}
      </div>
    </div>
  );
}

// Inline contact-capture card. Email-only → capture, no OTP. Phone → persist,
// then an inline Clerk phone/OTP sign-up (create → verify → setActive → claim).
// Declining or any failure is graceful: the contact is already saved, no Clerk
// account is created, and the session stays anonymous. One-shot per thread.
export function ContactCard() {
  const { state, captureContact, persistContact, claimSession } = useChatStore();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isSignedIn } = useUser();

  const [step, setStep] = useState<Step>('collect');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  // Returning signed-in user (fresh card) — skip capture; PR 3 DB recovery
  // handles them. Not applied once the flow has started/finished.
  if (isSignedIn && step === 'collect') return null;
  // Handled earlier in this session (remount) — never reappear, except on the
  // very mount that just finished (step 'done' shows the confirmation).
  if (state.contact !== null && step !== 'done') return null;

  const canSubmit = phone.trim().length > 0 || email.trim().length > 0;

  // Conclude: set the one-shot flag + show a warm confirmation.
  const finish = (msg: string, draft: { phone?: string; email?: string } | null) => {
    captureContact(draft);
    setDoneMsg(msg);
    setStep('done');
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    const phoneVal = phone.trim();
    const emailVal = email.trim();

    // Email-only → no OTP (phone is the verifiable channel).
    if (!phoneVal) {
      persistContact({ email: emailVal });
      finish("You're on the list — we'll be in touch.", { email: emailVal });
      return;
    }

    // Phone path: persist first so a declined/failed OTP still keeps the contact.
    persistContact({ phone: phoneVal, email: emailVal || undefined });

    if (!isLoaded || !signUp) {
      finish("Got it — we'll be in touch.", { phone: phoneVal, email: emailVal || undefined });
      return;
    }

    setBusy(true);
    try {
      await signUp.create({ phoneNumber: normalizePhone(phoneVal) });
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
      setStep('otp');
    } catch (err) {
      // Misconfigured / invalid number — no scary error; contact is saved.
      console.error('[heirloom/contact] sign-up start failed:', err);
      finish("Got it — we'll be in touch.", { phone: phoneVal, email: emailVal || undefined });
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !isLoaded || !signUp || code.trim().length === 0) return;
    setOtpError(false);
    setBusy(true);
    try {
      const res = await signUp.attemptPhoneNumberVerification({ code: code.trim() });
      if (res.status === 'complete' && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        await claimSession();
        finish("You're on the list — we'll text you when your story's ready.", {
          phone: phone.trim(),
          email: email.trim() || undefined,
        });
      } else {
        setOtpError(true);
      }
    } catch (err) {
      console.error('[heirloom/contact] OTP verify failed:', err);
      setOtpError(true);
    } finally {
      setBusy(false);
    }
  };

  const declineOtp = () => {
    // Contact already persisted at collect — just conclude warmly, no account.
    finish("No problem — we've got your details.", {
      phone: phone.trim(),
      email: email.trim() || undefined,
    });
  };

  if (step === 'done') {
    return (
      <CardShell>
        <p className="font-body text-base text-text-primary">{doneMsg}</p>
      </CardShell>
    );
  }

  if (step === 'otp') {
    return (
      <CardShell>
        <p className="font-body text-base text-text-primary">Enter the code we just texted you</p>
        <p className="font-body text-base text-text-muted mt-1 mb-3">Sent to {phone.trim()}.</p>
        <form onSubmit={handleVerify} className="flex flex-col gap-2">
          <label htmlFor="contact-otp" className="sr-only">
            Verification code
          </label>
          <input
            id="contact-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className={FIELD_CLASS}
          />
          {otpError && (
            <p className="font-body text-base text-text-muted">That code didn&apos;t match — try again.</p>
          )}
          <button type="submit" disabled={busy || code.trim().length === 0} className={SUBMIT_CLASS}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <button type="button" onClick={declineOtp} className={DECLINE_CLASS}>
          Skip for now
        </button>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <p className="font-body text-base text-text-primary">
        Share your phone or email so Heirloom can reach you
      </p>
      <p className="font-body text-base text-text-muted mt-1 mb-3">
        Either one works — no spam, just your story.
      </p>

      <form onSubmit={handleCollect} className="flex flex-col gap-2">
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
          className={FIELD_CLASS}
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
          className={FIELD_CLASS}
        />
        <button type="submit" disabled={!canSubmit || busy} className={SUBMIT_CLASS}>
          {busy ? 'One moment…' : 'Keep me posted'}
        </button>
      </form>

      {/* Mount point for Clerk's bot-protection widget, if the instance uses it. */}
      <div id="clerk-captcha" />

      <button type="button" onClick={() => captureContact(null)} className={DECLINE_CLASS}>
        No thanks, continue without
      </button>
    </CardShell>
  );
}
