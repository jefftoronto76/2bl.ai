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
function DeckRow({ mem, index, total, parent, onOpen, onEditStub, drag }) {
  const [hover, setHover] = useState(false);
  const K = SC_KINDS[mem.kind];
  const dragging = drag.fromIndex === index;
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag.start(index); }}
      onDragEnter={() => drag.over(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={drag.end}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ listStyle: 'none', display: 'flex', alignItems: 'stretch', gap: 10, opacity: dragging ? 0.35 : 1, transition: 'opacity .15s' }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: hover || dragging ? 'var(--hl-muted)' : 'transparent', cursor: 'grab', transition: 'color .15s' }}><SIcon n="grip" s={16} /></span>
      <button onClick={onOpen}
        onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); drag.nudge(index, e.key === 'ArrowUp' ? -1 : 1); } }}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', gap: 14, padding: '15px 16px', borderRadius: 14, border: '1px solid', borderColor: drag.overIndex === index && !dragging ? 'var(--hl-accent)' : 'var(--hl-border)', background: 'var(--hl-surface)', cursor: 'pointer', boxShadow: hover ? '0 14px 30px -22px var(--hl-shadow)' : 'none', transition: 'border-color .16s, box-shadow .16s, transform .16s', transform: hover ? 'translateY(-1px)' : 'none' }}>
        <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, paddingTop: 2 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)' }}>{String(index + 1).padStart(2, '0')}</span>
          <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><SIcon n={K.icon} s={13} /></span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500, lineHeight: 1.2, color: 'var(--hl-text)', letterSpacing: '-.01em' }}>{mem.title}</span>
            {mem.version > 1 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--hl-accent)', border: '1px solid var(--hl-accent-line)', borderRadius: 5, padding: '1px 4px' }}>v{mem.version}</span>}
          </span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 5, fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--hl-muted)', textWrap: 'pretty' }}>{mem.passage}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>
            {mem.date}
            {parent && <React.Fragment><i style={{ width: 3, height: 3, borderRadius: 9, background: 'currentColor', opacity: .6 }} /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--hl-accent)' }}><SIcon n="fork" s={11} />from {parent.title}</span></React.Fragment>}
          </span>
        </span>
      </button>
      <button aria-label="Edit this memory" title="Edit" onClick={(e) => { e.stopPropagation(); onEditStub(); }}
        style={{ flexShrink: 0, alignSelf: 'center', width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer', opacity: hover ? 1 : 0, transition: 'opacity .15s, color .15s' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-faint)')}><SIcon n="edit" s={15} /></button>
    </li>
  );
}

