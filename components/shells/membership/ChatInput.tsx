'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  Plus,
  Mic,
  X,
  Check,
  FileText,
  AudioLines,
  Lock,
} from 'lucide-react';
import { useChatStore } from './chatStore';
import { useMediaUpload } from '@/services/media/useMediaUpload';
import { SourceSheet } from './SourceSheet';
import { TranscriptReview } from './TranscriptReview';

/* ------------------------------------------------------------------ *
 * ChatInput — composer with file attachments + voice capture.
 *
 * Delta vs. previous single-line composer:
 *   1. Multi-attachment support (files + images) with preview chips.
 *   2. Voice capture: mic -> recording bar (waveform + timer + cancel/confirm),
 *      transcript dropped back into the textarea so it stays editable.
 *   3. Action toolbar moved BELOW the textarea (modern composer pattern).
 *
 * Backend seams are marked `// TODO(2bl)`. The component degrades gracefully if
 * those routes / permissions are absent — it never throws into the UI.
 * ------------------------------------------------------------------ */

const cn = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

interface Attachment {
  id: string;
  file: File;
  /** Object URL for image previews; revoked on removal. */
  previewUrl?: string;
}

let _aid = 0;
const attachmentId = () => `att_${++_aid}`;

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

/* --- Voice recording bar ---------------------------------------------- */
const WAVE_HEIGHTS = [
  0.5, 0.85, 0.35, 1, 0.6, 0.9, 0.45, 0.75, 1, 0.55, 0.8, 0.4, 0.95, 0.6, 0.7, 0.5, 0.88, 0.42, 0.66, 0.9,
];

