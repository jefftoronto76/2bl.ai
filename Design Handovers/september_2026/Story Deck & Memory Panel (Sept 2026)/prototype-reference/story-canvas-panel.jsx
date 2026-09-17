/* story-canvas-panel.jsx — the story canvas panel (deck level + card level),
   extracted so both the standalone prototype and the real chat widget use one copy. */
const { useState, useEffect, useRef, useCallback } = React;

/* Glyphs come from the project's shared set (icons.jsx → window.Icon).
   SC_EXTRA holds only the marks that set doesn't carry yet; SC_ALIAS maps the
   names used here onto the shared set's names so eng maps 1:1 to lucide-react. */
const SC_EXTRA = {
  video: ['M22 8l-6 4 6 4V8z', 'M14 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z'],
  play: ['M5 3l14 9-14 9V3z'],
  grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
  deck: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  fork: ['M15 14l5-5-5-5', 'M4 20v-7a4 4 0 0 1 4-4h12'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  imagePlus: ['M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10', 'M8.5 8.5h.01', 'M21 19h-6', 'M18 16v6'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
};
const SC_ALIAS = { bookmark: 'bookMark', book: 'bookOpen', chat: 'message', file: 'fileText', pencil: 'edit' };
function SIcon({ n, s = 18, sw = 1.75, fill = 'none', style }) {
  const base = { flexShrink: 0, display: 'block', ...style };
  const extra = SC_EXTRA[n];
  if (extra) return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={n === 'grip' ? 2.6 : sw} strokeLinecap="round" strokeLinejoin="round" style={base} aria-hidden="true">
      {extra.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
  return <Icon name={SC_ALIAS[n] || n} size={s} strokeWidth={sw} style={base} />;
}

const SC_KINDS = {
  conversation: { icon: 'feather', eyebrow: 'A memory, written up', media: null, slots: true },
  photo: { icon: 'image', eyebrow: 'A photograph, remembered', media: 'still', slots: false },
  video: { icon: 'video', eyebrow: 'A video, remembered', media: 'video', slots: false },
  audio: { icon: 'mic', eyebrow: 'A recording, written up', media: 'audio', slots: false },
  document: { icon: 'file', eyebrow: 'A document, read together', media: 'page', slots: false },
};

const scMono = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
const scGhost = { padding: '9px 14px', borderRadius: 9, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'color .15s, border-color .15s', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' };
const scPrimary = { padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' };
/* Both panes' headers share this box so the rule under them lines up across the split. */
const scHeader = { flexShrink: 0, boxSizing: 'border-box', height: 64, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--hl-border)' };
const ghostOn = (e) => { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; };
const ghostOff = (e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; };
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
const COVER_TEMPLATES = [
  { id: 'photo', label: 'Photo cover', image: true },
  { id: 'classic', label: 'Classic title', image: false },
  { id: 'line', label: 'Title + line', image: false },
];
const BACK_TEMPLATES = [
  { id: 'closing', label: 'Closing note', image: false },
  { id: 'photo', label: 'Photo + line', image: true },
  { id: 'blank', label: 'Blank', image: false },
];

function ScMedia({ kind, tall }) {
  const frame = { position: 'relative', display: 'grid', placeItems: 'center', background: 'var(--hl-surface-2)', borderBottom: '1px solid var(--hl-border)', color: 'var(--hl-faint)' };
  const badge = { position: 'absolute', bottom: 9, right: 10, padding: '3px 7px', borderRadius: 6, background: 'color-mix(in srgb, var(--hl-text) 62%, transparent)', color: 'var(--hl-bg)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.04em' };
  if (kind === 'audio') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid var(--hl-border)', background: 'var(--hl-surface-2)' }}>
      <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 99, background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', paddingLeft: 2 }}><SIcon n="play" s={13} fill="currentColor" /></span>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, height: 26 }}>
        {[9, 16, 22, 13, 25, 18, 11, 24, 15, 20, 8, 17, 23, 12, 19, 26, 14, 10, 21, 16, 9, 18, 13, 22].map((h, i) => <i key={i} style={{ flex: 1, height: h, borderRadius: 2, background: 'var(--hl-accent)', opacity: i < 9 ? 0.75 : 0.24 }} />)}
      </span>
      <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)' }}>4:12</span>
    </div>
  );
  if (kind === 'video') return <div style={{ ...frame, aspectRatio: tall ? '16 / 9' : '16 / 9' }}><span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 99, background: 'color-mix(in srgb, var(--hl-text) 70%, transparent)', color: 'var(--hl-bg)', paddingLeft: 3 }}><SIcon n="play" s={17} fill="currentColor" /></span><span style={badge}>0:40</span></div>;
  if (kind === 'page') return <div style={{ ...frame, aspectRatio: '16 / 7', background: 'color-mix(in srgb, #C8A96A 9%, var(--hl-surface-2))' }}><SIcon n="file" s={26} style={{ opacity: 0.5 }} /><span style={badge}>2 pages</span></div>;
  return <div style={{ ...frame, aspectRatio: '16 / 10' }}><SIcon n="image" s={26} style={{ opacity: 0.45 }} /></div>;
}

/* ── DECK LEVEL — the story as ordered pages ───────────────────────────── */
const KIND_PRIORITY = ['photo', 'video', 'audio', 'document', 'conversation'];
/* A memory can hold any mix of text/photo/audio/video (mem.kinds, if present).
   The card shows one dominant icon rather than trying to represent every
   type present — simplest, at the cost of not being fully accurate. Falls
   back to mem.kind for memories that only ever carry a single type. */
function dominantKind(mem) {
  if (Array.isArray(mem.kinds) && mem.kinds.length) {
    return KIND_PRIORITY.find((k) => mem.kinds.includes(k)) || mem.kinds[0];
  }
  return mem.kind;
}

function DeckRow({ mem, index, total, parent, onOpen, onEditStub, drag, isMobile }) {
  const [hover, setHover] = useState(false);
  const K = SC_KINDS[dominantKind(mem)];
  const hasImage = K.media === 'still' || K.media === 'video';
  const dragging = drag.fromIndex === index;
  return (
    <li
      draggable={!isMobile}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag.start(index); }}
      onDragEnter={() => drag.over(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={drag.end}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ listStyle: 'none', display: 'flex', alignItems: 'stretch', gap: 8, opacity: dragging ? 0.35 : 1, transition: 'opacity .15s' }}>
      {!isMobile && <span aria-hidden="true" style={{ flexShrink: 0, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: hover || dragging ? 'var(--hl-muted)' : 'transparent', cursor: 'grab', transition: 'color .15s' }}><SIcon n="grip" s={16} /></span>}
      <button onClick={onOpen}
        onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); drag.nudge(index, e.key === 'ArrowUp' ? -1 : 1); } }}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', gap: 16, alignItems: 'center', height: 96, padding: '0 18px', borderRadius: 16, border: '1px solid', borderColor: drag.overIndex === index && !dragging ? 'var(--hl-accent)' : 'var(--hl-border)', background: 'var(--hl-surface)', cursor: 'pointer', boxShadow: hover ? '0 14px 30px -22px var(--hl-shadow)' : 'none', transition: 'border-color .16s, box-shadow .16s, transform .16s', transform: hover ? 'translateY(-1px)' : 'none' }}>
        {hasImage && (
          <span style={{ flexShrink: 0, width: 60, height: 60, borderRadius: 13, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'grid', placeItems: 'center', color: 'var(--hl-accent)' }}>
            <SIcon n={K.icon} s={22} />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)' }}>{String(index + 1).padStart(2, '0')}</span>
            <span style={{ minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, lineHeight: 1.2, color: 'var(--hl-text)', letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mem.title}</span>
            {mem.version > 1 && <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--hl-accent)', border: '1px solid var(--hl-accent-line)', borderRadius: 5, padding: '1px 4px' }}>v{mem.version}</span>}
          </span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: isMobile ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 5, fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--hl-muted)', textWrap: 'pretty' }}>{mem.passage}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>
            {mem.date}
            {parent && <React.Fragment><i style={{ width: 3, height: 3, borderRadius: 9, background: 'currentColor', opacity: .6 }} /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--hl-accent)' }}><SIcon n="fork" s={11} />from {parent.title}</span></React.Fragment>}
          </span>
        </span>
      </button>
      {isMobile ? (
        <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
          <button aria-label="Move up" disabled={index === 0} onClick={(e) => { e.stopPropagation(); drag.nudge(index, -1); }}
            style={{ width: 30, height: 26, borderRadius: 7, border: 'none', background: 'transparent', color: index === 0 ? 'var(--hl-border-strong)' : 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: index === 0 ? 'default' : 'pointer' }}><SIcon n="chevronDown" s={14} style={{ transform: 'rotate(180deg)' }} /></button>
          <button aria-label="Move down" disabled={index === total - 1} onClick={(e) => { e.stopPropagation(); drag.nudge(index, 1); }}
            style={{ width: 30, height: 26, borderRadius: 7, border: 'none', background: 'transparent', color: index === total - 1 ? 'var(--hl-border-strong)' : 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: index === total - 1 ? 'default' : 'pointer' }}><SIcon n="chevronDown" s={14} /></button>
        </span>
      ) : (
        <button aria-label="Edit this memory" title="Edit" onClick={(e) => { e.stopPropagation(); onEditStub(); }}
          style={{ flexShrink: 0, alignSelf: 'center', width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer', opacity: hover ? 1 : 0, transition: 'opacity .15s, color .15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-faint)')}><SIcon n="edit" s={15} /></button>
      )}
    </li>
  );
}

