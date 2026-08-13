'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Plus,
  Mic,
  Square,
  X,
  Check,
  FileText,
  AudioLines,
  Lock,
  Maximize2,
} from 'lucide-react';
import { useMediaQuery } from '@mantine/hooks';
import { useChatStore } from './chatStore';
import { useMediaUpload } from '@/services/media/useMediaUpload';
import { SourceMenu, type SourceKey } from './SourceMenu';
import { VoiceImmersive } from './VoiceImmersive';
import { useChatOverlayHost } from './v2/ChatOverlayHost';

/* ------------------------------------------------------------------ *
 * ChatInput — composer with file attachments + voice capture.
 *
 * Voice flow (two steps):
 *   1. mic (or "+" → Record audio) starts the INLINE recording bar.
 *   2. the Expand ⤢ button promotes it to the full-screen VoiceImmersive
 *      surface (portaled into ChatDrawerV2's relative body; Minimize ▢
 *      collapses back to the inline bar). Cancel/Done behave identically in
 *      both. The MediaRecorder + elapsed timer + transcribe live here, so the
 *      inline bar and the full-screen surface always share one session/clock.
 * ------------------------------------------------------------------ */

const cn = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

interface Attachment {
  id: string;
  file: File;
  /** Object URL for image previews; revoked on removal. */
  previewUrl?: string;
  /** Natural pixel dimensions read from the file at pick time (image only) —
   *  undefined until the async read resolves. See addFiles. */
  width?: number;
  height?: number;
}

let _aid = 0;
const attachmentId = () => `att_${++_aid}`;

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Same classification useMediaUpload.ts's own (unexported) classifyFile uses
 * — duplicated rather than imported so the optimistic echo (client-only,
 * pre-upload) never depends on useMediaUpload.ts, which stays untouched.
 */
function classifyAttachmentType(file: File): 'audio' | 'image' | 'document' {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'document';
}

/**
 * POSTs audio to /api/transcribe and returns the transcript.
 * Throws on non-ok responses so the caller can surface the error state.
 */