function VoiceBar({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [secs, setSecs] = useState(0);
  // Self-contained elapsed timer; the parent owns the MediaRecorder lifecycle.
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

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
          {mm}:{ss}
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
type TranscribeState = 'idle' | 'transcribing' | 'reviewing' | 'error' | 'empty';

export interface ChatInputHandle {
  addFiles: (files: FileList) => void;
}

export const ChatInput = forwardRef<ChatInputHandle>(function ChatInput(_props, ref) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribeState, setTranscribeState] = useState<TranscribeState>('idle');
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  // Holds the transcript + audio blob while the user reviews before sending.
  const [reviewData, setReviewData] = useState<{ transcript: string; audioBlob: Blob | null } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastBlobRef = useRef<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const { sendMessage, injectAssistantMessage, state, addMediaItem, setPendingPills } = useChatStore();
  const { isMember } = state;

  const { upload, isUploading } = useMediaUpload(state.sessionId, null);

  // Expose addFiles so ChatHero can forward drag-dropped files.
  useImperativeHandle(ref, () => ({ addFiles }), []);

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
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setValue('');
    setAttachments([]);
    setTranscribeState('idle');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (pendingAttachments.length > 0) {
      // Upload each attachment and build a [MEDIA_UPLOAD: ...] acknowledgement
      // marker for each successful upload. Failures are logged; the text message
      // still sends so the turn is never silently dropped.
      const markers: string[] = [];
      const uploadResults: Array<{ mediaItemId: string; type: string }> = [];

      await Promise.all(
        pendingAttachments.map(async (att) => {
          const result = await upload(att.file);
          if (result) {
            markers.push(`[MEDIA_UPLOAD: ${att.file.name} | ${result.mediaItemId} | ${result.type}]`);
            uploadResults.push(result);
            // Fresh object URL for image preview — att.previewUrl was already
            // revoked above, but the File is still in memory so we can re-create.
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
              status: 'pending',
              derived_content: null,
              classification: null,
              error_message: null,
              processed_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              localPreviewUrl,
            });
          } else {
            // Upload failed — include the filename so the guide knows what was attempted.
            markers.push(`[MEDIA_UPLOAD_FAILED: ${att.file.name}]`);
          }
        }),
      );

      // Surface option pills for the first successfully uploaded item.
      if (uploadResults.length > 0) {
        const kind =
          uploadResults.length > 1
            ? 'multiple'
            : uploadResults[0].type === 'image'
              ? 'image'
              : uploadResults[0].type === 'audio'
                ? 'audio'
                : 'document';
        setPendingPills({ kind, mediaItemId: uploadResults[0].mediaItemId });
      }

      const parts = [...markers, trimmed].filter(Boolean);
      void sendMessage(parts.join('\n'));
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
      next.push({
        id: attachmentId(),
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      });
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
      setIsRecording(true);
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
    setIsRecording(false);
  };

  const confirmRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) {
      setIsRecording(false);
      return;
    }
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      stopStream();
      lastBlobRef.current = blob;
      setIsRecording(false);
      setTranscribeState('transcribing');
      try {
        const text = await fetchTranscript(blob);
        // Move to review step instead of injecting into textarea directly.
        setReviewData({ transcript: text || '', audioBlob: blob });
        setTranscribeState('reviewing');
      } catch {
        // On STT failure, open review with empty transcript so user can type.
        setReviewData({ transcript: '', audioBlob: blob });
        setTranscribeState('reviewing');
      }
    };
    mr.stop();
  };

  const handleRetry = async () => {
    if (!lastBlobRef.current) return;
    setTranscribeState('transcribing');
    try {
      const text = await fetchTranscript(lastBlobRef.current);
      setReviewData({ transcript: text || '', audioBlob: lastBlobRef.current });
      setTranscribeState('reviewing');
    } catch {
      setReviewData({ transcript: '', audioBlob: lastBlobRef.current });
      setTranscribeState('reviewing');
    }
  };

  // Called when the user sends from the TranscriptReview panel.
  const handleReviewSend = async (keepVoice: boolean) => {
    const data = reviewData;
    if (!data) return;
    setTranscribeState('idle');
    setReviewData(null);

    const trimmed = data.transcript.trim();

    // When keepVoice and we have a blob, upload it first.
    if (keepVoice && data.audioBlob) {
      const audioFile = new File([data.audioBlob], 'voice-memory.webm', {
        type: data.audioBlob.type || 'audio/webm',
      });
      const result = await upload(audioFile);
      if (result) {
        const localPreviewUrl = undefined;
        addMediaItem({
          id: result.mediaItemId,
          tenant_id: '',
          member_id: '',
          chat_id: state.sessionId,
          story_id: null,
          type: result.type,
          original_filename: audioFile.name,
          storage_path: '',
          file_size_bytes: audioFile.size,
          mime_type: audioFile.type,
          status: 'pending',
          derived_content: null,
          classification: null,
          error_message: null,
          processed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          localPreviewUrl,
        });
        const marker = `[MEDIA_UPLOAD: ${audioFile.name} | ${result.mediaItemId} | ${result.type}]`;
        setPendingPills({ kind: 'audio', mediaItemId: result.mediaItemId });
        const parts = [marker, trimmed].filter(Boolean);
        void sendMessage(parts.join('\n'));
      } else {
        // Upload failed — send transcript only
        if (trimmed) void sendMessage(trimmed);
      }
    } else {
      // Text only
      if (trimmed) void sendMessage(trimmed);
    }
  };

  const handleMicClick = () => {
    if (!isMember) {
      injectAssistantMessage('🔒 Voice is a member feature.');
      return;
    }
    void startRecording();
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      {/* SourceSheet is positioned relative to the outer wrapper */}
      <div className="relative">
        <SourceSheet
          open={sourceSheetOpen}
          onClose={() => setSourceSheetOpen(false)}
          onFiles={(files) => { addFiles(files); }}
          onRecord={() => { if (!isMember) { injectAssistantMessage('🔒 Voice is a member feature.'); return; } void startRecording(); }}
          isMember={isMember}
        />

        <div className="rounded-[22px] border border-border bg-surface p-1.5 transition-colors focus-within:border-accent/40">
          {isRecording ? (
            <VoiceBar onCancel={cancelRecording} onConfirm={confirmRecording} />
          ) : transcribeState === 'transcribing' ? (
            <TranscribingPill />
          ) : transcribeState === 'reviewing' && reviewData ? (
            <TranscriptReview
              transcript={reviewData.transcript}
              audioBlob={reviewData.audioBlob}
              onTranscriptChange={(t) => setReviewData((d) => d ? { ...d, transcript: t } : d)}
              onSend={handleReviewSend}
              onReRecord={() => {
                setTranscribeState('idle');
                setReviewData(null);
                void startRecording();
              }}
              onCancel={() => {
                setTranscribeState('idle');
                setReviewData(null);
              }}
            />
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
                className="block w-full bg-transparent text-text-primary placeholder-text-muted font-body text-base resize-none focus:outline-none leading-6 px-2.5 pt-2.5 pb-1 min-h-[28px] max-h-[200px]"
              />

              <div className="flex items-center gap-1 pl-0.5 pr-1 py-0.5">
                {/* "+" opens SourceSheet (member-only). Lock icon when not a member. */}
                <button
                  type="button"
                  aria-label={isMember ? 'Add photo, file, or recording' : 'Sign in to add media'}
                  aria-haspopup="menu"
                  aria-expanded={sourceSheetOpen}
                  title={isMember ? 'Add media' : 'Sign in to unlock'}
                  onClick={isMember ? () => setSourceSheetOpen((v) => !v) : undefined}
                  className={cn(
                    'grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isMember
                      ? sourceSheetOpen
                        ? 'bg-accent text-background'
                        : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                      : 'text-text-muted opacity-40 cursor-not-allowed',
                  )}
                >
                  {isMember ? <Plus size={18} /> : <Lock size={15} />}
                </button>

                <div className="flex-1" />

                <button
                  type="button"
                  aria-label={isMember ? 'Record voice' : 'Voice is a member feature'}
                  title={isMember ? 'Record voice' : 'Voice is a member feature'}
                  onClick={handleMicClick}
                  className={cn(
                    'grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isMember
                      ? 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                      : 'text-text-muted opacity-40',
                  )}
                >
                  {isMember ? <Mic size={18} /> : <Lock size={15} />}
                </button>
              <button
                type="button"
                aria-label="Send message"
                disabled={!canSend}
                onClick={() => void handleSend()}
                className={cn(
                  'grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  canSend
                    ? 'bg-accent hover:bg-accent-hover text-background'
                    : 'bg-text-primary/10 text-text-muted cursor-not-allowed',
                )}
              >
                <ArrowUp size={17} />
              </button>
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
      </div>
    </div>
  );
});
