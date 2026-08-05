/* Heirloom — Story Canvas
   Transcript on the left, the story's memory deck on the right.
   Two panel levels: DECK (ordered cards, drag to reorder) → CARD (one memory).
   A saved memory is directly editable by its owner; "Talk about this" pins it
   into the live conversation instead. */
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

const STORIES = [
  { id: 'beaver', name: 'Beaver Lake Summers', tagline: 'The cottage years' },
  { id: 'halifax', name: 'The Halifax Years', tagline: 'Before we moved west' },
  { id: 'work', name: "Dad's Working Life", tagline: 'The shop, the trucks, the men' },
];
const CONVS = [
  { id: 'c-lake', title: 'Summers at the lake', storyId: 'beaver' },
  { id: 'c-kitchen', title: "Mum's kitchen", storyId: 'beaver' },
  { id: 'c-hfx', title: 'Leaving Halifax', storyId: 'halifax' },
  { id: 'c-dad', title: 'Dad and the shop', storyId: 'work' },
];

/* Memories are held per story — the deck IS the story's order. */
const SEED_DECKS = {
  beaver: [
    { id: 'm1', convId: 'c-lake', kind: 'conversation', title: 'The kitchen at Beaver Lake', date: 'March 4', passage: 'The kitchen was the whole cottage, really. One long window over the sink, and if you stood there washing up you could see clear down to the dock. Mum kept the radio on the shelf by the flour tin — CBC, always, even when the signal drifted. I remember the smell of the propane fridge more than anything, that sweet warm smell that meant we had arrived and the summer had started. We ate at a table my grandfather built out of a door. It wobbled. Nobody ever fixed it, and by the end we would have been offended if somebody had.', alt: 'You could not be in that cottage without being in the kitchen. One long window over the sink, and if you stood there washing up you looked clear down to the dock and the whole lake past it. Mum kept the radio on the shelf by the flour tin — CBC, always, even when the signal drifted into hiss. What comes back first is the smell of the propane fridge, sweet and warm, the smell that meant we had arrived and summer had properly started. We ate at a table my grandfather built out of an old door. It wobbled every meal for twenty years. Nobody ever fixed it, and by the end we would have been offended if somebody had.' },
    { id: 'm2', convId: 'c-lake', kind: 'conversation', title: 'The dock at first light', date: 'March 4', passage: 'I was the only one who got up early, so the lake at six belonged to me. Flat as a plate, mist sitting on it, loons somewhere out past the point. I used to sit on the end of the dock with my feet in and wait for the first boat to break it up. Nobody knew I did this for about nine summers.' },
    { id: 'm3', convId: 'c-kitchen', kind: 'audio', title: 'Mum singing at the sink', date: 'March 11', passage: 'She did not sing for anybody. She sang the way other people hum without noticing — dishes going, water running, half a line and then a gap where she was thinking about something else. I taped it on a little recorder I got for my birthday and she never knew. Forty years later it is the only recording of her voice that exists, and it is four minutes of running water and half a song.' },
    { id: 'm4', convId: 'c-lake', kind: 'conversation', title: 'The night the power went out', date: 'March 11', passage: 'Ice storm, the January I was eleven. Five days without power and my father decided this was an adventure rather than an emergency, which is how he decided most things. We slept in the front room around the woodstove, all four of us, and he read to us by a kerosene lamp until his voice gave out. My mother melted snow on the stove for washing water. I have never once felt safer than I did in that cold house.' },
    { id: 'm5', convId: 'c-lake', kind: 'photo', title: "Aunt Nora's canoe", date: 'March 18', passage: 'Cedar, and far too heavy for one person, which never stopped her. She is standing at the bow end in this one with her hand flat on the gunwale like you would rest a hand on a horse. She left it to me and I have never had the nerve to put it in the water.' },
  ],
  halifax: [
    { id: 'm6', convId: 'c-hfx', kind: 'document', title: "Grandpa's enlistment papers", date: 'March 18', passage: 'Two pages, typed, with his age given as nineteen when he was seventeen. Somebody at the recruiting office in Halifax either did not check or did not care to. His occupation is listed as farm labourer. His mother is listed as next of kin, and her name is spelled wrong — the anglicised spelling, not the one on her own marriage record. That misspelling followed the family for three generations.' },
    { id: 'm7', convId: 'c-hfx', kind: 'video', title: 'Teaching Ellie to skate', date: 'March 22', passage: 'Forty seconds of a rink in Dartmouth and my granddaughter refusing, absolutely refusing, to let go of the boards. You can hear me off camera promising her a hot chocolate. She let go about a minute after I stopped filming, which is exactly how these things go — the important part never makes it into the footage.' },
  ],
  work: [
    { id: 'm8', convId: 'c-dad', kind: 'photo', title: "Dad's Studebaker", date: 'March 4', passage: 'He is leaning on the fender with his sleeves rolled, and you can tell from his face that he has just been told to stand still. The car was already old when he bought it. It cost him a summer of hauling shingles and it never once started on the first try, but he would not hear a word said against it. He drove my mother to their wedding in that car with a coat over the passenger seat because the spring had come through.', alt: 'He is leaning on the fender with his sleeves rolled, and you can read on his face that somebody has just told him to hold still. The car was old before he ever owned it. It cost him a full summer of hauling shingles, and it never once started on the first try — but he would not hear a word said against it. He drove my mother to their wedding in that car, with his good coat laid over the passenger seat because the spring had come through the upholstery.' },
  ],
};

