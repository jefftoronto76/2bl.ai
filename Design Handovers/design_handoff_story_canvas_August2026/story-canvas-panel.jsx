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

/* ── CARD LEVEL — one chapter (memory), read page by page then edited ──── */
function CardView({ mem, index, total, parent, onBack, onPage, onEdit, onTalk, onFork, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(mem.title);
  const [passage, setPassage] = useState(mem.passage);
  const taRef = useRef(null);
  const K = SC_KINDS[mem.kind];
  const pages = React.useMemo(() => paginate(mem.passage, !!K.media), [mem.id, mem.passage, K.media]);
  const [subIndex, setSubIndex] = useState(0);
  const prevChapterIndexRef = useRef(index);
  useEffect(() => { setEditing(false); setTitle(mem.title); setPassage(mem.passage); }, [mem.id, mem.version]);
  useEffect(() => {
    if (index !== prevChapterIndexRef.current) {
      setSubIndex(index > prevChapterIndexRef.current ? 0 : pages.length - 1);
      prevChapterIndexRef.current = index;
    } else if (subIndex > pages.length - 1) { setSubIndex(pages.length - 1); }
  }, [index, pages.length]);
  useEffect(() => { if (editing && taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px'; } }, [editing, passage]);
  const field = { width: '100%', boxSizing: 'border-box', background: 'var(--hl-bg-2)', border: '1px solid var(--hl-border-strong)', borderRadius: 11, padding: '12px 14px', color: 'var(--hl-text)', outline: 'none', resize: 'none' };
  const save = () => { onEdit({ title: title.trim() || mem.title, passage: passage.trim() || mem.passage }); setEditing(false); };
  const atBookStart = index === 0 && subIndex === 0;
  const atBookEnd = index === total - 1 && subIndex === pages.length - 1;
  const turn = (d) => { const t = subIndex + d; if (t >= 0 && t < pages.length) setSubIndex(t); else onPage(d); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ ...scHeader, gap: 8, paddingLeft: 10, paddingRight: 10 }}>
        <button onClick={onBack} style={{ ...scGhost, border: 'none', padding: '7px 10px 7px 7px', fontSize: 12.5, color: 'var(--hl-muted)' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}><SIcon n="arrowLeft" s={15} />Contents</button>
        <span style={{ flex: 1 }} />
        <button aria-label="Previous page" disabled={atBookStart} onClick={() => turn(-1)} style={{ ...scGhost, border: 'none', padding: 7, opacity: atBookStart ? .35 : 1, cursor: atBookStart ? 'default' : 'pointer' }}><SIcon n="chevronLeft" s={17} /></button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>Chapter {index + 1}/{total} · Page {subIndex + 1}/{pages.length}</span>
        <button aria-label="Next page" disabled={atBookEnd} onClick={() => turn(1)} style={{ ...scGhost, border: 'none', padding: 7, opacity: atBookEnd ? .35 : 1, cursor: atBookEnd ? 'default' : 'pointer' }}><SIcon n="chevronRight" s={17} /></button>
      </header>

      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '22px 22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <SIcon n={K.icon} s={12} style={{ color: 'var(--hl-accent)' }} />
            <span style={scMono}>{K.eyebrow}</span>
            {mem.version > 1 && <span style={{ ...scMono, color: 'var(--hl-accent)' }}>· revised</span>}
          </div>

          {editing ? (
            <React.Fragment>
              {K.media && <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--hl-border)', marginBottom: 18 }}><ScMedia kind={K.media} /></div>}
              <div style={{ ...scMono, marginBottom: 7 }}>Title</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...field, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, lineHeight: 1.2 }} />
              <div style={{ ...scMono, margin: '18px 0 7px' }}>In your words</div>
              <textarea ref={taRef} value={passage} onChange={(e) => setPassage(e.target.value)} rows={10} style={{ ...field, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.72, minHeight: 220 }} />
              <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-faint)', textWrap: 'pretty' }}>These are your words now — the guide won't rewrite them unless you ask it to.</p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              {subIndex === 0 && <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: 1.14, letterSpacing: '-.015em', color: 'var(--hl-text)', textWrap: 'pretty' }}>{mem.title}</h2>}
              {subIndex === 0 && K.media && <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--hl-border)', margin: '16px 0' }}><ScMedia kind={K.media} /></div>}
              <p style={{ margin: subIndex === 0 ? '14px 0 0' : 0, fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.75, color: 'var(--hl-text)', opacity: .88, textWrap: 'pretty' }}>{pages[subIndex]}</p>
              {K.slots && subIndex === pages.length - 1 && (
                <React.Fragment>
                  <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8 }}><span style={scMono}>Photos</span><span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--hl-faint)' }}>— add them whenever you find them</span></div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 56, height: 56, borderRadius: 10, border: '1px dashed var(--hl-border-strong)', display: 'grid', placeItems: 'center', color: 'var(--hl-faint)', background: 'var(--hl-surface-2)' }}><SIcon n="imagePlus" s={16} /></span>)}</div>
                </React.Fragment>
              )}
              {subIndex === pages.length - 1 && (
                <div style={{ marginTop: 24, paddingTop: 15, borderTop: '1px solid var(--hl-border)', display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>
                  <span>Kept {mem.date}</span><span>·</span><span>{pages.length > 1 ? pages.length + ' pages' : '1 page'}</span>
                  {parent && <React.Fragment><span>·</span><span style={{ color: 'var(--hl-accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><SIcon n="fork" s={11} />Started from {parent.title}</span></React.Fragment>}
                </div>
              )}
            </React.Fragment>
          )}
        </div>
      </div>

      <footer style={{ flexShrink: 0, borderTop: '1px solid var(--hl-border)', padding: '12px 16px', background: 'var(--hl-bg-2)' }}>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button onClick={save} style={scPrimary} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}><SIcon n="check" s={14} />Save changes</button>
            <button onClick={() => { setTitle(mem.title); setPassage(mem.passage); setEditing(false); }} style={scGhost} onMouseEnter={ghostOn} onMouseLeave={ghostOff}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <button onClick={() => setEditing(true)} style={scPrimary} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}><SIcon n="pencil" s={14} />Edit</button>
            <button onClick={onTalk} style={scGhost} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="chat" s={14} />Talk about this</button>
            <button onClick={onFork} style={scGhost} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="fork" s={14} />Use as a base</button>
            <button onClick={onDelete} style={{ ...scGhost, border: 'none', marginLeft: 'auto', color: 'var(--hl-faint)' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-danger, #B0432F)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-faint)')}><SIcon n="trash" s={14} />Remove</button>
          </div>
        )}
      </footer>
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