function DeckEndRow({ kind, data, onEdit, onRemove, isMobile }) {
  const label = kind === 'cover' ? 'Cover' : 'Back page';
  return (
    <li style={{ listStyle: 'none', display: 'flex', alignItems: 'stretch', gap: 8 }}>
      {!isMobile && <span style={{ flexShrink: 0, width: 20 }} />}
      <button onClick={onEdit} style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', gap: 16, alignItems: 'center', height: 96, padding: '0 18px', borderRadius: 16, border: '1.5px dashed var(--hl-border-strong)', background: 'var(--hl-surface-2)', cursor: 'pointer' }}>
        <span style={{ flexShrink: 0, width: 60, height: 60, borderRadius: 13, background: 'var(--hl-bg-2)', border: '1px solid var(--hl-border)', display: 'grid', placeItems: 'center', color: 'var(--hl-faint)' }}>
          <SIcon n={kind === 'cover' ? 'book' : 'bookmark'} s={22} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>{label}</span>
          <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data ? (data.heading || 'Untitled') : 'Not added yet'}</span>
          <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-faint)' }}>{data ? 'Tap to edit' : 'Tap to choose a template'}</span>
        </span>
      </button>
      {data ? (
        <button aria-label={'Remove ' + label} title={'Remove ' + label} onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ flexShrink: 0, alignSelf: 'center', width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-danger, #B0432F)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-faint)')}><SIcon n="x" s={15} /></button>
      ) : !isMobile && <span style={{ flexShrink: 0, width: 34 }} />}
    </li>
  );
}

