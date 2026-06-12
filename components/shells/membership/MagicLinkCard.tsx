'use client';

// components/shells/membership/MagicLinkCard.tsx
//
// Inline authentication card rendered in the Heirloom chat transcript when the
// engine emits an [ACCOUNT_CREATE: reason] marker. Owns the full email-magic-link
// / phone-OTP flow via useAuthFlow, including new-vs-existing user handling.
//
// Layout mirrors an assistant message bubble (Bot avatar + rounded card) so
// it sits naturally in the conversation without layout seams.
//
// Stages:
//   idle / sending  → contact input form (email or phone tab)
//   email_sent      → "Check your inbox" + resend cooldown
//   otp_input       → 6-digit OTP entry (auto-submits on last digit)
//   verifying       → OTP form with spinner
//   expired         → expired notice + resend
//   error           → error message + reset
//   success         → "You're in." (onSuccess fires; parent upgrades state)

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthUser } from '@/services/auth/client';
import { CaptchaSlot } from '@/services/auth/ui';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle,
  Mail,
  Phone,
  RotateCcw,
} from 'lucide-react';
import { useAuthFlow } from '@/services/auth/useAuthFlow';

// ── Props ─────────────────────────────────────────────────────────────────────

interface MagicLinkCardProps {
  /** Free-text from the [AUTH_PROMPT: …] marker, shown as a muted subheading. */
  reason?: string;
  /** Visitor name from a [NAME: …] marker — pre-fills the name field. */
  initialName?: string | null;
  /** Called when the session is established. Receives the name the visitor typed. */
  onSuccess: (name: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RESEND_COOLDOWN_S = 30;

// ── Shared sub-components ─────────────────────────────────────────────────────

function CardAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mt-0.5">
      <Bot size={14} className="text-accent" />
    </div>
  );
}

function Spinner() {
  return (
    <span className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />
  );
}

