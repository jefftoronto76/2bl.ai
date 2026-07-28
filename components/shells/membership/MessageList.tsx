'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FileText, AudioLines, Image as ImageIcon, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuthUser } from '@/services/auth/client';
import { Message, useChatStore, type ClientMediaItem } from './chatStore';
import { MagicLinkCard } from './MagicLinkCard';
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry';
import { ChatThread } from '@/components/chat/ChatThread';
import { DeliveryStatus } from '@/components/chat/DeliveryStatus';
import { MessageActions } from '@/components/chat/MessageActions';
import { UserMessageActions } from '@/components/chat/UserMessageActions';
import { EditableUserBubble } from '@/components/chat/EditableUserBubble';
import { useMessageFeedback, type UseMessageFeedbackReturn } from '@/services/chat/ui/v1/useMessageFeedback';
import { membershipMarkdownComponents } from './markdownComponents';
import { ERROR_COPY } from '@/components/chat/errorCopy';
import type { ChatErrorType, MarkerParseResult } from '@/services/chat/ui/v1/types';


interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null;
}

const dotDelays = ['delay-[0ms]', 'delay-[150ms]', 'delay-[300ms]'];

// Strip every marker ([BOOKING: ...], [NAME: ...], …) from assistant prose so
// they never render as raw bracket text. Heirloom has no booking-card UI yet,
// so booking cards are dropped and only the surrounding prose is shown.
const markerRegistry = createDefaultRegistry();

// Shown to platform_admin users only — never to regular members.
// Renders the raw marker bracket text that was stripped from displayed prose.
function DebugPill({ raw }: { raw: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-black/60 border border-white/10 w-fit">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted opacity-50 select-none">
        debug
      </span>
      <span className="font-mono text-xs text-text-muted opacity-75 break-all">
        {raw}
      </span>
    </div>
  );
}

// ── Media parsing ─────────────────────────────────────────────────────────────

const MEDIA_UPLOAD_RE = /\[MEDIA_UPLOAD:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]/g;
const MEDIA_FAILED_RE = /\[MEDIA_UPLOAD_FAILED:\s*([^\]]+?)\s*\]/g;

interface ParsedUserMessage {
  uploads: Array<{ filename: string; mediaItemId: string; type: string }>;
  failures: Array<{ filename: string }>;
  text: string;
}

function parseUserMessage(content: string): ParsedUserMessage {
  const uploads: ParsedUserMessage['uploads'] = [];
  const failures: ParsedUserMessage['failures'] = [];

  let m: RegExpExecArray | null;
  MEDIA_UPLOAD_RE.lastIndex = 0;
  while ((m = MEDIA_UPLOAD_RE.exec(content)) !== null) {
    uploads.push({ filename: m[1].trim(), mediaItemId: m[2].trim(), type: m[3].trim() });
  }
  MEDIA_FAILED_RE.lastIndex = 0;
  while ((m = MEDIA_FAILED_RE.exec(content)) !== null) {
    failures.push({ filename: m[1].trim() });
  }

  const text = content
    .replace(/\[MEDIA_UPLOAD:[^\]]+\]/g, '')
    .replace(/\[MEDIA_UPLOAD_FAILED:[^\]]+\]/g, '')
    .trim();

  return { uploads, failures, text };
}

// ── Inline media components ───────────────────────────────────────────────────

function MediaStatusBadge({ item, small = false }: { item: ClientMediaItem | undefined; small?: boolean }) {
  const sz = small ? 9 : 11;
  const textCls = small ? 'text-[10px]' : 'text-[10.5px]';
  if (!item || item.status === 'pending' || item.status === 'processing') {
    return (
      <>
        <Loader2 size={sz} className="text-text-muted animate-spin flex-shrink-0" />
        <span className={`font-mono ${textCls} text-text-muted`}>Processing…</span>
      </>
    );
  }
  if (item.status === 'ready') {
    return (
      <>
        <CheckCircle size={sz} className="text-accent flex-shrink-0" />
        <span className={`font-mono ${textCls} text-text-muted`}>{item.classification ?? 'Ready'}</span>
      </>
    );
  }
  return (
    <>
      <XCircle size={sz} className="text-red-400 flex-shrink-0" />
      <span className={`font-mono ${textCls} text-red-400`}>Processing failed</span>
    </>
  );
}