/* Grid-view variant of DeckEndRow — sized exactly like DeckGridTile so cover/back
   scale with the same column width instead of spanning full width. */
function DeckEndTile({ kind, data, onEdit, onRemove }) {
  const [hover, setHover] = useState(false);
  const label = kind === 'cover' ? 'Cover' : 'Back page';
  return (
    <li onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ listStyle: 'none' }}>
      <button onClick={onEdit} style={{ width: '100%', textAlign: 'left', border: '1.5px dashed var(--hl-border-strong)', borderRadius: 14, background: 'var(--hl-surface-2)', cursor: 'pointer', overflow: 'hidden' }}>
        <span style={{ position: 'relative', display: 'flex', aspectRatio: '16 / 10', background: 'var(--hl-bg-2)', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-faint)' }}>
          <SIcon n={kind === 'cover' ? 'book' : 'bookmark'} s={26} />
          {data && (
            <span aria-label={'Remove ' + label} title={'Remove ' + label} onClick={(e) => { e.stopPropagation(); onRemove(); }}
              style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--hl-text) 55%, transparent)', color: '#fff', opacity: hover ? 1 : 0, transition: 'opacity .15s', cursor: 'pointer' }}><SIcon n="x" s={13} /></span>
          )}
        </span>
        <span style={{ display: 'block', padding: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>{label}</span>
          <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data ? (data.heading || 'Untitled') : 'Not added yet'}</span>
          <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--hl-faint)' }}>{data ? 'Tap to edit' : 'Tap to choose a template'}</span>
        </span>
      </button>
    </li>
  );
}

function AddMenu({ hasCover, hasBack, onPick, compact }) {
  const [open, setOpen] = useState(false);
  const item = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 12px', border: 'none', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer', borderRadius: 8 };
  const on = (e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)');
  const off = (e) => (e.currentTarget.style.background = 'transparent');
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Add to this story" style={{ ...scGhost, padding: compact ? 8 : '8px 13px' }} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="plus" s={14} />{!compact && 'Add'}</button>
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 24 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, minWidth: 208, padding: 5, borderRadius: 11, border: '1px solid var(--hl-border)', background: 'var(--hl-bg-2)', boxShadow: '0 10px 28px rgba(0,0,0,.18)', zIndex: 25 }}>
            <button style={item} onMouseEnter={on} onMouseLeave={off} onClick={() => { setOpen(false); onPick('memory'); }}><SIcon n="bookmark" s={14} />Memory</button>
            <button style={item} onMouseEnter={on} onMouseLeave={off} onClick={() => { setOpen(false); onPick('cover'); }}><SIcon n="book" s={14} />{hasCover ? 'Edit cover page' : 'Cover page'}</button>
            <button style={item} onMouseEnter={on} onMouseLeave={off} onClick={() => { setOpen(false); onPick('back'); }}><SIcon n="bookmark" s={14} />{hasBack ? 'Edit back page' : 'Back page'}</button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function DeckGridTile({ mem, index, parent, onOpen, onEditStub, drag }) {
  const [hover, setHover] = useState(false);
  const K = SC_KINDS[dominantKind(mem)];
  const hasImage = K.media === 'still' || K.media === 'video';
  const dragging = drag.fromIndex === index;
  return (
    <li draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag.start(index); }}
      onDragEnter={() => drag.over(index)} onDragOver={(e) => e.preventDefault()} onDragEnd={drag.end}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ listStyle: 'none', opacity: dragging ? 0.35 : 1, transition: 'opacity .15s' }}>
      <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', border: '1px solid', borderColor: drag.overIndex === index && !dragging ? 'var(--hl-accent)' : 'var(--hl-border)', borderRadius: 14, background: 'var(--hl-surface)', cursor: 'pointer', overflow: 'hidden', boxShadow: hover ? '0 14px 30px -22px var(--hl-shadow)' : 'none', transition: 'border-color .16s, box-shadow .16s' }}>
        {hasImage && (
          <span style={{ position: 'relative', display: 'flex', aspectRatio: '16 / 10', background: 'var(--hl-accent-soft)', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
            <SIcon n={K.icon} s={26} />
            <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)' }}>{String(index + 1).padStart(2, '0')}</span>
            <span aria-label="Edit this memory" title="Edit" onClick={(e) => { e.stopPropagation(); onEditStub(); }}
              style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--hl-text) 55%, transparent)', color: '#fff', opacity: hover ? 1 : 0, transition: 'opacity .15s', cursor: 'pointer' }}><SIcon n="edit" s={13} /></span>
          </span>
        )}
        <span style={{ display: 'block', padding: 12 }}>
          {!hasImage && (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)' }}>{String(index + 1).padStart(2, '0')}</span>
              <span aria-label="Edit this memory" title="Edit" onClick={(e) => { e.stopPropagation(); onEditStub(); }}
                style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', color: 'var(--hl-faint)', opacity: hover ? 1 : 0, transition: 'opacity .15s', cursor: 'pointer' }}><SIcon n="edit" s={12} /></span>
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--hl-text)', letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mem.title}</span>
            {mem.version > 1 && <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--hl-accent)', border: '1px solid var(--hl-accent-line)', borderRadius: 5, padding: '1px 4px' }}>v{mem.version}</span>}
          </span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: hasImage ? 2 : 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 4, fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--hl-muted)', textWrap: 'pretty' }}>{mem.passage}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>
            {mem.date}
            {parent && <React.Fragment><i style={{ width: 3, height: 3, borderRadius: 9, background: 'currentColor', opacity: .6 }} /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--hl-accent)' }}><SIcon n="fork" s={10} />from {parent.title}</span></React.Fragment>}
          </span>
        </span>
      </button>
    </li>
  );
}

