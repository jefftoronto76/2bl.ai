'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FileText, AudioLines, Image as ImageIcon, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuthUser } from '@/services/auth/client';
import { Message, useChatStore, type ClientMediaItem } from './chatStore';
import { MagicLinkCard } from './MagicLinkCard';
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry';
import { ChatThread } from '@/components/chat/ChatThread';
import type { MarkerParseResult } from '@/services/chat/ui/v1/types';


interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isError: boolean;
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

function MessageBubble({ message, content }: { message: Message; content: string }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
          <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 font-body text-base leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-surface text-text-primary rounded-br-sm'
            : 'bg-transparent text-text-primary rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function ErrorBubble() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center overflow-hidden mt-0.5">
        <img src="/heirloom/favicons/icons/heirloom-feather-cream.svg" alt="" width="22" height="22" />
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-3 font-body text-base leading-relaxed bg-transparent text-text-primary">
        Something went wrong reaching your story guide. Please try again in a moment.
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
// branch, then media chips (image/audio/document/failed), then prose.
function makeRenderUserMessage(isAdmin: boolean, mediaItems: ClientMediaItem[]) {
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
        {userMsg.text && <MessageBubble message={msg} content={userMsg.text} />}
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
}

// Renders an assistant message exactly as before: prose bubble, the
// ACCOUNT_CREATE → MagicLinkCard prompt, and admin-only debug pills for every
// parsed marker.
function makeRenderAssistantMessage(config: AssistantRenderConfig) {
  return function renderAssistantMessage(msg: Message, parsed: MarkerParseResult): ReactNode {
    const prose = parsed.prose;
    const authPrompt = parsed.markers.find((m) => m.type === 'ACCOUNT_CREATE');
    // All parsed markers (NAME, EMAIL, PHONE, BOOKING, ACCOUNT_CREATE) are
    // shown as debug pills when admin. parsed.markers is already populated
    // by the registry — debug view is purely additive display.
    const debugMarkers = config.isAdmin ? parsed.markers : [];

    // Skip empty assistant messages — no prose, no auth prompt, no debug.
    if (!prose && !authPrompt && debugMarkers.length === 0) return null;

    return (
      <div key={msg.id} className="flex flex-col gap-3">
        {prose && <MessageBubble message={msg} content={prose} />}
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

function renderError(): ReactNode {
  return <ErrorBubble />;
}

function renderStreamingIndicator(): ReactNode {
  return <TypingIndicator />;
}

export function MessageList({ messages, isLoading, isError }: MessageListProps) {
  const { claimCurrentSession, inviteToken, mediaItems } = useChatStore();
  const { user } = useAuthUser();

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
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <ChatThread
          messages={messages}
          isStreaming={isLoading}
          isError={isError}
          // Membership has no retry capability wired to its UI today (no
          // button reads this) — renderError below never invokes it. Passed
          // as a no-op only to satisfy ChatThread's shared contract.
          retry={() => {}}
          renderUserMessage={makeRenderUserMessage(isAdmin, mediaItems)}
          renderAssistantMessage={makeRenderAssistantMessage({
            isAdmin,
            inviteToken,
            visitorName,
            visitorEmail,
            visitorPhone,
            handleAuthSuccess,
          })}
          renderError={renderError}
          renderStreamingIndicator={renderStreamingIndicator}
          showStreamingIndicator={isLoading}
          scrollBehavior="smooth"
          scrollDeps={[messages, isLoading, isError]}
        />
      </div>
    </div>
  );
}
