/* Handoff extract — the uploading/analyzing state of a memory card.
   Source of truth: `chat-widget-canvas.jsx` (loaded by
   `Heirloom Lander - Summer 2026 - Story Canvas.html`), functions
   `UploadingCard` and `MemoryCard`, constant `UPLOAD_TICKER`, and the
   `up-*` keyframes in the file's injected <style> block.
   This is a design reference, not production code — reimplement using the
   real composer/upload pipeline's actual progress signal (see README §2). */

const UPLOAD_TICKER = {
  conversation: ['Gathering this memory', 'Finding the words', 'Almost there'],
  photo: ['Uploading your photo', 'Looking closely', 'Remembering the moment', 'Almost there'],
  video: ['Uploading your video', 'Watching it back', 'Finding the moment', 'Almost there'],
  audio: ['Uploading your recording', 'Listening in', 'Catching every word', 'Almost there'],
  document: ['Uploading your document', 'Reading it over', 'Making sense of the page', 'Almost there'],
};

// K = MEMORY_KINDS[kindKey] — { icon, eyebrow, media } where media is
// 'still' | 'video' | 'audio' | 'page' | null.
function UploadingCard({ K, steps }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const id = setInterval(() => setI((v) => (v < steps.length - 1 ? v + 1 : v)), 1300);
    return () => clearInterval(id);
  }, [steps]);
  const progress = Math.round(((i + 1) / steps.length) * 92);
  const label = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
  const visual = K.media;
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ width: 32, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, maxWidth: 520, border: '1px solid var(--hl-border-strong)', borderRadius: 16, background: 'var(--hl-surface)', boxShadow: '0 18px 44px -26px var(--hl-shadow)', overflow: 'hidden', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--hl-border)' }}>
          <Icon n={K.icon} s={12} style={{ color: 'var(--hl-accent)' }} />
          <span style={label}>{K.eyebrow}</span>
        </div>
        {(visual === 'still' || visual === 'video') && (
          <div className="up-shimmer" style={{ position: 'relative', aspectRatio: visual === 'video' ? '16 / 9' : '16 / 10', display: 'grid', placeItems: 'center', background: 'var(--hl-surface-2)', borderBottom: '1px solid var(--hl-border)' }}>
            <span className="up-pulse" style={{ color: 'var(--hl-accent)' }}><Icon n={K.icon} s={26} /></span>
          </div>
        )}
        {(visual === 'audio' || visual === 'page') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)' }}>
            <span className="up-pulse" style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={16} /></span>
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
      </div>
    </div>
  );
}

/* Injected CSS (see chat-widget-canvas.jsx's mount-time <style> block):
@keyframes up-sweep { 0% { background-position: -150% 0; } 100% { background-position: 150% 0; } }
@keyframes up-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.up-shimmer { background-image: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--hl-accent) 14%, transparent) 50%, transparent 70%); background-size: 200% 100%; animation: up-sweep 1.8s ease-in-out infinite; }
.up-shimmer-bar { background-color: var(--hl-border); background-image: linear-gradient(100deg, var(--hl-border) 30%, color-mix(in srgb, var(--hl-accent) 22%, var(--hl-border)) 50%, var(--hl-border) 70%); background-size: 200% 100%; animation: up-sweep 1.8s ease-in-out infinite; }
.up-pulse { display: flex; animation: hl-pulse 1.6s ease-in-out infinite; }
.up-ticker { animation: up-in .35s ease; }
@media (prefers-reduced-motion: reduce) { .up-shimmer, .up-shimmer-bar, .up-pulse, .up-ticker { animation: none !important; } }
*/