const SEED_THREADS = {
  'c-lake': [
    { id: 'l1', role: 'assistant', text: "You mentioned your mother kept the radio on the shelf by the flour tin. Was it always the same station?" },
    { id: 'l2', role: 'user', text: "CBC. Always CBC, even when you couldn't hear a thing through the static." },
    { id: 'l3', role: 'assistant', text: "That's the detail I'd keep. I've written the kitchen up and put it in Beaver Lake Summers — it's the first page of the story now." },
  ],
  'c-kitchen': [
    { id: 'k1', role: 'assistant', text: 'You said she never sang for anybody. What was she doing when she did sing?' },
    { id: 'k2', role: 'user', text: 'Dishes, mostly. Never when she knew you were listening.' },
    { id: 'k3', role: 'assistant', text: "I've kept the recording with a short passage around it. It's in Beaver Lake Summers." },
  ],
  'c-hfx': [
    { id: 'h1', role: 'assistant', text: 'The enlistment papers give his age as nineteen. You said he was seventeen — did the family ever talk about that?' },
    { id: 'h2', role: 'user', text: 'Never once, not in front of him anyway.' },
  ],
  'c-dad': [
    { id: 'd1', role: 'assistant', text: 'Tell me about the Studebaker. You said it never started on the first try.' },
  ],
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
function DeckRow({ mem, index, total, parent, onOpen, drag }) {
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
    </li>
  );
}