function Deck({ memories, story, storyId, cover, backPage, onOpen, onReorder, onEditStub, onClose, onAdd, onEditEnd, onRemoveEnd, onPreview, compact }) {
  const isMobile = useIsMobile();
  const [view, setView] = useState('list');
  const [fromIndex, setFromIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const drag = {
    fromIndex, overIndex,
    start: (i) => { setFromIndex(i); setOverIndex(i); },
    over: (i) => { if (fromIndex === null || i === fromIndex) return; onReorder(fromIndex, i); setFromIndex(i); setOverIndex(i); },
    end: () => { setFromIndex(null); setOverIndex(null); },
    nudge: (i, d) => { const t = i + d; if (t >= 0 && t < memories.length) onReorder(i, t); },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ ...scHeader, gap: isMobile ? 6 : 10, flexWrap: isMobile ? 'wrap' : 'nowrap', height: isMobile ? 'auto' : 64, minHeight: 64, padding: isMobile ? '10px 12px' : '0 16px' }}>
        <SIcon n="book" s={15} style={{ color: 'var(--hl-accent)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, lineHeight: 1.25, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story}</span>
          <span style={{ ...scMono, fontSize: 9.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memories.length} memories · you own this story</span>
        </span>
        <AddMenu hasCover={!!cover} hasBack={!!backPage} onPick={onAdd} compact />
        {!isMobile && (
          <div role="group" aria-label="Deck layout" style={{ flexShrink: 0, display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)' }}>
            <button aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}
              style={{ width: 30, height: 26, borderRadius: 6, border: 'none', background: view === 'list' ? 'var(--hl-accent)' : 'transparent', color: view === 'list' ? 'var(--hl-on-accent)' : 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><SIcon n="menu" s={14} /></button>
            <button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}
              style={{ width: 30, height: 26, borderRadius: 6, border: 'none', background: view === 'grid' ? 'var(--hl-accent)' : 'transparent', color: view === 'grid' ? 'var(--hl-on-accent)' : 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><SIcon n="grid" s={14} /></button>
          </div>
        )}
        <button aria-label="Preview this story" title="Preview this story" onClick={onPreview} style={{ ...scGhost, padding: compact ? 8 : '7px 14px', fontSize: 12.5 }} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="eye" s={15} />{!compact && 'Preview'}</button>
        <button aria-label="Share this story — coming soon" title="Sharing is coming soon" disabled style={{ ...scGhost, padding: compact ? 8 : '7px 14px', fontSize: 12.5, opacity: 0.4, cursor: 'not-allowed' }}><SIcon n="upload" s={15} />{!compact && 'Share'}</button>
        {compact && <button aria-label="Close story" onClick={onClose} style={{ ...scGhost, border: 'none', padding: 7 }}><SIcon n="x" s={17} /></button>}
      </header>
      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '16px 12px 22px' : '18px 16px 26px' }}>
        <p style={{ margin: isMobile ? '0 0 12px 2px' : '0 0 14px 32px', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-faint)' }}>{isMobile ? 'Use the arrows to reorder. Open a card to read, page through it, or change it.' : (view === 'grid' ? 'Drag a card to change where it sits in the story. Open one to read, page through it, or change it.' : 'Drag a chapter to change where it sits in the story. Open one to read, page through it, or change it.')}</p>
        {view === 'list' || isMobile ? (
          <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DeckEndRow kind="cover" data={cover} isMobile={isMobile} onEdit={() => onEditEnd('cover')} onRemove={() => onRemoveEnd('cover')} />
            {memories.map((m, i) => (
              <DeckRow key={m.id} mem={m} index={i} total={memories.length} isMobile={isMobile} parent={m.parentId ? memories.find((p) => p.id === m.parentId) : null} onOpen={() => onOpen(m.id)} onEditStub={onEditStub} drag={drag} />
            ))}
            <DeckEndRow kind="back" data={backPage} isMobile={isMobile} onEdit={() => onEditEnd('back')} onRemove={() => onRemoveEnd('back')} />
          </ol>
        ) : (
          <React.Fragment>
            <ul style={{ margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              <DeckEndTile kind="cover" data={cover} onEdit={() => onEditEnd('cover')} onRemove={() => onRemoveEnd('cover')} />
              {memories.map((m, i) => (
                <DeckGridTile key={m.id} mem={m} index={i} parent={m.parentId ? memories.find((p) => p.id === m.parentId) : null} onOpen={() => onOpen(m.id)} onEditStub={onEditStub} drag={drag} />
              ))}
              <DeckEndTile kind="back" data={backPage} onEdit={() => onEditEnd('back')} onRemove={() => onRemoveEnd('back')} />
            </ul>
          </React.Fragment>
        )}
        <div style={{ marginTop: 16, marginLeft: isMobile ? 2 : 32, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SIcon n="chat" s={14} />New memories arrive here as you keep them in the conversation.
        </div>
      </div>
    </div>
  );
}

function CoverBackPanel({ kind, initial, onClose, onSave, onRemove }) {
  const templates = kind === 'cover' ? COVER_TEMPLATES : BACK_TEMPLATES;
  const [templateId, setTemplateId] = useState((initial && initial.templateId) || templates[0].id);
  const [heading, setHeading] = useState((initial && initial.heading) || '');
  const [text, setText] = useState((initial && initial.text) || '');
  const template = templates.find((t) => t.id === templateId) || templates[0];
  const field = { width: '100%', boxSizing: 'border-box', marginTop: 9, padding: '11px 13px', background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', borderRadius: 12, color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14.5, outline: 'none' };
  const label = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
  const canSave = heading.trim().length > 0;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(26,21,15,0.55)', backdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={kind === 'cover' ? 'Cover page' : 'Back page'} style={{ position: 'relative', width: 'min(480px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px var(--hl-shadow)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}><SIcon n="x" s={18} /></button>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>{kind === 'cover' ? 'Cover page' : 'Back page'}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--hl-muted)', margin: '7px 0 0' }}>Pick a template, then fill in the details.</p>
        <div style={{ marginTop: 20 }}>
          <div style={label}>Template</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            {templates.map((t) => (
              <button key={t.id} onClick={() => setTemplateId(t.id)} aria-pressed={templateId === t.id}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '10px 6px', borderRadius: 12, border: '1.5px solid ' + (templateId === t.id ? 'var(--hl-accent)' : 'var(--hl-border)'), background: templateId === t.id ? 'var(--hl-accent-soft)' : 'transparent', cursor: 'pointer' }}>
                <span style={{ width: '100%', aspectRatio: '3/4', borderRadius: 6, background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {t.image && <span style={{ width: '58%', height: '40%', borderRadius: 3, background: 'var(--hl-border)' }} />}
                  <span style={{ width: '55%', height: 3, borderRadius: 2, background: 'var(--hl-faint)' }} />
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: templateId === t.id ? 'var(--hl-accent)' : 'var(--hl-muted)', textAlign: 'center' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        {template.image && (
          <div style={{ marginTop: 18 }}>
            <div style={label}>Image</div>
            <div style={{ marginTop: 9, height: 120, borderRadius: 12, border: '1px dashed var(--hl-border-strong)', background: 'var(--hl-surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--hl-faint)' }}>
              <SIcon n="imagePlus" s={20} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>Drop a photo, or add one later</span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 18 }}>
          <div style={label}>{kind === 'cover' ? 'Title' : 'Heading'}</div>
          <input autoFocus value={heading} onChange={(e) => setHeading(e.target.value)} placeholder={kind === 'cover' ? 'e.g. A Life in Full' : 'e.g. With love, always'} style={field} />
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={label}>{kind === 'cover' ? 'Subtitle' : 'Closing line'} <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-body)', color: 'var(--hl-faint)' }}>&middot; optional</span></div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={kind === 'cover' ? 'The story of...' : 'A line to leave the reader with.'} style={{ ...field, resize: 'none', lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24 }}>
          {initial ? <button onClick={onRemove} style={{ padding: '11px 16px', borderRadius: 11, border: 'none', background: 'transparent', color: 'var(--hl-danger, #B0432F)', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Remove {kind === 'cover' ? 'cover' : 'back page'}</button> : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => canSave && onSave({ templateId, heading: heading.trim(), text: text.trim(), image: template.image })} disabled={!canSave}
              style={{ padding: '11px 20px', borderRadius: 11, border: 'none', background: canSave ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-text) 8%, transparent)', color: canSave ? 'var(--hl-on-accent)' : 'var(--hl-faint)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function readerPages(cover, memories, backPage) {
  const pages = [];
  if (cover) pages.push({ kind: 'cover', data: cover });
  memories.forEach((m) => {
    const K = SC_KINDS[m.kind];
    paginate(m.passage, !!K.media).forEach((text, i) => pages.push({ kind: 'memory', mem: m, text, first: i === 0 }));
  });
  if (backPage) pages.push({ kind: 'back', data: backPage });
  return pages.length ? pages : [{ kind: 'empty' }];
}

function PreviewCoverBack({ data, kind }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
      {data && data.image && (
        <div style={{ width: '68%', aspectRatio: '4/5', borderRadius: 6, background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', display: 'grid', placeItems: 'center', color: 'var(--hl-faint)' }}><SIcon n="image" s={26} style={{ opacity: 0.4 }} /></div>
      )}
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: kind === 'cover' ? 28 : 22, lineHeight: 1.2, color: '#1A150F' }}>{(data && data.heading) || (kind === 'cover' ? 'Untitled story' : '')}</h2>
      {data && data.text && <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, color: '#5c4a36', maxWidth: '85%' }}>{data.text}</p>}
    </div>
  );
}

/* Preview — locked print trims, 6×9 (novel, ratio .667) and 9×7 (landscape, ratio 1.286),
   shown against a 0.75in safe-margin inset and a thin bleed line. Novel/landscape choice is
   view-only here; it doesn't persist a print size, since more trims may be offered later. */
function PreviewModal({ story, cover, memories, backPage, onClose }) {
  const isMobile = useIsMobile();
  const [format, setFormat] = useState('novel');
  const [page, setPage] = useState(0);
  const pages = readerPages(cover, memories, backPage);
  const total = pages.length;
  const cur = pages[Math.min(page, total - 1)];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(total - 1, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, onClose]);
  const ratio = format === 'novel' ? 0.667 : 1.286;
  const boxH = isMobile ? 'min(58vh, 520px)' : 'min(74vh, 660px)';
  return (
    <div role="dialog" aria-modal="true" aria-label="Preview your story" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 92, display: 'flex', flexDirection: 'column', background: 'rgba(20,16,10,0.86)', backdropFilter: 'blur(6px)', animation: 'hl-fade .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: isMobile ? '14px 16px' : '16px 22px' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff', fontWeight: 500 }}>{story} — preview</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div role="group" aria-label="Page format" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.1)' }}>
            {[['novel', 'Novel'], ['landscape', 'Landscape']].map(([k, l]) => (
              <button key={k} onClick={() => { setFormat(k); setPage(0); }} aria-pressed={format === k}
                style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: format === k ? 'var(--hl-accent)' : 'transparent', color: format === k ? 'var(--hl-on-accent)' : 'rgba(255,255,255,.75)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          <button aria-label="Share this story — coming soon" title="Sharing is coming soon" disabled
            style={{ width: 36, height: 36, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,.4)', display: 'grid', placeItems: 'center', cursor: 'not-allowed' }}><SIcon n="upload" s={16} /></button>
          <button onClick={onClose} aria-label="Close preview" style={{ width: 36, height: 36, borderRadius: 99, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><SIcon n="x" s={17} /></button>
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 8 : 18, padding: '0 12px 14px' }}>
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page"
          style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 99, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: page === 0 ? 'rgba(255,255,255,.3)' : '#fff', display: 'grid', placeItems: 'center', cursor: page === 0 ? 'default' : 'pointer' }}><SIcon n="chevronLeft" s={17} /></button>
        <div style={{ position: 'relative', height: boxH, width: `calc(${boxH} * ${ratio})`, maxWidth: '78vw', borderRadius: 3, background: '#FBF8F1', boxShadow: '0 40px 90px -20px rgba(0,0,0,.6)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(0,0,0,.06)' }} aria-hidden="true" title="0.125in bleed" />
          <div className="lg-scroll" style={{ position: 'absolute', inset: format === 'novel' ? '9% 11%' : '8% 8%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {cur.kind === 'cover' && <PreviewCoverBack data={cur.data} kind="cover" />}
            {cur.kind === 'back' && <PreviewCoverBack data={cur.data} kind="back" />}
            {cur.kind === 'empty' && <p style={{ margin: 'auto', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-faint)', textAlign: 'center' }}>Nothing to preview yet.</p>}
            {cur.kind === 'memory' && (
              <React.Fragment>
                {cur.first && <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 21, lineHeight: 1.2, color: '#1A150F' }}>{cur.mem.title}</h2>}
                <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.75, color: '#1A150F', opacity: 0.88, textWrap: 'pretty' }}>{cur.text}</p>
              </React.Fragment>
            )}
          </div>
        </div>
        <button onClick={() => setPage((p) => Math.min(total - 1, p + 1))} disabled={page === total - 1} aria-label="Next page"
          style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 99, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: page === total - 1 ? 'rgba(255,255,255,.3)' : '#fff', display: 'grid', placeItems: 'center', cursor: page === total - 1 ? 'default' : 'pointer' }}><SIcon n="chevronRight" s={17} /></button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, textAlign: 'center', padding: '2px 0 18px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.55)' }}>{page + 1} / {total}</div>
    </div>
  );
}

/* ── STORY MENU — the global list of stories, entry point when no story is chosen yet ── */
function StoryMenu({ stories, memories, onOpen }) {
  const count = (id) => memories.filter((k) => k.storyId === id).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ ...scHeader, gap: 10 }}>
        <SIcon n="book" s={15} style={{ color: 'var(--hl-accent)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--hl-text)' }}>Your stories</span>
      </header>
      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stories.map((st) => (
          <button key={st.id} onClick={() => onOpen(st.id)}
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)', cursor: 'pointer', transition: 'border-color .16s, transform .16s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border)'; e.currentTarget.style.transform = 'none'; }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 11, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', flexShrink: 0 }}><SIcon n="book" s={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500, color: 'var(--hl-text)' }}>{st.name}</span>
              {st.tagline && <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-muted)' }}>{st.tagline}</span>}
            </span>
            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--hl-accent)' }}>
              <SIcon n="bookmark" s={12} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{count(st.id)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function paginate(text, hasMedia) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const firstLimit = hasMedia ? 300 : 620, restLimit = 620;
  const pages = []; let i = 0, limit = firstLimit;
  while (i < words.length) { const chunk = words.slice(i, i + limit); pages.push(chunk.join(' ')); i += limit; limit = restLimit; }
  return pages.length ? pages : [''];
}

