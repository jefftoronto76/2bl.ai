/* Handoff extract — the upload lifecycle of a memory card: running → ready
   (or error) → saved. Source of truth: `chat-widget-canvas.jsx` (functions
   `UploadingCard`, `UploadedCard`, `UploadErrorCard`, `MemoryCard`; constants
   `UPLOAD_TICKER`, `UPLOAD_DEFAULT_TITLE`; the `up-*` keyframes in the file's
   injected <style> block). Design reference, not production code — reimplement
   using the real upload pipeline's actual progress/success/failure signals
   (see README §2). */

const UPLOAD_TICKER = {
  conversation: ['Gathering this memory', 'Finding the words', 'Almost there'],
  photo: ['Uploading your photo', 'Looking closely', 'Remembering the moment', 'Almost there'],
  video: ['Uploading your video', 'Watching it back', 'Finding the moment', 'Almost there'],
  audio: ['Uploading your recording', 'Listening in', 'Catching every word', 'Almost there'],
  document: ['Uploading your document', 'Reading it over', 'Making sense of the page', 'Almost there'],
};
const UPLOAD_DEFAULT_TITLE = { photo: 'A photograph, kept', video: 'A moment on film, kept', audio: 'A voice, kept', document: 'A paper, kept' };

// K = MEMORY_KINDS[kindKey] — { icon, eyebrow, media, extra } where media is
// 'still' | 'video' | 'audio' | 'page' | null, extra is [[iconName, label], ...]
// of kind-specific quick actions (e.g. photo: "Who's in this?", "Add another").
// NOTE: CardShell / QuickAction / StoryPicker / PrimaryButton below are this
// extract's shorthand for the shared inline-style blocks repeated across all
// three cards in the real source (label/ghost/story-chip/save-button styles —
// see MemoryCard and UploadedCard in chat-widget-canvas.jsx for the full,
// un-abstracted styles). Not real exports.

/* ── 1. Running — humming/glowing thumbnail + status ticker + progress bar ── */
function UploadingCard({ K, steps }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const id = setInterval(() => setI((v) => (v < steps.length - 1 ? v + 1 : v)), 1300);
    return () => clearInterval(id);
  }, [steps]);
  const progress = Math.round(((i + 1) / steps.length) * 92);
  const visual = K.media;
  return (
    <CardShell K={K}>
      {(visual === 'still' || visual === 'video') && (
        <div style={{ position: 'relative', aspectRatio: visual === 'video' ? '16 / 9' : '16 / 10', display: 'grid', placeItems: 'center', background: 'var(--hl-surface-2)', borderBottom: '1px solid var(--hl-border)', overflow: 'hidden' }}>
          <span className="up-glow" aria-hidden="true" style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', background: 'var(--hl-accent)' }} />
          <span className="up-hum" style={{ position: 'relative', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={26} /></span>
        </div>
      )}
      {(visual === 'audio' || visual === 'page') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)' }}>
          <span style={{ position: 'relative', flexShrink: 0, width: 34, height: 34 }}>
            <span className="up-glow" aria-hidden="true" style={{ position: 'absolute', inset: -9, borderRadius: '50%', background: 'var(--hl-accent)' }} />
            <span className="up-hum" style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={16} /></span>
          </span>
          <span className="up-shimmer-bar" style={{ flex: 1, height: 10, borderRadius: 99 }} />
        </div>
      )}
      <div style={{ padding: '15px 18px 16px' }}>
        <div style={{ position: 'relative', height: 18, overflow: 'hidden' }}>
          <span key={i} className="up-ticker" style={{ position: 'absolute', inset: 0, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-muted)' }}>{steps[i]}…</span>
        </div>
        <div style={{ marginTop: 11, height: 3, borderRadius: 99, background: 'var(--hl-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: progress + '%', borderRadius: 99, background: 'var(--hl-accent)', transition: 'width 1.15s cubic-bezier(.4,0,.2,1)' }} />
        </div>
      </div>
    </CardShell>
  );
}

/* ── 2. Ready — compact quick-actions card, no forced title/passage ──────
   Uploads with no accompanying text skip AI passage generation entirely
   (nothing to write from). Lands here instead of the full title+passage
   memory card: thumbnail-scale header, kind-specific quick actions
   (K.extra), story picker, Keep/Discard. */
function UploadedCard({ message, K, stories, onSave, onDiscard, onExtra }) {
  const [storyId, setStoryId] = useState(message.storyId || (stories[0] && stories[0].id) || '');
  return (
    <CardShell K={K} maxWidth={420} statusLine="Uploaded — add it to a story" statusIcon="check">
      {K.extra.length > 0 && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {K.extra.map(([ic, lbl]) => <QuickAction key={lbl} icon={ic} label={lbl} onClick={onExtra} />)}
        </div>
      )}
      <div style={{ padding: '13px 16px', borderTop: '1px solid var(--hl-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StoryPicker stories={stories} storyId={storyId} setStoryId={setStoryId} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PrimaryButton onClick={() => onSave(storyId)} icon="bookmark" label="Keep this" />
          <button onClick={onDiscard} style={{ marginLeft: 'auto' }}>Discard</button>
        </div>
      </div>
    </CardShell>
  );
}

/* ── 3. Error — status copy + retry, mirrors the composer's own
   "Not delivered · Tap to retry" pattern (Bubble component, message.status
   === 'failed'). See README §2 on consolidating the two. ────────────────── */
function UploadErrorCard({ K, onRetry, onDiscard }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ width: 32, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, maxWidth: 420, border: '1px solid color-mix(in srgb, var(--hl-danger, #B0432F) 45%, transparent)', borderRadius: 16, background: 'color-mix(in srgb, var(--hl-danger, #B0432F) 6%, var(--hl-surface))', overflow: 'hidden', animation: 'hl-shake .32s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
          <span style={{ color: 'var(--hl-danger, #B0432F)' }}><Icon n="alertTriangle" s={19} /></span>
          <div>
            <div className="label">{K.eyebrow}</div>
            <div style={{ color: 'var(--hl-danger, #B0432F)', fontWeight: 500 }}>Couldn’t finish uploading — check your connection.</div>
          </div>
        </div>
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 8 }}>
          <button onClick={onRetry} style={{ background: 'var(--hl-danger, #B0432F)', color: '#fff' }}><Icon n="refresh" s={13} />Try again</button>
          <button onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </div>
  );
}

/* Injected CSS (see chat-widget-canvas.jsx's mount-time <style> block):
@keyframes up-sweep { 0% { background-position: -150% 0; } 100% { background-position: 150% 0; } }
@keyframes up-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes up-glow-pulse { 0%,100% { opacity: .3; transform: scale(.82); filter: blur(20px); } 50% { opacity: .7; transform: scale(1.12); filter: blur(24px); } }
@keyframes up-hum-pulse { 0%,100% { opacity: .8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
.up-shimmer-bar { background-color: var(--hl-border); background-image: linear-gradient(100deg, var(--hl-border) 30%, color-mix(in srgb, var(--hl-accent) 22%, var(--hl-border)) 50%, var(--hl-border) 70%); background-size: 200% 100%; animation: up-sweep 1.8s ease-in-out infinite; }
.up-glow { animation: up-glow-pulse 2.3s ease-in-out infinite; }
.up-hum { display: flex; animation: up-hum-pulse 2.3s ease-in-out infinite; }
.up-ticker { animation: up-in .35s ease; }
@media (prefers-reduced-motion: reduce) { .up-shimmer-bar, .up-glow, .up-hum, .up-ticker { animation: none !important; } }
*/