async function fetchTranscript(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'recording.webm');
  const res = await fetch('/api/transcribe', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

function fmtClock(secs: number): string {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

/* --- Attachment chip -------------------------------------------------- */
function AttachmentChip({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  const isImage = att.file.type.startsWith('image/');
  const isAudio = att.file.type.startsWith('audio/');
  return (
    <div className="flex items-center gap-2.5 max-w-[220px] rounded-xl border border-border bg-background pl-2 pr-2 py-1.5">
      <span className="flex-shrink-0 grid place-items-center w-8 h-8 rounded-lg bg-accent/15 text-accent overflow-hidden">
        {isImage && att.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={att.previewUrl} alt="" className="w-full h-full object-cover" />
        ) : isAudio ? (
          <AudioLines size={15} />
        ) : (
          <FileText size={15} />
        )}
      </span>
      <span className="min-w-0 flex flex-col leading-tight">
        <span className="truncate text-[12.5px] text-text-primary">{att.file.name}</span>
        <span className="font-mono text-[10.5px] text-text-muted">{prettySize(att.file.size)}</span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${att.file.name}`}
        onClick={onRemove}
        className="flex-shrink-0 grid place-items-center w-[18px] h-[18px] rounded-md text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/* --- Voice recording bar (STEP 1, inline) ----------------------------- */
const WAVE_HEIGHTS = [
  0.5, 0.85, 0.35, 1, 0.6, 0.9, 0.45, 0.75, 1, 0.55, 0.8, 0.4, 0.95, 0.6, 0.7, 0.5, 0.88, 0.42, 0.66, 0.9,
];

function VoiceBar({
  elapsed,
  onCancel,
  onExpand,
  onConfirm,
}: {
  elapsed: string;
  onCancel: () => void;
  onExpand: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex items-center gap-3 w-full pl-3.5 pr-1.5 py-1.5">
      <button
        type="button"
        aria-label="Cancel recording"
        onClick={onCancel}
        className="flex-shrink-0 grid place-items-center w-[34px] h-[34px] rounded-[10px] border border-border text-text-muted hover:text-text-primary hover:border-border/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X size={16} />
      </button>

      <span className="flex-shrink-0 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-accent animate-recpulse" />
        <span className="font-mono text-[13px] tracking-wide text-text-primary tabular-nums min-w-[42px]">
          {elapsed}
        </span>
      </span>

      <div className="flex-1 flex items-center gap-[3px] h-[34px] overflow-hidden" aria-hidden="true">
        {WAVE_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="flex-1 max-w-[4px] h-full rounded bg-accent/60 origin-center animate-waveform"
            style={{
              transform: `scaleY(${h})`,
              animationDuration: `${0.7 + (i % 5) * 0.12}s`,
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Expand to full screen"
        title="Expand to full screen"
        onClick={onExpand}
        className="flex-shrink-0 grid place-items-center w-[34px] h-[34px] rounded-[10px] text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Maximize2 size={17} />
      </button>

      <button
        type="button"
        aria-label="Finish recording"
        onClick={onConfirm}
        className="flex-shrink-0 grid place-items-center w-[34px] h-[34px] rounded-[10px] bg-accent hover:bg-accent-hover text-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Check size={17} />
      </button>
    </div>
  );
}

/* --- Transcribing pill ------------------------------------------------ */
function TranscribingPill() {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-text-muted font-body">
      <span className="flex-shrink-0 h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      Transcribing…
    </div>
  );
}

/* --- Composer --------------------------------------------------------- */
type TranscribeState = 'idle' | 'transcribing' | 'error' | 'empty';

export function ChatInput() {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceFullscreen, setIsVoiceFullscreen] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [transcribeState, setTranscribeState] = useState<TranscribeState>('idle');
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const plusWrapRef = useRef<HTMLDivElement>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMobile = useMediaQuery('(max-width: 768px)') ?? false;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const { sendMessage, injectAssistantMessage, state, addMediaItem, setPendingEcho, stop } = useChatStore();
  const { isMember } = state;

  const overlayHost = useChatOverlayHost();

  const { upload, isUploading } = useMediaUpload(state.sessionId, null);

  // The guide's current question — newest assistant turn, shown atop the
  // full-screen surface. Optional-chained so it never throws if the store
  // shape differs; falls back to a gentle default inside VoiceImmersive.
  const voiceQuestion = (() => {
    const msgs = (state as { messages?: Array<{ role?: string; content?: string }> })?.messages;
    const last = msgs?.slice().reverse().find((m) => m?.role === 'assistant')?.content;
    return typeof last === 'string' && last.trim() ? last : undefined;
  })();

  const elapsed = fmtClock(elapsedSecs);

  const startTimer = () => {
    setElapsedSecs(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setElapsedSecs((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };
  useEffect(() => () => stopTimer(), []);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !state.isLoading && !isUploading;

  const handleSend = async () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || state.isLoading || isUploading) return;

    // Clear UI immediately so the composer feels responsive while uploads happen.
    const pendingAttachments = [...attachments];
    // Attachment preview blob URLs are kept alive (not revoked here) when
    // there are pending attachments — the optimistic echo below needs them
    // for the duration of the upload. Revoked once the echo clears, further
    // down. A text-only send has nothing to revoke either way.
    if (pendingAttachments.length === 0) {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    }
    setValue('');
    setAttachments([]);
    setTranscribeState('idle');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (pendingAttachments.length > 0) {
      // Optimistic echo: the message (with each attachment's already-live
      // local preview) appears immediately, before any network call starts.
      // Purely visual — never touches mediaItems, never has an id. Cleared
      // the instant the real message exists (right after sendMessage below),
      // which happens in the same tick since useChatTurn's send() adds the
      // real message synchronously before its first await.
      setPendingEcho({
        text: trimmed,
        attachments: pendingAttachments.map((a) => ({
          filename: a.file.name,
          previewUrl: a.previewUrl,
          type: classifyAttachmentType(a.file),
          width: a.width,
          height: a.height,
        })),
      });

      // Upload each attachment and build a [MEDIA_UPLOAD: ...] acknowledgement
      // marker for each successful upload — or [MEDIA_UPLOAD_DUPLICATE: ...]
      // when the server reused an existing row (a content-hash match)
      // instead, so MessageList.tsx can render duplicate-specific messaging
      // rather than treating the reuse as a fresh attach. Failures are
      // logged; the text message still sends so the turn is never silently
      // dropped.
      const markers: string[] = [];
      await Promise.all(
        pendingAttachments.map(async (att) => {
          const result = await upload(att.file);
          if (result) {
            markers.push(
              result.duplicate
                ? `[MEDIA_UPLOAD_DUPLICATE: ${att.file.name} | ${result.mediaItemId} | ${result.type} | ${result.status}]`
                : `[MEDIA_UPLOAD: ${att.file.name} | ${result.mediaItemId} | ${result.type}]`,
            );
            // A fresh object URL, independent of att.previewUrl (which the
            // optimistic echo above is still using, and which handleSend
            // revokes once the echo clears, below) — this one is what the
            // real UploadThumbnail uses via ClientMediaItem.localPreviewUrl.
            const localPreviewUrl = att.file.type.startsWith('image/')
              ? URL.createObjectURL(att.file)
              : undefined;
            addMediaItem({
              id: result.mediaItemId,
              tenant_id: '',
              member_id: '',
              chat_id: state.sessionId,
              story_id: null,
              type: result.type,
              original_filename: att.file.name,
              storage_path: '',
              file_size_bytes: att.file.size,
              mime_type: att.file.type,
              // The real status the server reported — 'pending' for a fresh
              // upload, but a dedup match can reuse an already-'ready' (or
              // 'processing'/'pending') item; hardcoding 'pending' here used
              // to reset an already-delivered ready item back to pending on
              // every re-attach (see useMediaUpload.ts's UploadResult.status).
              status: result.status,
              derived_content: null,
              classification: null,
              error_message: null,
              processed_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              localPreviewUrl,
              width: att.width,
              height: att.height,
            });
          } else {
            // Upload failed — include the filename so the guide knows what was attempted.
            markers.push(`[MEDIA_UPLOAD_FAILED: ${att.file.name}]`);
          }
        }),
      );

      const parts = [...markers, trimmed].filter(Boolean);
      void sendMessage(parts.join('\n'));
      // send() adds the real user message synchronously before its first
      // await (useChatTurn.ts), so by this line it already exists — clear
      // the echo (and revoke its deferred preview URLs) in the same tick to
      // avoid any visible gap or flash between the two.
      setPendingEcho(null);
      pendingAttachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    } else {
      void sendMessage(trimmed);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB
  const DEFAULT_FILE_ACCEPT = '.m4a,.mp3,.wav,.ogg,.webm,.jpg,.jpeg,.png,.webp,.pdf,.docx,.txt';

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: Attachment[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        console.warn(`[ChatInput] ${file.name} exceeds 50 MB limit — skipped`);
        continue;
      }
      // Reject HEIC on the client side with a visible cue (skipped silently here;
      // the server also rejects with a user-friendly message if it slips through).
      if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
        console.warn(`[ChatInput] HEIC not supported — skipped: ${file.name}`);
        continue;
      }
      const isImage = file.type.startsWith('image/');
      const id = attachmentId();
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      next.push({ id, file, previewUrl });

      // Read natural dimensions off the same local blob URL — no network
      // round-trip, resolves essentially instantly for a local file. Patches
      // this specific attachment by id once known; a no-op if the attachment
      // was removed or already sent by the time it resolves (the functional
      // update below only touches an attachment still present in state).
      if (isImage && previewUrl) {
        const img = new Image();
        img.onload = () => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, width: img.naturalWidth, height: img.naturalHeight } : a,
            ),
          );
        };
        img.src = previewUrl;
      }
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 6)); // cap at 6
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const hit = prev.find((a) => a.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  /* --- Voice lifecycle (real MediaRecorder capture) --- */
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setTranscribeState('idle');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsVoiceFullscreen(false); // step 1 = inline; user expands to step 2
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('[chat-input] microphone unavailable or permission denied', err);
    }
  };

  const cancelRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = () => stopStream();
      mr.stop();
    } else {
      stopStream();
    }
    stopTimer();
    setIsVoiceFullscreen(false);
    setIsRecording(false);
  };

  // The composer is mounted once for the whole chat surface and stays
  // mounted across conversation switches (loadSession/newChat never remount
  // it) — without this, a staged attachment or draft typed for one
  // conversation silently carries into whatever conversation comes next.
  // Guarded on sessionId actually changing (not every render) — mirrors
  // chatStore.tsx's own hydrateConversation reset for mediaItemsRef.
  const prevSessionIdRef = useRef(state.sessionId);
  useEffect(() => {
    if (state.sessionId === prevSessionIdRef.current) return;
    prevSessionIdRef.current = state.sessionId;

    setAttachments((prev) => {
      prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTranscribeState('idle');
    cancelRecording(); // mid-recording switch = implicit cancel; no-op when nothing is recording
    setSourceMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId]);

  const confirmRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) {
      setIsRecording(false);
      setIsVoiceFullscreen(false);
      stopTimer();
      return;
    }
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      stopStream();
      stopTimer();
      lastBlobRef.current = blob;
      setIsVoiceFullscreen(false);
      setIsRecording(false);
      setTranscribeState('transcribing');
      try {
        const text = await fetchTranscript(blob);
        if (text) {
          setValue((v) => (v ? `${v} ` : '') + text);
          requestAnimationFrame(autoResize);
          setTranscribeState('idle');
        } else {
          setTranscribeState('empty');
        }
      } catch {
        setTranscribeState('error');
      }
    };
    mr.stop();
  };

  const handleRetry = async () => {
    if (!lastBlobRef.current) return;
    setTranscribeState('transcribing');
    try {
      const text = await fetchTranscript(lastBlobRef.current);
      if (text) {
        setValue((v) => (v ? `${v} ` : '') + text);
        requestAnimationFrame(autoResize);
        setTranscribeState('idle');
      } else {
        setTranscribeState('empty');
      }
    } catch {
      setTranscribeState('error');
    }
  };

  const handleMicClick = () => {
    if (!isMember) {
      injectAssistantMessage('🔒 Voice is a member feature.');
      return;
    }
    void startRecording();
  };

  const handleSource = (key: SourceKey) => {
    setSourceMenuOpen(false);
    switch (key) {
      case 'camera':  cameraInputRef.current?.click(); break;
      case 'library': imageInputRef.current?.click(); break;
      case 'scan': {
        if (!fileInputRef.current) break;
        fileInputRef.current.accept = 'image/*,application/pdf';
        fileInputRef.current.click();
        setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = DEFAULT_FILE_ACCEPT; }, 300);
        break;
      }
      case 'record': void startRecording(); break;
      case 'browse': fileInputRef.current?.click(); break;
    }
  };

  useEffect(() => {
    if (!sourceMenuOpen || isMobile) return;
    const onMouseDown = (e: MouseEvent) => {
      if (plusWrapRef.current && !plusWrapRef.current.contains(e.target as Node)) {
        setSourceMenuOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setSourceMenuOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [sourceMenuOpen, isMobile]);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="rounded-[22px] border border-border bg-surface p-1.5 transition-colors focus-within:border-accent/40">
        {/* hidden pickers */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={DEFAULT_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {isRecording ? (
          // Inline recording bar (step 1). When the user expands, the full-screen
          // surface renders over the whole drawer (portaled below); this bar stays
          // mounted so Minimize collapses straight back to it.
          <VoiceBar
            elapsed={elapsed}
            onCancel={cancelRecording}
            onExpand={() => setIsVoiceFullscreen(true)}
            onConfirm={confirmRecording}
          />
        ) : transcribeState === 'transcribing' ? (
          <TranscribingPill />
        ) : (
          <>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1.5 pt-1.5 pb-2">
                {attachments.map((att) => (
                  <AttachmentChip key={att.id} att={att} onRemove={() => removeAttachment(att.id)} />
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onInput={autoResize}
              onKeyDown={handleKeyDown}
              placeholder="Share a memory, or ask your guide anything"
              rows={1}
              autoComplete="off"
              className="block w-full bg-transparent text-text-primary placeholder-text-muted font-body text-base resize-none focus:outline-none leading-6 px-2.5 pt-2.5 pb-1 min-h-[28px] max-h-[200px]"
            />

            <div className="flex items-center gap-1 pl-0.5 pr-1 py-0.5">
              {/* "+" source menu button — member-only. Popover on desktop, sheet on mobile. */}
              <div ref={plusWrapRef} className="relative">
                <button
                  type="button"
                  aria-label="Add to your story"
                  aria-haspopup="menu"
                  aria-expanded={sourceMenuOpen}
                  aria-disabled={!isMember}
                  onClick={isMember ? () => setSourceMenuOpen((o) => !o) : undefined}
                  className={cn(
                    // Isolated (a flex-1 spacer separates this from Mic/Send
                    // to its right) — full 48x48 hit-area via before:.
                    "relative grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:inset-[-7px]",
                    isMember
                      ? 'bg-accent hover:bg-accent-hover text-background'
                      : 'bg-text-primary/10 text-text-muted opacity-40 cursor-not-allowed',
                  )}
                >
                  {isMember
                    ? <Plus size={20} className="transition-transform duration-200" style={{ transform: sourceMenuOpen ? 'rotate(45deg)' : 'none' }} />
                    : <Lock size={15} />
                  }
                </button>

                {/* Desktop popover — absolute, anchored to this wrapper */}
                {!isMobile && (
                  <SourceMenu
                    open={sourceMenuOpen}
                    variant="popover"
                    onSelect={handleSource}
                    onClose={() => setSourceMenuOpen(false)}
                  />
                )}
              </div>

              {/* Mobile sheet — portaled to body to escape transform ancestor */}
              {isMobile && (
                <SourceMenu
                  open={sourceMenuOpen}
                  variant="sheet"
                  onSelect={handleSource}
                  onClose={() => setSourceMenuOpen(false)}
                />
              )}

              <div className="flex-1" />

              <button
                type="button"
                aria-label={isMember ? 'Record voice' : 'Voice is a member feature'}
                title={isMember ? 'Record voice' : 'Voice is a member feature'}
                onClick={handleMicClick}
                className={cn(
                  // Adjacent to Send/Stop via gap-1 (4px) — half-gap (2px)
                  // horizontally to avoid overlapping its hit-zone; vertical
                  // is open so it expands fully.
                  "relative grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:-inset-y-[7px] before:-inset-x-[2px]",
                  isMember
                    ? 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                    : 'text-text-muted opacity-40',
                )}
              >
                {isMember ? <Mic size={18} /> : <Lock size={15} />}
              </button>
              {state.isLoading ? (
                <button
                  type="button"
                  aria-label="Stop generating"
                  onClick={stop}
                  className="relative grid place-items-center w-[34px] h-[34px] rounded-[10px] bg-accent hover:bg-accent-hover text-background transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:-inset-y-[7px] before:-inset-x-[2px]"
                >
                  <Square size={15} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Send message"
                  disabled={!canSend}
                  onClick={() => void handleSend()}
                  className={cn(
                    // Adjacent to Mic via gap-1 (4px) — half-gap (2px) on the
                    // shared left side; open on the right (row's outer edge)
                    // and vertically, so those expand fully.
                    "relative grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent before:absolute before:content-[''] before:-inset-y-[7px] before:-inset-x-[2px]",
                    canSend
                      ? 'bg-accent hover:bg-accent-hover text-background'
                      : 'bg-text-primary/10 text-text-muted cursor-not-allowed',
                  )}
                >
                  <ArrowUp size={17} />
                </button>
              )}
            </div>

            {(transcribeState === 'error' || transcribeState === 'empty') && (
              <div
                className="flex items-center gap-2 px-2.5 pb-2 text-xs text-amber-600/90 font-body"
                role="alert"
              >
                <span>
                  {transcribeState === 'error' ? "Couldn't transcribe —" : 'No speech detected —'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  className="underline underline-offset-2 hover:text-amber-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
                >
                  try again
                </button>
                <button
                  type="button"
                  onClick={() => setTranscribeState('idle')}
                  className="ml-auto text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Optional supporting caption — remove if undesired. */}
      <p className="text-center font-mono text-[11px] tracking-wide text-text-muted/70 mt-2.5">
        Your guide listens, asks, and never forgets a detail.
      </p>

      {/* STEP 2 · full-screen surface — portaled into ChatDrawerV2's relative body
          so it covers the whole drawer (absolute, transform-safe). */}
      {isRecording && isVoiceFullscreen && overlayHost &&
        createPortal(
          <VoiceImmersive
            elapsed={elapsed}
            question={voiceQuestion}
            onMinimize={() => setIsVoiceFullscreen(false)}
            onCancel={cancelRecording}
            onConfirm={confirmRecording}
          />,
          overlayHost,
        )}
    </div>
  );
}
