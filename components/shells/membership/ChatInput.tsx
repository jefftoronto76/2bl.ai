'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  Paperclip,
  Image as ImageIcon,
  Mic,
  X,
  Check,
  FileText,
  AudioLines,
  Lock,
} from 'lucide-react';
import { useChatStore } from './chatStore';

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
 * POSTs audio to /api/transcribe (Deepgram nova-2) and returns the transcript.
 * If the route is absent or returns an error the caller's catch block logs and
 * leaves the textarea untouched — the composer never breaks.
 */
async function transcribeAudio(blob: Blob): Promise<string> {
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

/* --- Composer --------------------------------------------------------- */
export function ChatInput() {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const { sendMessage, state } = useChatStore();
  const { isMember } = state;

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !state.isLoading;

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || state.isLoading) return;

    // TODO(2bl): upload `attachments` to Supabase Storage and pass their refs to
    // sendMessage so the Anthropic call can attach images as content blocks.
    // Until sendMessage accepts attachments we inline their names as a marker so
    // the turn is never silently dropped.
    const marker = attachments.map((a) => `[${a.file.name}]`).join(' ');
    const content = [marker, trimmed].filter(Boolean).join(marker && trimmed ? '\n' : '');

    void sendMessage(content);

    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setValue('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: Attachment[] = Array.from(list).map((file) => ({
      id: attachmentId(),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
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
      console.error('[2bl/chat] microphone unavailable or permission denied', err);
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
      setIsRecording(false);
      try {
        const text = await transcribeAudio(blob);
        if (text) {
          setValue((v) => (v ? `${v} ` : '') + text);
          requestAnimationFrame(autoResize);
        }
      } catch (err) {
        console.error('[2bl/chat] transcription failed', err);
      }
    };
    mr.stop();
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="rounded-[22px] border border-border bg-surface p-1.5 transition-colors focus-within:border-accent/40">
        {/* hidden pickers */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {isRecording ? (
          <VoiceBar onCancel={cancelRecording} onConfirm={confirmRecording} />
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
              {/* Attachment + voice buttons are member-only. When locked they
                  remain focusable so screen readers can announce the gate. */}
              <button
                type="button"
                aria-label={isMember ? 'Attach files' : 'Sign in to attach files'}
                aria-disabled={!isMember}
                title={isMember ? 'Attach files' : 'Sign in to unlock'}
                onClick={isMember ? () => fileInputRef.current?.click() : undefined}
                className={cn(
                  'grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isMember
                    ? 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                    : 'text-text-muted opacity-40 cursor-not-allowed',
                )}
              >
                {isMember ? <Paperclip size={18} /> : <Lock size={15} />}
              </button>
              <button
                type="button"
                aria-label={isMember ? 'Add a photo' : 'Sign in to add photos'}
                aria-disabled={!isMember}
                title={isMember ? 'Add a photo' : 'Sign in to unlock'}
                onClick={isMember ? () => imageInputRef.current?.click() : undefined}
                className={cn(
                  'grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isMember
                    ? 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                    : 'text-text-muted opacity-40 cursor-not-allowed',
                )}
              >
                {isMember ? <ImageIcon size={18} /> : <Lock size={15} />}
              </button>

              <div className="flex-1" />

              <button
                type="button"
                aria-label={isMember ? 'Record voice' : 'Sign in to record voice'}
                aria-disabled={!isMember}
                title={isMember ? 'Record voice' : 'Sign in to unlock'}
                onClick={isMember ? startRecording : undefined}
                className={cn(
                  'grid place-items-center w-[34px] h-[34px] rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isMember
                    ? 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
                    : 'text-text-muted opacity-40 cursor-not-allowed',
                )}
              >
                {isMember ? <Mic size={18} /> : <Lock size={15} />}
              </button>
              <button
                type="button"
                aria-label="Send message"
                disabled={!canSend}
                onClick={handleSend}
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
          </>
        )}
      </div>

      {/* Optional supporting caption — remove if undesired. */}
      <p className="text-center font-mono text-[11px] tracking-wide text-text-muted/70 mt-2.5">
        Your guide listens, asks, and never forgets a detail.
      </p>
    </div>
  );
}