/** Inline image preview — shown in the user message thread immediately on upload.
 *  Falls back to a signed URL fetch when localPreviewUrl is not available (page reload). */
function InlineImage({ mediaItemId, filename, item }: {
  mediaItemId: string;
  filename: string;
  item: ClientMediaItem | undefined;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const src = item?.localPreviewUrl ?? signedUrl;

  useEffect(() => {
    if (item?.localPreviewUrl) return;
    fetch(`/api/media/${mediaItemId}/url`)
      .then(r => r.json())
      .then((d: { url?: string }) => { if (d.url) setSignedUrl(d.url); })
      .catch(() => {});
  }, [mediaItemId, item?.localPreviewUrl]);

  return (
    <div className="flex justify-end">
      <div className="flex flex-col items-end gap-1.5 max-w-[75%]">
        {src ? (
          <img
            src={src}
            alt={filename}
            className="rounded-2xl rounded-br-sm max-h-72 w-auto object-cover"
          />
        ) : (
          <div className="w-48 h-36 rounded-2xl rounded-br-sm bg-surface border border-border flex items-center justify-center">
            <ImageIcon size={22} className="text-text-muted opacity-30" />
          </div>
        )}
        <div className="flex items-center gap-1.5 pr-0.5">
          <MediaStatusBadge item={item} small />
        </div>
      </div>
    </div>
  );
}

/** Chip for audio/document uploads — shown inline in the user message thread. */
function InlineFileChip({ filename, type, item }: {
  filename: string;
  type: string;
  item: ClientMediaItem | undefined;
}) {
  const icon = type === 'audio'
    ? <AudioLines size={13} />
    : <FileText size={13} />;
  return (
    <div className="flex justify-end">
      <div className="flex items-start gap-2.5 max-w-[75%] rounded-2xl rounded-br-sm border border-border bg-surface px-3.5 py-2.5">
        <span className="flex-shrink-0 mt-0.5 text-accent">{icon}</span>
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-[12.5px] font-body text-text-primary truncate leading-tight">{filename}</span>
          <div className="flex items-center gap-1.5">
            <MediaStatusBadge item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small chip for uploads that failed before reaching the server. */
function FailedUploadChip({ filename }: { filename: string }) {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-2 max-w-[75%] rounded-2xl rounded-br-sm border border-red-400/20 bg-surface px-3.5 py-2 text-red-400">
        <XCircle size={12} className="flex-shrink-0" />
        <span className="font-mono text-[10.5px] truncate">{filename} — upload failed</span>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  content,
  status,
  onRetry,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onResend,
}: {
  message: Message;
  content: string;
  /** User messages only — delivery status of this message's send attempt. */
  status?: 'sending' | 'sent' | 'failed';
  onRetry?: () => void;
  /** User messages only — Edit/Copy/Send again row (components/chat/UserMessageActions.tsx). */
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  onResend?: () => void;
}) {
  const isUser = message.role === 'user';
  const deliveryStatus = isUser ? status ?? 'sent' : 'sent';

  // Swaps the bubble in place for the editing textarea — same position, no
  // layout jump. DeliveryStatus/UserMessageActions never render alongside it.
  if (isUser && isEditing && onCancelEdit && onSaveEdit) {
    return (
      <div className="flex justify-end">
        <EditableUserBubble initialValue={content} onCancel={onCancelEdit} onSave={onSaveEdit} />
      </div>
    );
  }

  // Assistant path — never actually exercised (MessageBubble is only ever
  // called with a user message; see makeRenderUserMessage) but kept intact.
  if (!isUser) {
    return (
      <div className="group flex flex-col items-start gap-1.5">
        <div className="flex gap-3 justify-start">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
            <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
          </div>
          <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-transparent px-4 py-3 font-body text-base leading-relaxed whitespace-pre-wrap text-text-primary">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    // flex-col + items-end (not grid): each child right-aligns to the
    // container's own edge independently, regardless of its own width — this
    // is what actually guarantees the action row's right edge lands under
    // the bubble's. A prior "grid" version of this got that backwards: a
    // single-column CSS grid stretches every item to a shared track width
    // (default justify-items: stretch), and that track is sized to the
    // WIDEST row's max-content — usually the actions row, not the bubble —
    // so the bubble's own max-w-[90%] resolved against the actions row's
    // width instead of the real container, and the two rows' right edges
    // didn't actually align. Verified empirically (Playwright/Chromium
    // harness reproducing this exact DOM+CSS) before reverting.
    <div className="group flex flex-col items-end gap-1.5">
      <div className={deliveryStatus === 'failed' ? 'chat-bubble-shake' : undefined}>
        <div
          onClick={deliveryStatus === 'failed' ? onRetry : undefined}
          className={[
            // Visitor bubble spec (docs/spec_visitor_bubble.md): shrink-to-fit
            // measure, 18px radius with a 5px bottom-right tail, 15.5/1.62
            // type ramp. Widened past the spec's original 76% (2026-07-28) —
            // it read as cramped next to the assistant's much wider reply.
            'w-fit max-w-[90%] rounded-[18px] rounded-br-[5px] border px-4 py-3 font-body text-[15.5px] leading-[1.62] whitespace-pre-wrap text-text-primary',
            deliveryStatus === 'failed' ? 'cursor-pointer bg-red-400/10 border-red-400/45' : 'bg-surface border-border',
            deliveryStatus === 'sending' ? 'opacity-55' : '',
          ].filter(Boolean).join(' ')}
        >
          {content}
        </div>
      </div>
      {onRetry && <DeliveryStatus status={deliveryStatus} onRetry={onRetry} />}
      {deliveryStatus === 'sent' && onStartEdit && onResend && (
        <UserMessageActions content={content} edited={message.edited} onEdit={onStartEdit} onResend={onResend} />
      )}
    </div>
  );
}

// Same avatar + bubble chrome as MessageBubble's assistant branch, but
// renders a markdown ReactNode instead of a plain string — markdown owns its
// own block spacing, so whitespace-pre-wrap is dropped here.
function AssistantMarkdownBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-transparent px-4 py-3 font-body text-base leading-relaxed text-text-primary">
        {children}
      </div>
    </div>
  );
}

function ErrorBubble({ retry, errorType }: { retry: () => void; errorType: ChatErrorType }) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
      </div>
      <div className="max-w-[75%] flex flex-col items-start gap-2 rounded-2xl rounded-bl-sm px-4 py-3 font-body text-base leading-relaxed bg-transparent text-text-primary">
        <span>{ERROR_COPY[errorType]}</span>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-text-muted transition-colors hover:border-border/80 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
      </div>
      <div className="bg-surface rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {dotDelays.map((d, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce ${d}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Renders a user message exactly as before: the admin-only [SYSTEM:] debug
// branch, then media chips (image/audio/document/failed), then prose — now
// with the Edit/Copy/Send again row (or the editing textarea) below the prose.
function makeRenderUserMessage(
  isAdmin: boolean,
  mediaItems: ClientMediaItem[],
  retry: () => void,
  editingId: string | null,
  setEditingId: (id: string | null) => void,
  editMessage: (id: string, text: string) => Promise<void>,
  resendMessage: (id: string) => Promise<void>,
) {
  return function renderUserMessage(msg: Message): ReactNode {
    // Admin debug: [SYSTEM: ...] signals are sent via sendHidden and never
    // added to the store, so this branch handles any future case where
    // system-tagged content reaches messages (e.g. a stored hidden turn),
    // without touching non-admin paths.
    if (isAdmin && /^\[SYSTEM:\s*[^\]]*\]/.test(msg.content.trim())) {
      return (
        <div key={msg.id} className="flex justify-end">
          <DebugPill raw={msg.content.trim()} />
        </div>
      );
    }

    const userMsg = parseUserMessage(msg.content);

    return (
      <div key={msg.id} className="flex flex-col gap-2">
        {/* Image uploads — full-width preview above prose */}
        {userMsg.uploads
          .filter(u => u.type === 'image')
          .map(u => (
            <InlineImage
              key={u.mediaItemId}
              mediaItemId={u.mediaItemId}
              filename={u.filename}
              item={mediaItems.find(m => m.id === u.mediaItemId)}
            />
          ))}
        {/* Audio / document chips */}
        {userMsg.uploads
          .filter(u => u.type !== 'image')
          .map(u => (
            <InlineFileChip
              key={u.mediaItemId}
              filename={u.filename}
              type={u.type}
              item={mediaItems.find(m => m.id === u.mediaItemId)}
            />
          ))}
        {/* Failed-before-server uploads */}
        {userMsg.failures.map((f, idx) => (
          <FailedUploadChip key={idx} filename={f.filename} />
        ))}
        {/* Prose — only when there's actual text alongside the upload */}
        {userMsg.text && (
          <MessageBubble
            message={msg}
            content={userMsg.text}
            status={msg.status}
            onRetry={retry}
            isEditing={editingId === msg.id}
            onStartEdit={() => setEditingId(msg.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={text => {
              setEditingId(null);
              void editMessage(msg.id, text);
            }}
            onResend={() => void resendMessage(msg.id)}
          />
        )}
      </div>
    );
  };
}

interface AssistantRenderConfig {
  isAdmin: boolean;
  inviteToken: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  handleAuthSuccess: (name: string) => void;
  messages: Message[];
  isStreaming: boolean;
  regenerate: (id: string) => void;
  setActiveVersion: (id: string, versionIdx: number) => void;
  feedback: UseMessageFeedbackReturn;
}

// Renders an assistant message exactly as before: prose bubble, the
// ACCOUNT_CREATE → MagicLinkCard prompt, and admin-only debug pills for every
// parsed marker. Adds the MessageActions row (Copy/Regenerate/version
// carousel) below the prose, aligned under the avatar like the debug pills.
function makeRenderAssistantMessage(config: AssistantRenderConfig) {
  return function renderAssistantMessage(
    msg: Message,
    parsed: MarkerParseResult,
    markdown: ReactNode,
  ): ReactNode {
    const prose = parsed.prose;
    const authPrompt = parsed.markers.find((m) => m.type === 'ACCOUNT_CREATE');
    // All parsed markers (NAME, EMAIL, PHONE, BOOKING, ACCOUNT_CREATE) are
    // shown as debug pills when admin. parsed.markers is already populated
    // by the registry — debug view is purely additive display.
    const debugMarkers = config.isAdmin ? parsed.markers : [];

    // Skip empty assistant messages — no prose, no auth prompt, no debug.
    if (!prose && !authPrompt && debugMarkers.length === 0) return null;

    // Suppress actions on the message currently being streamed into; scope
    // Regenerate to the latest assistant message only (see MessageActions.tsx).
    const messageIndex = config.messages.findIndex((m) => m.id === msg.id);
    const isLast = config.messages[config.messages.length - 1]?.id === msg.id;
    const isActive = config.isStreaming && isLast;
    const versions = msg.versions ?? [];
    const versionIdx = msg.versionIdx ?? 0;
    const { rating } = config.feedback.getFeedback(messageIndex);

    return (
      <div key={msg.id} className="group flex flex-col gap-3">
        {prose && <AssistantMarkdownBubble>{markdown}</AssistantMarkdownBubble>}
        {prose && !isActive && (
          <div className="ml-11">
            <MessageActions
              content={msg.content}
              stopped={msg.stopped}
              versionIdx={versionIdx}
              versionCount={versions.length}
              onRegenerate={isLast ? () => config.regenerate(msg.id) : undefined}
              onVersionChange={(dir) => config.setActiveVersion(msg.id, versionIdx + dir)}
              rating={rating}
              onRate={(val) => config.feedback.rate(messageIndex, val)}
              onFeedback={(reasons, note) => config.feedback.submitFeedback(messageIndex, reasons, note)}
            />
          </div>
        )}
        {authPrompt && (
          <MagicLinkCard
            reason={authPrompt.fields[0] || undefined}
            initialName={config.visitorName}
            initialEmail={config.visitorEmail}
            initialPhone={config.visitorPhone}
            inviteToken={config.inviteToken}
            onSuccess={config.handleAuthSuccess}
          />
        )}
        {debugMarkers.length > 0 && (
          <div className="flex flex-col gap-1.5 ml-11">
            {debugMarkers.map((m, idx) => (
              <DebugPill key={idx} raw={m.raw} />
            ))}
          </div>
        )}
      </div>
    );
  };
}

function renderError(retry: () => void, errorType: ChatErrorType): ReactNode {
  return <ErrorBubble retry={retry} errorType={errorType} />;
}

function renderStreamingIndicator(): ReactNode {
  return <TypingIndicator />;
}

export function MessageList({ messages, isLoading, errorType }: MessageListProps) {
  const {
    claimCurrentSession,
    inviteToken,
    mediaItems,
    retry,
    regenerate,
    setActiveVersion,
    editMessage,
    resendMessage,
    state,
  } = useChatStore();
  const feedback = useMessageFeedback(state.sessionId);
  const { user } = useAuthUser();

  // Which user message (if any) is currently swapped into its editing
  // textarea — local, single-message-at-a-time, doesn't need to survive reload.
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    if (editingId && !messages.some(m => m.id === editingId)) setEditingId(null);
  }, [editingId, messages]);

  // Gate strictly on the boundary's isPlatformAdmin (provider-resolved inside
  // services/auth) — never expose debug view to members.
  const isAdmin = user?.isPlatformAdmin === true;

  // Scans every assistant message for the first NAME/EMAIL/PHONE marker, to
  // pre-fill MagicLinkCard fields. Separate from ChatThread's per-message
  // render-time parse (which only sees one message at a time) — this needs
  // every message at once, so it keeps its own registry.parse() pass.
  const scanned = messages.map((m) =>
    m.role === 'assistant' ? markerRegistry.parse(m.content) : null,
  );

  const visitorName = scanned
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'NAME')
    ?.fields[0] ?? null;

  const visitorEmail = scanned
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'EMAIL')
    ?.fields[0] ?? null;

  const visitorPhone = scanned
    .flatMap((r) => r?.markers ?? [])
    .find((m) => m.type === 'PHONE')
    ?.fields[0] ?? null;

  // Called from MagicLinkCard.onSuccess: claim the anonymous session, then
  // sync the newly-authenticated user into the members table with their name.
  const handleAuthSuccess = useCallback(async (name: string) => {
    await claimCurrentSession();
    await fetch('/api/members/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || null }),
    }).catch((err) =>
      console.error('[heirloom/MessageList] members sync failed:', err),
    );
  }, [claimCurrentSession]);

  return (
    <div
      className="flex-1 overflow-y-auto overscroll-contain px-4 py-6"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      aria-atomic="false"
      aria-busy={isLoading}
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <ChatThread
          messages={messages}
          isStreaming={isLoading}
          errorType={errorType}
          retry={retry}
          renderUserMessage={makeRenderUserMessage(
            isAdmin,
            mediaItems,
            retry,
            editingId,
            setEditingId,
            editMessage,
            resendMessage,
          )}
          renderAssistantMessage={makeRenderAssistantMessage({
            isAdmin,
            inviteToken,
            visitorName,
            visitorEmail,
            visitorPhone,
            handleAuthSuccess,
            messages,
            isStreaming: isLoading,
            regenerate,
            setActiveVersion,
            feedback,
          })}
          renderError={renderError}
          renderStreamingIndicator={renderStreamingIndicator}
          showStreamingIndicator={isLoading}
          markdownComponents={membershipMarkdownComponents}
          scrollBehavior="smooth"
          scrollDeps={[messages, isLoading, errorType]}
        />
      </div>
    </div>
  );
}