function SendButton({
  disabled,
  loading,
  label,
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={label}
      className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent hover:bg-accent-hover text-background flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {loading ? <Spinner /> : <ArrowRight size={15} />}
    </button>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-xs text-amber-400/80 font-body" role="alert" aria-live="polite">
      {message}
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MagicLinkCard({ reason, initialName, onSuccess }: MagicLinkCardProps) {
  const { isSignedIn, isLoaded } = useAuthUser();
  const flow = useAuthFlow();

  const [nameValue, setNameValue] = useState(initialName ?? '');
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [inputValue, setInputValue] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  // If the user is already signed in on mount (e.g. after clicking the email
  // link and being redirected back to this page), call onSuccess immediately
  // so the parent can upgrade to member state without any further interaction.
  useEffect(() => {
    if (isLoaded && isSignedIn && flow.stage === 'idle') {
      onSuccess(nameValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Propagate flow success (OTP / same-tab email polling) to parent.
  useEffect(() => {
    if (flow.stage === 'success') onSuccess(nameValue.trim());
  }, [flow.stage, onSuccess, nameValue]);

  // Start the resend cooldown whenever we enter email_sent stage.
  useEffect(() => {
    if (flow.stage !== 'email_sent') return;
    setResendCooldown(RESEND_COOLDOWN_S);
    const id = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [flow.stage]);

  // Auto-submit OTP when all 6 digits are entered.
  useEffect(() => {
    if (otpValue.length === 6 && flow.stage === 'otp_input') {
      void flow.verifyOtp(otpValue);
    }
  }, [otpValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleContactSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const val = inputValue.trim();
      if (!val || !nameValue.trim()) return;
      if (tab === 'email') void flow.sendEmail(val, nameValue);
      else void flow.sendPhone(val, nameValue);
    },
    [inputValue, nameValue, tab, flow],
  );

  const handleOtpSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (otpValue.length === 6) void flow.verifyOtp(otpValue);
    },
    [otpValue, flow],
  );

  const handleResend = useCallback(async () => {
    setOtpValue('');
    await flow.resend();
  }, [flow]);

  const handleReset = useCallback(() => {
    flow.reset();
    setInputValue('');
    setOtpValue('');
    setResendCooldown(0);
  }, [flow]);

  const handleTabChange = useCallback((next: 'email' | 'phone') => {
    setTab(next);
    setInputValue('');
  }, []);

  // ── Stage rendering ────────────────────────────────────────────────────────

  const { stage, error } = flow;

  function renderContent() {
    // ── Success ──────────────────────────────────────────────────────────────
    if (stage === 'success') {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-accent flex-shrink-0" />
          <p className="text-text-primary text-sm font-body font-medium">You&apos;re in.</p>
        </div>
      );
    }

    // ── Expired ───────────────────────────────────────────────────────────────
    if (stage === 'expired') {
      return (
        <>
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle size={15} className="text-amber-400/80 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-text-primary text-sm font-body font-medium">Link expired</p>
              <p className="text-text-muted text-sm font-body mt-0.5">
                The magic link has expired.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResend}
            className="flex items-center gap-1.5 text-accent text-sm font-body hover:text-accent-hover transition-colors focus:outline-none focus-visible:underline"
          >
            <RotateCcw size={13} />
            Send a new link
          </button>
        </>
      );
    }

    // ── Unrecoverable error ───────────────────────────────────────────────────
    if (stage === 'error') {
      return (
        <>
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle size={15} className="text-amber-400/80 mt-0.5 flex-shrink-0" />
            <p className="text-text-primary text-sm font-body">
              {error ?? 'Something went wrong. Please try again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-accent text-sm font-body hover:text-accent-hover transition-colors focus:outline-none focus-visible:underline"
          >
            <RotateCcw size={13} />
            Try again
          </button>
        </>
      );
    }

    // ── Email sent ────────────────────────────────────────────────────────────
    if (stage === 'email_sent') {
      return (
        <>
          <div className="flex items-start gap-2">
            <CheckCircle size={15} className="text-accent mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-text-primary text-sm font-body font-medium">
                Magic link sent
              </p>
              <p className="text-text-muted text-sm font-body mt-0.5">
                Check {flow.contactValue} and click the link to sign in.
              </p>
            </div>
          </div>
          <div className="mt-3">
            {resendCooldown > 0 ? (
              <p className="text-text-muted text-xs font-body" aria-live="polite">
                Resend available in {resendCooldown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="text-accent text-sm font-body hover:text-accent-hover transition-colors underline underline-offset-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
              >
                Resend link
              </button>
            )}
          </div>
        </>
      );
    }

    // ── OTP entry + verifying ────────────────────────────────────────────────
    if (stage === 'otp_input' || stage === 'verifying') {
      return (
        <>
          <p className="text-text-primary text-sm font-body font-medium mb-0.5">
            Code sent
          </p>
          <p className="text-text-muted text-sm font-body mb-3">
            Enter the code sent to {flow.contactValue}
          </p>
          <form onSubmit={handleOtpSubmit} className="flex gap-2" noValidate>
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpValue}
              onChange={(e) =>
                setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="------"
              aria-label="6-digit verification code"
              autoComplete="one-time-code"
              className="flex-1 bg-background/60 border border-accent/20 rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder-text-muted text-center tracking-[0.3em] focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
            />
            <SendButton
              disabled={otpValue.length !== 6 || stage === 'verifying'}
              loading={stage === 'verifying'}
              label="Verify code"
            />
          </form>
          <FieldError message={error} />
          <button
            type="button"
            onClick={handleResend}
            className="mt-2 text-text-muted text-xs font-body hover:text-text-primary transition-colors focus:outline-none focus-visible:underline"
          >
            Resend code
          </button>
        </>
      );
    }

    // ── Contact input (idle + sending) ────────────────────────────────────────
    const isSending = stage === 'sending';
    return (
      <>
        {reason && (
          <p className="text-text-muted text-xs font-body mb-3">{reason}</p>
        )}

        {/* Name — required; pre-filled from [NAME: …] marker if captured */}
        <input
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="given-name"
          disabled={isSending}
          className="w-full bg-background/60 border border-accent/20 rounded-lg px-3 py-2 text-sm font-body text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all disabled:opacity-50 mb-3"
        />

        {/* Email / Phone tab toggle */}
        <div
          role="tablist"
          aria-label="Sign-in method"
          className="flex gap-0.5 mb-3 bg-background/50 rounded-lg p-0.5"
        >
          {(['email', 'phone'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => handleTabChange(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-body font-medium transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                tab === t
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t === 'email' ? <Mail size={12} /> : <Phone size={12} />}
              {t === 'email' ? 'Email' : 'Phone'}
            </button>
          ))}
        </div>

        {/* Input + send button */}
        <form onSubmit={handleContactSubmit} className="flex gap-2" noValidate>
          <input
            ref={inputRef}
            type={tab === 'email' ? 'email' : 'tel'}
            inputMode={tab === 'email' ? 'email' : 'tel'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={tab === 'email' ? 'your@email.com' : '+1 (555) 000-0000'}
            autoComplete={tab === 'email' ? 'email' : 'tel'}
            aria-label={tab === 'email' ? 'Email address' : 'Phone number'}
            disabled={isSending}
            className="flex-1 bg-background/60 border border-accent/20 rounded-lg px-3 py-2 text-sm font-body text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all disabled:opacity-50"
          />
          <SendButton
            disabled={!nameValue.trim() || !inputValue.trim() || isSending}
            loading={isSending}
            label={tab === 'email' ? 'Send magic link' : 'Send code'}
          />
        </form>
        {/* Required by the provider's bot-protection — must be in the DOM
            before the sign-up create call fires (boundary-rendered slot). */}
        <CaptchaSlot />

        {/* Show inline error when we bounced back to idle after a failure */}
        {stage === 'idle' && error && <FieldError message={error} />}
      </>
    );
  }

  // ── Outer layout (mirrors assistant message bubble) ────────────────────────
  return (
    <div className="flex gap-3 justify-start" role="region" aria-label="Sign in to continue">
      <CardAvatar />
      <div className="max-w-[75%] w-72 rounded-2xl rounded-bl-sm bg-surface border border-accent/15 px-4 py-4">
        {renderContent()}
      </div>
    </div>
  );
}