/* ── CARD LEVEL — the memory as a canvas: title + meta are always-editable
   chrome, the passage below is the document body itself (no separate "Edit
   mode", no book pagination). Talk about this / Use as a base / Remove live
   behind one overflow menu — everything else was too much to land on. ──── */
let scBlockSeq = 0;
const scBlockId = () => 'blk-' + (++scBlockSeq);
/* Matches production's buildDefaultBlocks() exactly: two block types only
   (text, image), no gallery/video/quote/divider, no drag-reorder. */
function buildDefaultBlocks(mem) {
  const K = SC_KINDS[mem.kind];
  const blocks = [];
  if (K.media) blocks.push({ id: scBlockId(), type: 'image', mediaKind: K.media });
  blocks.push({ id: scBlockId(), type: 'text', content: mem.passage });
  return blocks;
}

/* ── Block canvas (Memory Canvas V1 parity) — text + image blocks only, no
   reordering. A "+" inserter sits before the first block and after every
   block. Text commits on every keystroke, matching production exactly. ─── */
function BlockInserter({ onAddText, onAddImage }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 30, margin: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: open ? 'var(--hl-border-strong)' : 'transparent', transition: 'background .15s' }} />
      <button onClick={() => setOpen((v) => !v)} aria-label="Add a block" aria-expanded={open}
        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 99, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: open ? 1 : 0.35, transition: 'opacity .15s' }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.opacity = 0.35; }}>
        <SIcon n="plus" s={16} />
      </button>
      <div style={{ flex: 1, height: 1, background: open ? 'var(--hl-border-strong)' : 'transparent', transition: 'background .15s' }} />
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 24 }} />
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6, display: 'flex', gap: 3, padding: 5, borderRadius: 11, border: '1px solid var(--hl-border)', background: 'var(--hl-bg-2)', boxShadow: '0 10px 28px rgba(0,0,0,.18)', zIndex: 25 }}>
            <button title="Text" aria-label="Add text" onClick={() => { onAddText(); setOpen(false); }}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}><SIcon n="fileText" s={15} /></button>
            <button title="Image" aria-label="Add image" onClick={() => { onAddImage(); setOpen(false); }}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}><SIcon n="image" s={15} /></button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function CanvasBlock({ block, onChange, onRemove, canRemove }) {
  const [hover, setHover] = useState(false);
  const taRef = useRef(null);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px'; } }, [block.content]);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ position: 'relative' }}>
      <div style={{ paddingRight: 28 }}>
        {block.type === 'text' ? (
          <textarea ref={taRef} value={block.content || ''} onChange={(e) => onChange(e.target.value)} rows={3}
            placeholder="Write something…" aria-label="Text block"
            style={{ display: 'block', width: '100%', border: 'none', background: 'transparent', outline: 'none', resize: 'none', padding: 0, fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.75, color: 'var(--hl-text)', opacity: .9, textWrap: 'pretty' }} />
        ) : (
          <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--hl-border)' }}><ScMedia kind={block.mediaKind || 'still'} /></div>
        )}
      </div>
      <button onClick={onRemove} disabled={!canRemove} aria-label={block.type === 'text' ? 'Remove text block' : 'Remove photo'}
        title={!canRemove ? 'A memory needs at least one line of text' : undefined}
        style={{ position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: hover && canRemove ? 'var(--hl-faint)' : 'transparent', cursor: canRemove ? 'pointer' : 'default', display: 'grid', placeItems: 'center', transition: 'color .15s' }}
        onMouseEnter={(e) => { if (canRemove) e.currentTarget.style.color = 'var(--hl-danger, #B0432F)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = hover && canRemove ? 'var(--hl-faint)' : 'transparent'; }}>
        <SIcon n="x" s={13} />
      </button>
    </div>
  );
}