function Deck({ memories, story, onOpen, onReorder, onEditStub, onAllStories, onClose, compact }) {
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
      <header style={{ ...scHeader, gap: 10 }}>
        <SIcon n="book" s={15} style={{ color: 'var(--hl-accent)' }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, lineHeight: 1.25, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story}</span>
          <span style={{ ...scMono, fontSize: 9.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memories.length} memories · you own this story</span>
        </span>
        {onAllStories && <button onClick={onAllStories} style={{ ...scGhost, border: 'none', fontSize: 12, whiteSpace: 'nowrap' }} onMouseEnter={ghostOn} onMouseLeave={ghostOff}>All stories</button>}
        <button aria-label="Share this story" title="Share this story" style={{ ...scGhost, padding: 8 }} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="users" s={15} /></button>
        <button title="Publish this story" aria-label="Publish this story" style={{ ...scPrimary, padding: compact ? 8 : '7px 14px', fontSize: 12.5 }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}><SIcon n="upload" s={14} />{!compact && 'Publish'}</button>
        {compact && <button aria-label="Close story" onClick={onClose} style={{ ...scGhost, border: 'none', padding: 7 }}><SIcon n="x" s={17} /></button>}
      </header>
      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 26px' }}>
        <p style={{ margin: '0 0 14px 32px', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-faint)' }}>Drag a chapter to change where it sits in the story. Open one to read, page through it, or change it.</p>
        <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {memories.map((m, i) => (
            <DeckRow key={m.id} mem={m} index={i} total={memories.length} parent={m.parentId ? memories.find((p) => p.id === m.parentId) : null} onOpen={() => onOpen(m.id)} onEditStub={onEditStub} drag={drag} />
          ))}
        </ol>
        <div style={{ marginTop: 16, marginLeft: 32, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SIcon n="chat" s={14} />New memories arrive here as you keep them in the conversation.
        </div>
      </div>
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
const BLOCK_KINDS = {
  text: { label: 'Text', icon: 'fileText' },
  image: { label: 'Image', icon: 'image' },
  gallery: { label: 'Photo grid', icon: 'grid' },
  video: { label: 'Video', icon: 'video' },
  quote: { label: 'Quote', icon: 'quote' },
  divider: { label: 'Divider', icon: null },
};
let scBlockSeq = 0;
const scBlockId = () => 'blk-' + (++scBlockSeq);
function buildDefaultBlocks(mem, K) {
  const blocks = [];
  if (K.media) blocks.push({ id: scBlockId(), type: K.media === 'video' ? 'video' : 'image', mediaKind: K.media });
  blocks.push({ id: scBlockId(), type: 'text', content: mem.passage, primary: true });
  if (K.slots) blocks.push({ id: scBlockId(), type: 'gallery' });
  return blocks;
}

/* ── Block canvas — the card body between header and footer, a reorderable
   stack of blocks (text / image / gallery / video / quote / divider). Only
   the primary text block persists (mem.passage); other blocks are
   session-local until there's a real multi-block data model. ──── */
function BlockInserter({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 22, margin: '2px 0' }}
      onMouseEnter={() => {}} >
      <div style={{ flex: 1, height: 1, background: open ? 'var(--hl-border-strong)' : 'transparent', transition: 'background .15s' }} />
      <button onClick={() => setOpen((v) => !v)} aria-label="Add a block"
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
            {Object.entries(BLOCK_KINDS).map(([k, def]) => (
              <button key={k} title={def.label} aria-label={'Add ' + def.label} onClick={() => { onAdd(k); setOpen(false); }}
                style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
                {def.icon ? <SIcon n={def.icon} s={15} /> : <span style={{ width: 13, height: 2, borderRadius: 1, background: 'currentColor' }} />}
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function CanvasBlock({ block, onChange, onRemove, drag, index }) {
  const [hover, setHover] = useState(false);
  const taRef = useRef(null);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px'; } }, [block.content]);
  const dragging = drag.fromIndex === index;
  const wrap = { position: 'relative', borderRadius: 10, outline: drag.overIndex === index && !dragging ? '2px solid var(--hl-accent)' : 'none', outlineOffset: 2, opacity: dragging ? 0.35 : 1, transition: 'opacity .15s' };
  let body = null;
  if (block.type === 'text') body = (
    <textarea ref={taRef} value={block.content} onChange={(e) => onChange({ content: e.target.value })} rows={3}
      placeholder="Write something..."
      style={{ display: 'block', width: '100%', border: 'none', background: 'transparent', outline: 'none', resize: 'none', padding: 0, fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.75, color: 'var(--hl-text)', opacity: .9, textWrap: 'pretty' }} />
  );
  else if (block.type === 'quote') body = (
    <div style={{ display: 'flex', gap: 10, padding: '2px 0 2px 14px', borderLeft: '2px solid var(--hl-accent-line)' }}>
      <textarea ref={taRef} value={block.content} onChange={(e) => onChange({ content: e.target.value })} rows={2}
        placeholder="A line worth keeping..."
        style={{ display: 'block', width: '100%', border: 'none', background: 'transparent', outline: 'none', resize: 'none', padding: 0, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, lineHeight: 1.55, color: 'var(--hl-text)' }} />
    </div>
  );
  else if (block.type === 'image' || block.type === 'video') body = (
    <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--hl-border)' }}><ScMedia kind={block.mediaKind || (block.type === 'video' ? 'video' : 'still')} /></div>
  );
  else if (block.type === 'gallery') body = (
    <React.Fragment>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={scMono}>Photos</span><span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--hl-faint)' }}>— add them whenever you find them</span></div>
      <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 56, height: 56, borderRadius: 10, border: '1px dashed var(--hl-border-strong)', display: 'grid', placeItems: 'center', color: 'var(--hl-faint)', background: 'var(--hl-surface-2)' }}><SIcon n="imagePlus" s={16} /></span>)}</div>
    </React.Fragment>
  );
  else if (block.type === 'divider') body = <div style={{ height: 1, background: 'var(--hl-border)', margin: '10px 0' }} />;
  return (
    <li draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag.start(index); }}
      onDragEnter={() => drag.over(index)} onDragOver={(e) => e.preventDefault()} onDragEnd={drag.end}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ listStyle: 'none', display: 'flex', gap: 6, ...wrap }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 18, marginTop: block.type === 'divider' ? 8 : 2, display: 'flex', justifyContent: 'center', color: hover || dragging ? 'var(--hl-muted)' : 'transparent', cursor: 'grab', transition: 'color .15s' }}><SIcon n="grip" s={14} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
      <button onClick={onRemove} aria-label={'Remove ' + BLOCK_KINDS[block.type].label.toLowerCase() + ' block'}
        style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: block.type === 'divider' ? 6 : 0, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: hover ? 'var(--hl-faint)' : 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'color .15s' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-danger, #B0432F)')} onMouseLeave={(e) => (e.currentTarget.style.color = hover ? 'var(--hl-faint)' : 'transparent')}>
        <SIcon n="x" s={13} />
      </button>
    </li>
  );
}