function Deck({ memories, story, onOpen, onReorder, onClose, compact }) {
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
        <button aria-label="Share this story" title="Share this story" style={{ ...scGhost, padding: 8 }} onMouseEnter={ghostOn} onMouseLeave={ghostOff}><SIcon n="users" s={15} /></button>
        <button title="Publish this story" aria-label="Publish this story" style={{ ...scPrimary, padding: compact ? 8 : '7px 14px', fontSize: 12.5 }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}><SIcon n="upload" s={14} />{!compact && 'Publish'}</button>
        {compact && <button aria-label="Close story" onClick={onClose} style={{ ...scGhost, border: 'none', padding: 7 }}><SIcon n="x" s={17} /></button>}
      </header>
      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 26px' }}>
        <p style={{ margin: '0 0 14px 32px', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-faint)' }}>Drag a page to change where it sits in the story. Open one to read or change it.</p>
        <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {memories.map((m, i) => (
            <DeckRow key={m.id} mem={m} index={i} total={memories.length} parent={m.parentId ? memories.find((p) => p.id === m.parentId) : null} onOpen={() => onOpen(m.id)} drag={drag} />
          ))}
        </ol>
        <div style={{ marginTop: 16, marginLeft: 32, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SIcon n="chat" s={14} />New memories arrive here as you keep them in the conversation.
        </div>
      </div>
    </div>
  );
}

/* ── CARD LEVEL — one memory, read then edited ─────────────────────────── */
function CardView({ mem, index, total, parent, onBack, onPage, onEdit, onTalk, onFork, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(mem.title);
  const [passage, setPassage] = useState(mem.passage);
  const taRef = useRef(null);
  useEffect(() => { setEditing(false); setTitle(mem.title); setPassage(mem.passage); }, [mem.id, mem.version]);
  useEffect(() => { if (editing && taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px'; } }, [editing, passage]);
  const K = SC_KINDS[mem.kind];
  const field = { width: '100%', boxSizing: 'border-box', background: 'var(--hl-bg-2)', border: '1px solid var(--hl-border-strong)', borderRadius: 11, padding: '12px 14px', color: 'var(--hl-text)', outline: 'none', resize: 'none' };
  const save = () => { onEdit({ title: title.trim() || mem.title, passage: passage.trim() || mem.passage }); setEditing(false); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ ...scHeader, gap: 8, paddingLeft: 10, paddingRight: 10 }}>
        <button onClick={onBack} style={{ ...scGhost, border: 'none', padding: '7px 10px 7px 7px', fontSize: 12.5, color: 'var(--hl-muted)' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}><SIcon n="arrowLeft" s={15} />Story</button>
        <span style={{ flex: 1 }} />
        <button aria-label="Previous memory" disabled={index === 0} onClick={() => onPage(-1)} style={{ ...scGhost, border: 'none', padding: 7, opacity: index === 0 ? .35 : 1, cursor: index === 0 ? 'default' : 'pointer' }}><SIcon n="chevronLeft" s={17} /></button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--hl-faint)', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{index + 1} / {total}</span>
        <button aria-label="Next memory" disabled={index === total - 1} onClick={() => onPage(1)} style={{ ...scGhost, border: 'none', padding: 7, opacity: index === total - 1 ? .35 : 1, cursor: index === total - 1 ? 'default' : 'pointer' }}><SIcon n="chevronRight" s={17} /></button>
      </header>

      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '22px 22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <SIcon n={K.icon} s={12} style={{ color: 'var(--hl-accent)' }} />
            <span style={scMono}>{K.eyebrow}</span>
            {mem.version > 1 && <span style={{ ...scMono, color: 'var(--hl-accent)' }}>· revised</span>}
          </div>
          {K.media && <div style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid var(--hl-border)', marginBottom: 18 }}><ScMedia kind={K.media} /></div>}

          {editing ? (
            <React.Fragment>
              <div style={{ ...scMono, marginBottom: 7 }}>Title</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...field, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, lineHeight: 1.2 }} />
              <div style={{ ...scMono, margin: '18px 0 7px' }}>In your words</div>
              <textarea ref={taRef} value={passage} onChange={(e) => setPassage(e.target.value)} rows={10} style={{ ...field, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.72, minHeight: 220 }} />
              <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-faint)', textWrap: 'pretty' }}>These are your words now — the guide won't rewrite them unless you ask it to.</p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: 1.14, letterSpacing: '-.015em', color: 'var(--hl-text)', textWrap: 'pretty' }}>{mem.title}</h2>
              <p style={{ margin: '14px 0 0', fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.75, color: 'var(--hl-text)', opacity: .88, textWrap: 'pretty' }}>{mem.passage}</p>
              {K.slots && (
                <React.Fragment>
                  <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8 }}><span style={scMono}>Photos</span><span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--hl-faint)' }}>— add them whenever you find them</span></div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 56, height: 56, borderRadius: 10, border: '1px dashed var(--hl-border-strong)', display: 'grid', placeItems: 'center', color: 'var(--hl-faint)', background: 'var(--hl-surface-2)' }}><SIcon n="imagePlus" s={16} /></span>)}</div>
                </React.Fragment>
              )}
              <div style={{ marginTop: 24, paddingTop: 15, borderTop: '1px solid var(--hl-border)', display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>
                <span>Kept {mem.date}</span><span>·</span><span>Page {index + 1} of {total}</span>
                {parent && <React.Fragment><span>·</span><span style={{ color: 'var(--hl-accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><SIcon n="fork" s={11} />Started from {parent.title}</span></React.Fragment>}
              </div>
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

/* ── TRANSCRIPT ─────────────────────────────────────────────────────────── */
function Transcript({ messages, pinned, onUnpin, onSend, thinking, onOpenStory, canvasOpen, story, count, convTitle, kept, onMenu }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, thinking, pinned]);
  const send = () => { const t = text.trim(); if (!t) return; setText(''); onSend(t); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderRight: '1px solid var(--hl-border)' }}>
      <header style={{ ...scHeader, gap: 10, paddingLeft: onMenu ? 8 : 18, paddingRight: 14 }}>
        {onMenu && <button onClick={onMenu} aria-label="Show menu" style={{ ...scGhost, border: 'none', padding: 7 }}><SIcon n="menu" s={18} /></button>}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, lineHeight: 1.25, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{convTitle}</span>
          <span style={{ ...scMono, fontSize: 9.5, whiteSpace: 'nowrap' }}>Conversation · {kept} kept here</span>
        </span>
        {!canvasOpen && (
          <button onClick={onOpenStory} title={`Open ${story}`} style={{ ...scGhost, padding: '7px 12px', fontSize: 12.5, maxWidth: 220 }} onMouseEnter={ghostOn} onMouseLeave={ghostOff}>
            <SIcon n="book" s={13} /><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story}</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-accent)' }}>{count}</span>
          </button>
        )}
      </header>

      <div ref={scrollRef} className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 18px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((m) => m.role === 'user' ? (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ maxWidth: '90%', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', padding: '12px 16px', borderRadius: 18, borderBottomRightRadius: 5, fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.6, textWrap: 'pretty' }}>{m.text}</div>
            </div>
          ) : m.role === 'receipt' ? (
            <div key={m.id} style={{ display: 'flex', gap: 12 }}>
              <span style={{ width: 32, flexShrink: 0 }} />
              <button onClick={m.onOpen} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '11px 14px', borderRadius: 13, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border-strong)')} onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')}>
                <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><SIcon n={m.icon || 'feather'} s={12} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 15.5, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--hl-faint)', marginTop: 2 }}>{m.note}</span>
                </span>
              </button>
            </div>
          ) : (
            <div key={m.id} style={{ display: 'flex', gap: 12 }}>
              <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 99, background: 'var(--hl-accent)', display: 'grid', placeItems: 'center', color: 'var(--hl-on-accent)', marginTop: 2 }}><SIcon n="feather" s={15} /></span>
              <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.68, color: 'var(--hl-text)', textWrap: 'pretty' }}>{m.text}</div>
            </div>
          ))}
          {messages.length === 0 && !thinking && (
            <div style={{ padding: '48px 8px', textAlign: 'center' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, margin: '0 auto 14px', borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><SIcon n="feather" s={20} /></span>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--hl-text)' }}>What would you like to remember?</p>
              <p style={{ margin: '8px auto 0', maxWidth: 340, fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6, color: 'var(--hl-muted)', textWrap: 'pretty' }}>Start anywhere. I'll ask questions, and when something is worth keeping I'll write it up as a page in your story.</p>
            </div>
          )}
          {thinking && (
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 99, background: 'var(--hl-accent)', display: 'grid', placeItems: 'center', color: 'var(--hl-on-accent)' }}><SIcon n="feather" s={15} /></span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 32 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--hl-faint)', animation: `scBounce 1.1s ${i * 0.15}s infinite ease-in-out` }} />)}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '0 18px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {pinned && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: -1, border: '1px solid var(--hl-accent-line)', borderBottom: 'none', borderRadius: '13px 13px 0 0', background: 'var(--hl-accent-soft)', animation: 'sc-in .2s ease' }}>
              <SIcon n={SC_KINDS[pinned.kind].icon} s={13} style={{ color: 'var(--hl-accent)' }} />
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ color: 'var(--hl-muted)' }}>Working on </span>{pinned.title}
              </span>
              <button onClick={onUnpin} aria-label="Stop working on this memory" style={{ ...scGhost, border: 'none', padding: 4, color: 'var(--hl-muted)' }}><SIcon n="x" s={14} /></button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 10px 10px 14px', border: '1px solid var(--hl-border-strong)', borderRadius: pinned ? '0 0 13px 13px' : 13, background: 'var(--hl-surface)' }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1}
              placeholder={pinned ? `What should change about "${pinned.title}"?` : 'Tell me about it…'}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-text)', maxHeight: 120, paddingTop: 6 }} />
            <button onClick={send} aria-label="Send" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none', background: text.trim() ? 'var(--hl-accent)' : 'var(--hl-surface-2)', color: text.trim() ? 'var(--hl-on-accent)' : 'var(--hl-faint)', display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'background .15s' }}><SIcon n="send" s={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ROOT — sidebar + transcript + canvas in one shell ─────────────────── */