/* CardView — matches production's MemoryCardView.tsx: editable title, story
   picker, read-only date/eyebrow meta, a two-block-type canvas (text+image,
   no reorder), icon-only footer (Talk about this / Use as a base / Remove).
   No page-format toggle, no multi-memory paging, no page-flip — none of
   those exist in production. */
function CardView({ mem, parent, stories, onBack, onEdit, onTalk, onFork, onDelete, onMoveStory, onCreateStory }) {
  const [title, setTitle] = useState(mem.title);
  const [blocks, setBlocks] = useState(() => buildDefaultBlocks(mem));
  const [moveOpen, setMoveOpen] = useState(false);
  const K = SC_KINDS[mem.kind];
  const memStory = stories && mem.storyId ? stories.find((s) => s.id === mem.storyId) : null;
  useEffect(() => { setTitle(mem.title); setBlocks(buildDefaultBlocks(mem)); setMoveOpen(false); }, [mem.id, mem.version]);
  const commit = (patch) => onEdit({ title: mem.title, passage: mem.passage, date: mem.date, ...patch });
  const nonEmptyTextCount = (list) => list.filter((b) => b.type === 'text' && (b.content || '').trim().length > 0).length;
  const canRemoveBlock = (block, list) => block.type !== 'text' || !(block.content || '').trim() || nonEmptyTextCount(list) > 1;
  const patchText = (id, content) => setBlocks((bs) => {
    const next = bs.map((b) => (b.id === id ? { ...b, content } : b));
    const primary = next.find((b) => b.type === 'text');
    commit({ passage: ((primary && primary.content) || '').trim() || mem.passage });
    return next;
  });
  const removeBlock = (id) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const addText = (afterIndex) => setBlocks((bs) => { const next = [...bs]; next.splice(afterIndex + 1, 0, { id: scBlockId(), type: 'text', content: '' }); return next; });
  const addImage = (afterIndex) => setBlocks((bs) => { const next = [...bs]; next.splice(afterIndex + 1, 0, { id: scBlockId(), type: 'image', mediaKind: 'still' }); return next; });
  const menuItem = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer', borderRadius: 8 };
  const menuOn = (e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)');
  const menuOff = (e) => (e.currentTarget.style.background = 'transparent');
  const footerBtn = { width: 36, height: 36, borderRadius: 9, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'border-color .15s, color .15s' };
  const footerOn = (e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.color = 'var(--hl-text)'; };
  const footerOff = (e) => { e.currentTarget.style.borderColor = 'var(--hl-border)'; e.currentTarget.style.color = 'var(--hl-muted)'; };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ flexShrink: 0, position: 'relative', padding: '14px 18px', borderBottom: '1px solid var(--hl-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => commit({ title: title.trim() || mem.title })}
            aria-label="Memory title"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500, letterSpacing: '-.01em', color: 'var(--hl-text)', padding: '4px 2px' }} />
          {memStory && (
            <button title={'In “' + memStory.name + '” — click to change or remove'} onClick={() => setMoveOpen((v) => !v)}
              style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 99, border: 'none', background: '#2E7D4F', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <SIcon n="check" s={17} sw={2.4} />
            </button>
          )}
          <button aria-label="Add to a story" title="Add to a story" onClick={() => setMoveOpen((v) => !v)}
              style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 99, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <SIcon n="plus" s={16} />
            </button>
          <button onClick={onBack} aria-label="Close" style={{ ...scGhost, border: 'none', padding: 7 }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}><SIcon n="x" s={18} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
          <SIcon n={K.icon} s={11} style={{ color: 'var(--hl-accent)', flexShrink: 0 }} />
          <span style={scMono}>{K.eyebrow}</span>
          <span style={{ ...scMono, opacity: .5 }}>·</span>
          <span style={scMono}>{mem.date}</span>
          {mem.version > 1 && <React.Fragment><span style={{ ...scMono, opacity: .5 }}>·</span><span style={{ ...scMono, color: 'var(--hl-accent)' }}>revised</span></React.Fragment>}
        </div>
        {moveOpen && (
          <React.Fragment>
            <div onClick={() => setMoveOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
            <div style={{ position: 'absolute', top: '100%', right: 46, marginTop: 4, minWidth: 190, padding: 5, borderRadius: 11, border: '1px solid var(--hl-border)', background: 'var(--hl-bg-2)', boxShadow: '0 10px 28px rgba(0,0,0,.18)', zIndex: 30 }}>
              {memStory && (
                <React.Fragment>
                  <button style={{ ...menuItem, color: 'var(--hl-danger, #B0432F)' }} onMouseEnter={menuOn} onMouseLeave={menuOff}
                    onClick={() => { setMoveOpen(false); onMoveStory && onMoveStory(null); }}>
                    <SIcon n="folderMinus" s={14} />Remove from “{memStory.name}”
                  </button>
                  <div style={{ height: 1, background: 'var(--hl-border)', margin: '5px 4px' }} />
                </React.Fragment>
              )}
              {stories && stories.map((s) => (
                <button key={s.id} style={{ ...menuItem, color: s.id === mem.storyId ? 'var(--hl-accent)' : 'var(--hl-text)' }} onMouseEnter={menuOn} onMouseLeave={menuOff}
                  onClick={() => { setMoveOpen(false); onMoveStory && onMoveStory(s.id); }}>
                  <SIcon n="bookOpen" s={14} />{s.name}
                </button>
              ))}
              {stories && stories.length > 0 && <div style={{ height: 1, background: 'var(--hl-border)', margin: '5px 4px' }} />}
              <button style={{ ...menuItem, color: 'var(--hl-accent)' }} onMouseEnter={menuOn} onMouseLeave={menuOff}
                onClick={() => { setMoveOpen(false); onCreateStory && onCreateStory(); }}>
                <SIcon n="plus" s={14} />New story
              </button>
            </div>
          </React.Fragment>
        )}
      </header>

      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ padding: '16px 18px 32px' }}>
          <BlockInserter onAddText={() => addText(-1)} onAddImage={() => addImage(-1)} />
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, listStyle: 'none' }}>
            {blocks.map((b, i) => (
              <li key={b.id} style={{ listStyle: 'none' }}>
                <CanvasBlock block={b} canRemove={canRemoveBlock(b, blocks)} onChange={(content) => patchText(b.id, content)} onRemove={() => removeBlock(b.id)} />
                <BlockInserter onAddText={() => addText(i)} onAddImage={() => addImage(i)} />
              </li>
            ))}
          </ul>
          {parent && (
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--hl-border)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-accent)' }}>
              <SIcon n="fork" s={11} />Started from {parent.title}
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
        <button onClick={onTalk} aria-label="Talk about this" title="Talk about this" style={footerBtn} onMouseEnter={footerOn} onMouseLeave={footerOff}><SIcon n="chat" s={16} /></button>
        <button onClick={onFork} aria-label="Use as a base" title="Use as a base" style={footerBtn} onMouseEnter={footerOn} onMouseLeave={footerOff}><SIcon n="fork" s={16} /></button>
        <button onClick={onDelete} aria-label="Remove" title="Remove" style={{ ...footerBtn, marginLeft: 'auto' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-danger, #B0432F)')} onMouseLeave={footerOff}><SIcon n="trash" s={16} /></button>
      </div>
    </div>
  );
}