function CardView({ mem, index, total, parent, stories, onBack, onPage, onEdit, onTalk, onFork, onDelete, onMoveStory }) {
  const [title, setTitle] = useState(mem.title);
  const [date, setDate] = useState(mem.date);
  const [blocks, setBlocks] = useState(() => buildDefaultBlocks(mem, SC_KINDS[mem.kind]));
  const [moveOpen, setMoveOpen] = useState(false);
  const [dragState, setDragState] = useState({ fromIndex: -1, overIndex: -1 });
  const K = SC_KINDS[mem.kind];
  useEffect(() => { setTitle(mem.title); setDate(mem.date); setBlocks(buildDefaultBlocks(mem, K)); setMoveOpen(false); }, [mem.id, mem.version]);
  const commit = (patch) => onEdit({ title: mem.title, passage: mem.passage, date: mem.date, ...patch });
  const patchBlock = (id, patch) => setBlocks((bs) => bs.map((b) => {
    if (b.id !== id) return b;
    const next = { ...b, ...patch };
    if (b.primary) commit({ passage: (patch.content ?? '').trim() || mem.passage });
    return next;
  }));
  const removeBlock = (id) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const insertBlock = (afterIndex, type) => setBlocks((bs) => {
    const next = [...bs];
    next.splice(afterIndex + 1, 0, { id: scBlockId(), type, content: '' });
    return next;
  });
  const drag = {
    fromIndex: dragState.fromIndex, overIndex: dragState.overIndex,
    start: (i) => setDragState({ fromIndex: i, overIndex: i }),
    over: (i) => setDragState((s) => ({ ...s, overIndex: i })),
    end: () => setDragState((s) => {
      const { fromIndex, overIndex } = s;
      if (fromIndex !== -1 && overIndex !== -1 && fromIndex !== overIndex) {
        setBlocks((bs) => { const next = [...bs]; const [moved] = next.splice(fromIndex, 1); next.splice(overIndex, 0, moved); return next; });
      }
      return { fromIndex: -1, overIndex: -1 };
    }),
  };
  const menuItem = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer', borderRadius: 8 };
  const menuOn = (e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)');
  const menuOff = (e) => (e.currentTarget.style.background = 'transparent');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ flexShrink: 0, position: 'relative', padding: '14px 18px', borderBottom: '1px solid var(--hl-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => commit({ title: title.trim() || mem.title })}
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500, letterSpacing: '-.01em', color: 'var(--hl-text)', padding: '4px 2px' }} />
          {stories && stories.length > 0 && (
            <button aria-label="Add to a story" title="Add to a story" onClick={() => setMoveOpen((v) => !v)}
              style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 99, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <SIcon n="plus" s={16} />
            </button>
          )}
          <button onClick={onBack} aria-label="Close" style={{ ...scGhost, border: 'none', padding: 7 }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}><SIcon n="x" s={18} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
          <SIcon n={K.icon} s={11} style={{ color: 'var(--hl-accent)', flexShrink: 0 }} />
          <span style={scMono}>{K.eyebrow}</span>
          <span style={{ ...scMono, opacity: .5 }}>·</span>
          <input value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => commit({ date: date.trim() || mem.date })}
            style={{ ...scMono, border: 'none', background: 'transparent', outline: 'none', width: 84, padding: 0 }} />
          {mem.version > 1 && <React.Fragment><span style={{ ...scMono, opacity: .5 }}>·</span><span style={{ ...scMono, color: 'var(--hl-accent)' }}>revised</span></React.Fragment>}
        </div>
        {moveOpen && (
          <React.Fragment>
            <div onClick={() => setMoveOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
            <div style={{ position: 'absolute', top: '100%', right: 46, marginTop: 4, minWidth: 190, padding: 5, borderRadius: 11, border: '1px solid var(--hl-border)', background: 'var(--hl-bg-2)', boxShadow: '0 10px 28px rgba(0,0,0,.18)', zIndex: 30 }}>
              {stories && stories.map((s) => (
                <button key={s.id} style={{ ...menuItem, color: s.id === mem.storyId ? 'var(--hl-accent)' : 'var(--hl-text)' }} onMouseEnter={menuOn} onMouseLeave={menuOff}
                  onClick={() => { setMoveOpen(false); onMoveStory && onMoveStory(s.id); }}>
                  <SIcon n="bookOpen" s={14} />{s.name}
                </button>
              ))}
            </div>
          </React.Fragment>
        )}
      </header>

      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 22px 32px' }}>
          <BlockInserter onAdd={(type) => insertBlock(-1, type)} />
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {blocks.map((b, i) => (
              <React.Fragment key={b.id}>
                <CanvasBlock block={b} index={i} drag={drag} onChange={(patch) => patchBlock(b.id, patch)} onRemove={() => removeBlock(b.id)} />
                <BlockInserter onAdd={(type) => insertBlock(i, type)} />
              </React.Fragment>
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
        <button onClick={onTalk} style={scGhost} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="chat" s={14} />Talk about this</button>
        <button onClick={onFork} style={scGhost} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="fork" s={14} />Use as a base</button>
        <button onClick={onDelete} style={{ ...scGhost, marginLeft: 'auto', color: 'var(--hl-danger, #B0432F)' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--hl-danger, #B0432F)')} onMouseLeave={ghostOff}><SIcon n="trash" s={14} />Remove</button>
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

Object.assign(window, { Deck, DeckRow, CardView, StoryMenu, ScMedia, SIcon, SC_KINDS, SCCurtain, scClamp });
