'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Check,
  Mail,
  Phone,
  RotateCcw,
  X,
} from 'lucide-react';
import { useAuthFlow } from '@/services/auth/useAuthFlow';
import { useChatStore } from './chatStore';

const RESEND_COOLDOWN_S = 30;

function Spinner() {
  return (
    <span className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />
  );
}

export function SaveChatCTA() {
  const { state, claimAllSessions, injectAssistantMessage } = useChatStore();
  const { messages, isMember } = state;

  const flow = useAuthFlow();

  const [open, setOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [inputValue, setInputValue] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // After Clerk auth completes: pass name through to claimAllSessions, then inject
  // the confirmation message. nameValue is written to users.name (column exists on
  // `users`). members table has no name column — name never touches members.
  useEffect(() => {
    if (flow.stage !== 'success') return;
    void (async () => {
      await claimAllSessions(nameValue.trim() || undefined);
      injectAssistantMessage("You're now a member — your story is saved.");
      setOpen(false);
    })();
  }, [flow.stage, claimAllSessions, injectAssistantMessage]);

  // Resend countdown.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Auto-submit OTP on 6th digit.
  useEffect(() => {
    if (otpValue.length === 6 && flow.stage === 'otp_input') {
      void flow.verifyOtp(otpValue);
    }
  }, [otpValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only show after 4 messages and while the visitor is not yet a member.
  if (messages.length < 4 || isMember) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleClose() {
    setOpen(false);
    setNameValue('');
    setNameError(null);
    setInputValue('');
    setContactError(null);
    setOtpValue('');
    setResendCooldown(0);
    flow.reset();
  }

  function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValue.trim()) {
      setNameError('Please enter your name.');
      return;
    }
    const val = inputValue.trim();
    if (!val) return;
    if (tab === 'phone') {
      const digits = val.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        setContactError('Please enter a valid phone number.');
        return;
      }
    }
    setContactError(null);
    setResendCooldown(RESEND_COOLDOWN_S);
    if (tab === 'email') void flow.sendEmail(val);
    else void flow.sendPhone(val);
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otpValue.length === 6) void flow.verifyOtp(otpValue);
  }

  async function handleResend() {
    setOtpValue('');
    setResendCooldown(RESEND_COOLDOWN_S);
    await flow.resend();
  }

  // ── Input class shared across the eggshell (bg-text-primary) modal card ───

  const inputCls =
    'flex-1 bg-background/10 border border-background/20 rounded-lg px-3 py-2 text-sm font-body text-background placeholder-background/30 focus:outline-none focus:border-background/40 focus:ring-1 focus:ring-background/20 transition-all disabled:opacity-50';

  // ── Modal form stages ──────────────────────────────────────────────────────

  const { stage, error } = flow;

  function renderForm() {
    if (stage === 'success') {
      return (
        <div className="flex items-center gap-2 py-1">
          <Check size={16} className="text-accent flex-shrink-0" />
          <p className="text-background text-sm font-body font-medium">You&apos;re in.</p>
        </div>
      );
    }

    if (stage === 'email_sent') {
      return (
        <div>
          <div className="flex items-start gap-2 mb-3">
            <Check size={15} className="text-accent mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-background text-sm font-body font-medium">Link sent</p>
              <p className="text-background/60 text-sm font-body mt-0.5">
                Check {flow.contactValue} and click the link to continue.
              </p>
            </div>
          </div>
          {resendCooldown > 0 ? (
            <p className="text-background/50 text-xs font-body" aria-live="polite">
              Resend in {resendCooldown}s
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="text-background/80 text-sm font-body hover:text-background underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-background/40 rounded"
            >
              Resend link
            </button>
          )}
        </div>
      );
    }

    if (stage === 'otp_input' || stage === 'verifying') {
      return (
        <div>
          <p className="text-background text-sm font-body font-medium mb-0.5">Code sent</p>
          <p className="text-background/60 text-sm font-body mb-3">
            Enter the code sent to {flow.contactValue}
          </p>
          <form onSubmit={handleOtpSubmit} className="flex gap-2" noValidate>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpValue}
              onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="------"
              aria-label="6-digit verification code"
              autoComplete="one-time-code"
              className="flex-1 bg-background/10 border border-background/20 rounded-lg px-3 py-2 text-sm font-mono text-background placeholder-background/30 text-center tracking-[0.3em] focus:outline-none focus:border-background/40 focus:ring-1 focus:ring-background/20 transition-all"
            />
            <button
              type="submit"
              disabled={otpValue.length !== 6 || stage === 'verifying'}
              aria-label="Verify code"
              className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent hover:bg-accent-hover text-background flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
            >
              {stage === 'verifying' ? <Spinner /> : <ArrowRight size={15} />}
            </button>
          </form>
          {error && (
            <p className="mt-2 text-xs text-amber-600/90 font-body" role="alert" aria-live="polite">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleResend}
            className="mt-2 text-background/50 text-xs font-body hover:text-background transition-colors focus:outline-none focus-visible:underline"
          >
            Resend code
          </button>
        </div>
      );
    }

    if (stage === 'expired' || stage === 'error') {
      return (
        <div>
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle size={15} className="text-amber-600/90 mt-0.5 flex-shrink-0" />
            <p className="text-background text-sm font-body">
              {stage === 'expired'
                ? 'The link has expired.'
                : (error ?? 'Something went wrong.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              flow.reset();
              setNameError(null);
              setInputValue('');
              setContactError(null);
              setOtpValue('');
              setResendCooldown(0);
            }}
            className="flex items-center gap-1.5 text-background/80 text-sm font-body hover:text-background transition-colors focus:outline-none focus-visible:underline"
          >
            <RotateCcw size={13} />
            Try again
          </button>
        </div>
      );
    }

    // idle + sending
    const isSending = stage === 'sending';
    return (
      <div>
        {/* Name — goes to users.name (column exists). members has no name column. */}
        <input
          type="text"
          value={nameValue}
          onChange={e => { setNameValue(e.target.value); setNameError(null); }}
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="given-name"
          className={inputCls}
        />
        {nameError && (
          <p className="mt-1.5 text-xs text-amber-600/90 font-body" role="alert" aria-live="polite">
            {nameError}
          </p>
        )}

        <hr className="border-background/15 my-4" />

        {/* Email / Phone tab toggle */}
        <div
          role="tablist"
          aria-label="Sign-in method"
          className="flex gap-0.5 mb-3 bg-background/10 rounded-lg p-0.5"
        >
          {(['email', 'phone'] as const).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setInputValue('');
                setContactError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-body font-medium transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-background/40 ${
                tab === t
                  ? 'bg-accent text-background shadow-sm'
                  : 'text-background/60 hover:text-background'
              }`}
            >
              {t === 'email' ? <Mail size={12} /> : <Phone size={12} />}
              {t === 'email' ? 'Email' : 'Phone'}
            </button>
          ))}
        </div>

        {/* Contact input */}
        <form onSubmit={handleContactSubmit} className="flex gap-2" noValidate>
          <input
            ref={inputRef}
            type={tab === 'email' ? 'email' : 'tel'}
            inputMode={tab === 'email' ? 'email' : 'tel'}
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setContactError(null); }}
            placeholder={tab === 'email' ? 'your@email.com' : '+1 (555) 000-0000'}
            autoComplete={tab === 'email' ? 'email' : 'tel'}
            aria-label={tab === 'email' ? 'Email address' : 'Phone number'}
            disabled={isSending}
            className={inputCls}
          />
          <div id="clerk-captcha" />
          <button
            type="submit"
            disabled={!inputValue.trim() || isSending}
            aria-label={tab === 'email' ? 'Send magic link' : 'Send code'}
            className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent hover:bg-accent-hover text-background flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
          >
            {isSending ? <Spinner /> : <ArrowRight size={15} />}
          </button>
        </form>
        {contactError && (
          <p className="mt-1.5 text-xs text-amber-600/90 font-body" role="alert" aria-live="polite">
            {contactError}
          </p>
        )}

        {stage === 'idle' && error && (
          <p className="mt-2 text-xs text-amber-600/90 font-body" role="alert" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* CTA button — left-aligned with the composer. Colors via Tailwind tokens;
          font size, font family, and exact padding kept as inline style per spec. */}
      <div className="max-w-2xl mx-auto px-4 mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Save this chat to your book"
          className="flex items-center gap-2 rounded-lg font-medium bg-accent text-background hover:opacity-90 active:opacity-75 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-accent"
          style={{
            fontSize: '14.5px',
            fontFamily: 'system-ui, sans-serif',
            padding: '11px 22px',
          }}
        >
          <Bookmark size={15} />
          Save this chat
        </button>
      </div>

      {/* Auth modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Save your chat"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Card — eggshell (bg-text-primary) background, dark text throughout.
              Bottom sheet on mobile, centered card on sm+. */}
          <div className="relative z-10 w-full sm:max-w-sm sm:mx-4 bg-text-primary rounded-t-2xl sm:rounded-2xl px-6 py-6">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="absolute top-4 right-4 grid place-items-center w-7 h-7 rounded-md text-background/40 hover:text-background transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-background/40"
            >
              <X size={16} />
            </button>

            <p className="text-background font-display font-semibold text-lg mb-1 pr-8">
              Save your story
            </p>
            <p className="text-background/60 text-sm font-body mb-5">
              Create a free account to keep this conversation and pick up where you left off.
            </p>

            {renderForm()}
          </div>
        </div>
      )}
    </>
  );
}