/* ── Curtain — the draggable divider between two panes ───────────────────
   onStart() returns the pane's current width; onMove(base, delta) applies it.
   Keyboard: ←/→ nudge by 16px, Home resets — the drag is never the only way. */
function SCCurtain({ onStart, onMove, onReset, label }) {
  const [hot, setHot] = useState(false);
  const [live, setLive] = useState(false);
  const down = (e) => {
    if (e.button) return;
    e.preventDefault();
    const x0 = e.clientX, base = onStart();
    setLive(true);
    const mv = (ev) => onMove(base, ev.clientX - x0);
    const up = () => {
      setLive(false);
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  };
  const key = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onMove(onStart(), -16); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onMove(onStart(), 16); }
    else if (e.key === 'Home' && onReset) { e.preventDefault(); onReset(); }
  };
  const on = hot || live;
  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      onPointerDown={down} onKeyDown={key} onDoubleClick={onReset}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)} onBlur={() => setHot(false)}
      style={{ flex: '0 0 auto', width: 9, minWidth: 9, alignSelf: 'stretch', position: 'relative', cursor: 'col-resize', background: on ? 'var(--hl-accent-soft)' : 'transparent', transition: 'background .15s', outline: 'none', touchAction: 'none', zIndex: 24 }}>
      <span style={{ position: 'absolute', top: 0, bottom: 0, left: 4, width: 1, background: on ? 'var(--hl-accent)' : 'var(--hl-border)', transition: 'background .15s' }} />
      <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 4, height: 30, borderRadius: 99, background: 'var(--hl-accent)', opacity: on ? 1 : 0, transition: 'opacity .15s' }} />
    </div>
  );
}
const scClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

Object.assign(window, { Deck, DeckRow, DeckEndRow, DeckEndTile, DeckGridTile, AddMenu, CoverBackPanel, PreviewModal, CardView, StoryMenu, ScMedia, SIcon, SC_KINDS, SCCurtain, scClamp, COVER_TEMPLATES, BACK_TEMPLATES, useIsMobile });