function StoryCanvas() {
  const [device, setDevice] = useState('desktop');
  const [decks, setDecks] = useState(() => {
    const d = {}; Object.keys(SEED_DECKS).forEach((k) => { d[k] = SEED_DECKS[k].map((m) => ({ ...m, version: 1 })); }); return d;
  });
  const [convId, setConvId] = useState('c-lake');
  const [storyId, setStoryId] = useState('beaver');
  const [canvas, setCanvas] = useState({ open: false, level: 'deck', id: null });
  const [pinned, setPinned] = useState(null);          // { storyId, id }
  const [convs, setConvs] = useState(CONVS);
  const [threads, setThreads] = useState(SEED_THREADS);
  const [thinking, setThinking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);     // sidebar expanded over the canvas / on phone

  const phone = device === 'phone';
  const conv = convs.find((c) => c.id === convId) || convs[0];
  const messages = threads[convId] || [];
  const setMessages = (fn) => setThreads((prev) => ({ ...prev, [convId]: typeof fn === 'function' ? fn(prev[convId] || []) : fn }));
  const list = decks[storyId] || [];
  const story = STORIES.find((s) => s.id === storyId) || STORIES[0];
  const index = canvas.id ? list.findIndex((m) => m.id === canvas.id) : -1;
  const mem = index >= 0 ? list[index] : null;
  const pinnedMem = pinned ? (decks[pinned.storyId] || []).find((m) => m.id === pinned.id) : null;
  const storyCount = (id) => (decks[id] || []).length;
  const convCount = (id) => Object.values(decks).reduce((n, arr) => n + arr.filter((m) => m.convId === id).length, 0);

  const patch = (sid, id, next) => setDecks((prev) => ({ ...prev, [sid]: prev[sid].map((m) => (m.id === id ? { ...m, ...next } : m)) }));
  const newConversation = () => {
    const id = 'c-' + Date.now();
    setConvs((prev) => [{ id, title: 'New conversation', storyId }, ...prev]);
    setThreads((prev) => ({ ...prev, [id]: [{ id: 'n' + Date.now(), role: 'assistant', text: "Tell me about anything — a place, a person, an afternoon you keep coming back to. I'll ask a few questions, and when there's something worth keeping I'll write it up for you." }] }));
    setConvId(id); setPinned(null); setCanvas({ open: false, level: 'deck', id: null }); if (phone) setMenuOpen(false);
  };

  const openDeck = (sid) => { setStoryId(sid); setCanvas({ open: true, level: 'deck', id: null }); setMenuOpen(false); };
  const openCard = (id) => setCanvas({ open: true, level: 'card', id });
  const closeCanvas = () => setCanvas({ open: false, level: 'deck', id: null });

  const reorder = (from, to) => setDecks((prev) => {
    const next = prev[storyId].slice(); const [x] = next.splice(from, 1); next.splice(to, 0, x);
    return { ...prev, [storyId]: next };
  });
  const removeCard = (id) => {
    setDecks((prev) => ({ ...prev, [storyId]: prev[storyId].filter((m) => m.id !== id) }));
    setCanvas({ open: true, level: 'deck', id: null });
    if (pinned && pinned.id === id) setPinned(null);
  };

  const talk = (id) => {
    const m = list.find((x) => x.id === id); if (!m) return;
    setPinned({ storyId, id });
    if (phone) closeCanvas();
    setMessages((prev) => [...prev, { id: 'a' + Date.now(), role: 'assistant', text: `I'm reading “${m.title}.” Tell me what should change — a detail I got wrong, something missing, or a different place to start it from.` }]);
  };

  const fork = (id) => {
    const parent = list.find((x) => x.id === id); if (!parent) return;
    const nid = 'm' + Date.now();
    const child = { id: nid, convId, kind: 'conversation', title: 'Untitled memory', date: 'Just now', passage: "Nothing written yet. Tell me what this one should be about and I'll write it up from what you say.", parentId: parent.id, version: 1 };
    setDecks((prev) => { const next = prev[storyId].slice(); next.splice(next.findIndex((m) => m.id === id) + 1, 0, child); return { ...prev, [storyId]: next }; });
    setPinned({ storyId, id: nid });
    setCanvas(phone ? { open: false, level: 'card', id: nid } : { open: true, level: 'card', id: nid });
    setMessages((prev) => [...prev, { id: 'a' + Date.now(), role: 'assistant', text: `New page, started from “${parent.title}.” That one stays exactly as it is. What part of it do you want to open up?` }]);
  };

  const send = (text) => {
    setMessages((prev) => [...prev, { id: 'u' + Date.now(), role: 'user', text }]);
    setThinking(true);
    const target = pinned;
    setTimeout(() => {
      setThinking(false);
      if (target) {
        const fresh = (decks[target.storyId] || []).find((m) => m.id === target.id);
        if (!fresh) return;
        const next = { passage: fresh.alt || fresh.passage, version: fresh.version + 1 };
        if (fresh.title === 'Untitled memory') { next.title = 'Washing up after supper'; next.passage = 'The dishes were the one job nobody argued about, because it was the only half hour of the day the two of us were alone. She washed, I dried, and she talked about people I had never met as though I had. I understood about a third of it. I have spent a good part of my life since then trying to reconstruct the other two thirds.'; }
        patch(target.storyId, target.id, next);
        setMessages((prev) => [...prev,
          { id: 'a' + Date.now(), role: 'assistant', text: "Done — I've rewritten it with that in. Have a look and keep it if it sounds like you." },
          { id: 'r' + Date.now(), role: 'receipt', title: next.title || fresh.title, note: 'Updated in ' + (STORIES.find((s) => s.id === target.storyId) || {}).name, icon: SC_KINDS[fresh.kind].icon, onOpen: () => { setStoryId(target.storyId); openCard(target.id); } },
        ]);
      } else {
        setMessages((prev) => [...prev, { id: 'a' + Date.now(), role: 'assistant', text: 'Tell me more about that — who else was there, and what time of year was it?' }]);
      }
    }, 900);
  };

  const deckEl = <Deck memories={list} story={story.name} onOpen={openCard} onReorder={reorder} compact={phone || canvas.open} onClose={closeCanvas} />;
  const panel = canvas.level === 'card' && mem
    ? <CardView mem={mem} index={index} total={list.length} parent={mem.parentId ? list.find((p) => p.id === mem.parentId) : null}
        onBack={() => setCanvas({ open: true, level: 'deck', id: null })}
        onPage={(d) => { const t = index + d; if (t >= 0 && t < list.length) openCard(list[t].id); }}
        onEdit={(p) => patch(storyId, mem.id, p)} onTalk={() => talk(mem.id)} onFork={() => fork(mem.id)} onDelete={() => removeCard(mem.id)} />
    : deckEl;

  const railed = !phone && canvas.open && !menuOpen;
  const shell = (
    <div style={{ position: 'relative', display: 'flex', height: '100%', minHeight: 0, background: 'var(--hl-bg)', overflow: 'hidden' }}>
      {(!phone || menuOpen) && (
        <SCSidebar rail={railed} floating={(!phone && canvas.open && menuOpen) || (phone && menuOpen)}
          onToggle={() => setMenuOpen((v) => !v)}
          convs={convs} activeConvId={convId} onSelectConv={(id) => { setConvId(id); const c = convs.find((x) => x.id === id); if (c) setStoryId(c.storyId); setPinned(null); if (phone) setMenuOpen(false); }}
          onNewChat={newConversation}
          stories={STORIES} activeStoryId={storyId} canvasOpen={canvas.open}
          storyCount={storyCount} convCount={convCount}
          onOpenStory={openDeck} onNewStory={() => {}} />
      )}
      {menuOpen && (phone || canvas.open) && <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 35, background: 'color-mix(in srgb, var(--hl-text) 28%, transparent)' }} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <Transcript messages={messages} pinned={pinnedMem} onUnpin={() => setPinned(null)} onSend={send} thinking={thinking}
          convTitle={conv.title} kept={convCount(conv.id)}
          onOpenStory={() => openDeck(conv.storyId)} canvasOpen={canvas.open && !phone}
          story={(STORIES.find((s) => s.id === conv.storyId) || story).name} count={storyCount(conv.storyId)}
          onMenu={phone ? () => setMenuOpen(true) : null} />
      </div>

      {!phone && canvas.open && <aside style={{ width: 'clamp(380px, 40%, 540px)', flexShrink: 0, background: 'var(--hl-bg-2)', borderLeft: '1px solid var(--hl-border)' }}>{panel}</aside>}
      {phone && canvas.open && <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--hl-bg-2)' }}>{panel}</div>}
      {phone && !canvas.open && (
        <button onClick={() => openDeck(conv.storyId)} aria-label="Open story"
          style={{ position: 'absolute', right: 14, bottom: 92, zIndex: 15, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 15px', borderRadius: 99, border: '1px solid var(--hl-accent-line)', background: 'var(--hl-surface)', color: 'var(--hl-accent)', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, boxShadow: '0 16px 34px -18px var(--hl-shadow)', maxWidth: 260 }}>
          <SIcon n="book" s={15} /><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(STORIES.find((s) => s.id === conv.storyId) || story).name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{storyCount(conv.storyId)}</span>
        </button>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--hl-bg-2)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--hl-border)', background: 'var(--hl-bg)' }}>
        <span style={{ ...scMono, fontSize: 10 }}>Heirloom · story canvas in the chat shell</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)' }}>
          {[['desktop', 'Desktop'], ['phone', 'Phone']].map(([k, l]) => (
            <button key={k} onClick={() => { setDevice(k); setMenuOpen(false); }}
              style={{ padding: '6px 13px', borderRadius: 7, border: 'none', background: device === k ? 'var(--hl-surface)' : 'transparent', color: device === k ? 'var(--hl-text)' : 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: device === k ? '0 1px 3px rgba(26,21,15,.1)' : 'none' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: phone ? 'center' : 'stretch', padding: phone ? '24px 16px' : 0 }}>
        {phone
          ? <div style={{ width: 390, height: 'min(780px, calc(100vh - 110px))', borderRadius: 30, overflow: 'hidden', border: '1px solid var(--hl-border)', background: 'var(--hl-bg)', boxShadow: '0 40px 90px -40px var(--hl-shadow)' }}>{shell}</div>
          : shell}
      </div>
    </div>
  );
}

Object.assign(window, { StoryCanvas, Deck, CardView, Transcript, SIcon, SC_KINDS });
