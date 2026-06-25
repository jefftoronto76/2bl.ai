/* chat.jsx — Legacy chat panel (sidebar + header + messages + composer).
   Exports ChatPanel to window. */
(function () {
  const { useState, useRef, useEffect } = React;
  const Icon = window.Icon;

  let _id = 0;
  const uid = () => 'm' + (++_id);

  // Scripted story-guide turns — warm, unhurried, memoir-not-app.
  const GUIDE_TURNS = [
    "What a place to begin. Close your eyes for a moment — when you picture it, what is the very first thing you see? The light, a face, the room itself?",
    "I can almost see it. And the sound of it — was the house quiet, or always full of someone?",
    "That detail belongs in the book. Who was with you most often in those years?",
    "Thank you for trusting me with that. I've kept it safe as the opening of your first chapter. Whenever you're ready, tell me what happened next.",
  ];

  const STARTERS = [
    'The house I grew up in',
    'How my parents met',
    'A summer I\u2019ll never forget',
    'The work that defined me',
  ];

  const RECENT = [
    { n: 1, title: 'The house on Vandalia Street' },
    { n: 2, title: 'Meeting Eleanor' },
    { n: 3, title: 'The summer we drove west' },
    { n: 4, title: 'My father\u2019s workshop' },
  ];

  const PROMPTS = [
    'A scent that carries you straight back home',
    'The bravest thing you ever did for love',
    'Advice you\u2019d hand down to a great-grandchild',
    'A moment you knew everything had changed',
  ];

  // Fuller prompt set for the dedicated Writing Prompts view.
  const PROMPTS_ALL = [
    'A scent that carries you straight back home',
    'The bravest thing you ever did for love',
    'Advice you\u2019d hand down to a great-grandchild',
    'A moment you knew everything had changed',
    'The first house you ever called your own',
    'A meal that tasted like belonging',
    'Someone who believed in you before you did',
    'A risk that turned out to be the right one',
  ];

  // ---- Stories: the top-level container. Chapters now live INSIDE a story. --
  const STORIES = [
    {
      id: 's1', name: 'A Life in Full', tagline: 'The long arc \u2014 childhood to now.',
      chapters: [
        { n: 1, title: 'The house on Vandalia Street' },
        { n: 2, title: 'Meeting Eleanor' },
        { n: 3, title: 'The summer we drove west' },
        { n: 4, title: 'My father\u2019s workshop' },
      ],
      collaborators: [
        { name: 'Eleanor Hayes', rel: 'Daughter', status: 'joined' },
        { name: 'Marcus Bell', rel: 'Brother', status: 'pending' },
        { name: 'Sofia Russo', rel: 'Granddaughter', status: 'pending' },
      ],
    },
    {
      id: 's2', name: 'The Bell Family', tagline: 'Where we came from, and how.',
      chapters: [
        { n: 1, title: 'Crossing on the Saturnia' },
        { n: 2, title: 'Arthur Avenue, 1961' },
        { n: 3, title: 'The bakery years' },
      ],
      collaborators: [
        { name: 'Marcus Bell', rel: 'Brother', status: 'joined' },
        { name: 'Rosa Bell', rel: 'Mother', status: 'joined' },
      ],
    },
    {
      id: 's3', name: 'Letters to the Grandchildren', tagline: 'The things I want them to keep.',
      chapters: [
        { n: 1, title: 'On work worth doing' },
        { n: 2, title: 'What love asks of you' },
      ],
      collaborators: [
        { name: 'Sofia Russo', rel: 'Granddaughter', status: 'pending' },
      ],
    },
  ];

  // ---- Uploads: media gathered alongside the stories. ----------------------
  const UPLOADS = [
    { kind: 'image', name: 'Wedding, 1968.jpg', meta: 'Photograph', tint: 36 },
    { kind: 'image', name: 'The blue Plymouth.jpg', meta: 'Photograph', tint: 22 },
    { kind: 'audioLines', name: 'Grandmother\u2019s voice.m4a', meta: '4:12 \u00b7 Voice note' },
    { kind: 'image', name: 'Arthur Avenue.jpg', meta: 'Photograph', tint: 48 },
    { kind: 'fileText', name: 'Letter from Palermo.pdf', meta: 'Document' },
    { kind: 'image', name: 'The workshop.jpg', meta: 'Photograph', tint: 14 },
  ];

  // Top-level navigation — Memories / Dashboard / Invite removed; Stories added.
  // Search is intentionally NOT here: it stays subtle until the library grows
  // past a threshold (see SearchField + SEARCH_THRESHOLD below).
  const NAV = [
    { icon: 'edit', label: 'New Chat', action: 'new', view: 'home' },
    { icon: 'upload', label: 'Uploads', action: 'view', view: 'uploads' },
    { icon: 'share', label: 'Share Legacy', action: 'share' },
  ];

  // Search reveals itself only once the conversation library crosses this size.
  const SEARCH_THRESHOLD = 8;

  // ---- Invite / collaborators --------------------------------------------
  const LINK_BASE = 'heirloom.life/join/';
  const makeToken = () => {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const g = (n) => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
    return g(4) + '-' + g(4) + '-' + g(4);
  };
  const SEED_COLLABS = [
    { name: 'Eleanor Hayes', rel: 'Daughter', status: 'joined' },
    { name: 'Marcus Bell', rel: 'Brother', status: 'pending' },
    { name: 'Sofia Russo', rel: 'Granddaughter', status: 'pending' },
  ];
  const initials = (n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  // ---- Share the product -------------------------------------------------
  const SHARE_URL = 'https://heirloom.life';
  const SHARE_MSG = 'Every life deserves to be told. I’m using Legacy to turn memories into a real, lasting book — you have to see this.';
  const SHARE_CHANNELS = [
    { key: 'x', label: 'X', glyph: 'X', href: (u, m) => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(m) + '&url=' + encodeURIComponent(u) },
    { key: 'fb', label: 'Facebook', glyph: 'f', href: (u) => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u) },
    { key: 'li', label: 'LinkedIn', glyph: 'in', href: (u) => 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(u) },
    { key: 'mail', label: 'Email', icon: 'mail', href: (u, m) => 'mailto:?subject=' + encodeURIComponent('A story worth keeping') + '&body=' + encodeURIComponent(m + '\n\n' + u) },
  ];

  // ---- Record context menu ----------------------------------------------
  // Generic overflow menu for a story/chapter record. Positioned by the
  // parent (ChatPanel) in section-relative coords so it survives the chat
  // panel's transform + the sidebar's overflow:hidden.
  function RecordMenu({ pos, item, onAction }) {
    const items = [
      { key: 'star', icon: 'star', label: item.starred ? 'Unstar' : 'Star' },
      { key: 'rename', icon: 'edit', label: 'Rename' },
      { key: 'invite', icon: 'userPlus', label: 'Invite collaborators' },
      { key: 'move', icon: 'folder', label: 'Move to story' },
      { key: 'remove', icon: 'folderMinus', label: 'Remove from story' },
      { key: 'delete', icon: 'trash', label: 'Delete', danger: true },
    ];
    const row = (it) => {
      const color = it.danger ? 'var(--hl-danger)' : 'var(--hl-text)';
      return (
        <button key={it.key} onClick={() => onAction(it.key)} style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
          padding: '8px 11px', borderRadius: 9, border: 'none', background: 'transparent',
          color, fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 500, transition: 'background .15s',
        }}
          onMouseEnter={(e) => (e.currentTarget.style.background = it.danger ? 'color-mix(in srgb, var(--hl-danger) 14%, transparent)' : 'color-mix(in srgb, var(--hl-text) 8%, transparent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <span style={{ flexShrink: 0, display: 'flex', color: it.danger ? 'var(--hl-danger)' : 'var(--hl-muted)' }}><Icon name={it.icon} size={16} /></span>
          <span style={{ whiteSpace: 'nowrap' }}>{it.label}</span>
        </button>
      );
    };
    const main = items.filter((i) => !i.danger);
    const danger = items.filter((i) => i.danger);
    return (
      <div role="menu" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} style={{
        position: 'absolute', top: pos.top, left: pos.left, zIndex: 60, width: 212,
        background: 'color-mix(in srgb, var(--hl-surface-2) 92%, transparent)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--hl-border-strong)', borderRadius: 15, padding: 6,
        boxShadow: '0 18px 50px -12px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(0,0,0,0.3)',
        animation: 'hl-menu-in .14s cubic-bezier(.22,1,.36,1)', transformOrigin: 'top left',
      }}>
        {main.map(row)}
        <div style={{ height: 1, background: 'var(--hl-border)', margin: '6px 8px' }} />
        {danger.map(row)}
      </div>
    );
  }

  // ---- Sidebar record row (recent + chapters styles) ---------------------
  function RecordRow({ item, style, active, renaming, menuOpen, onSelect, onMenu, onCommitRename, onCancelRename }) {
    const [hov, setHov] = useState(false);
    const inputRef = useRef(null);
    useEffect(() => { if (renaming && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [renaming]);
    const showAffordance = hov || active || menuOpen || item.starred;
    const isChapters = style === 'chapters';

    const renameInput = (
      <input ref={inputRef} defaultValue={item.title}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommitRename(item.n, e.currentTarget.value); if (e.key === 'Escape') onCancelRename(); }}
        onBlur={(e) => onCommitRename(item.n, e.currentTarget.value)}
        style={{
          flex: 1, minWidth: 0, background: 'var(--hl-surface)', border: '1px solid var(--hl-accent-line)',
          borderRadius: 7, color: 'var(--hl-text)', fontFamily: isChapters ? 'var(--font-display)' : 'var(--font-body)',
          fontSize: isChapters ? 16 : 14.5, padding: '4px 7px', outline: 'none',
        }} />
    );

    const kebab = (
      <button aria-label="Story options" onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget, item); }}
        style={{
          flexShrink: 0, width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: menuOpen ? 'color-mix(in srgb, var(--hl-text) 12%, transparent)' : 'transparent',
          color: menuOpen ? 'var(--hl-text)' : 'var(--hl-muted)', opacity: (hov || menuOpen) ? 1 : 0, transition: 'opacity .15s, background .15s, color .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 12%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
        onMouseLeave={(e) => { if (!menuOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; } }}>
        <Icon name="moreVertical" size={16} />
      </button>
    );

    const starMark = item.starred ? (
      <span style={{ flexShrink: 0, display: hov || menuOpen ? 'none' : 'flex', color: 'var(--hl-accent)' }}><Icon name="star" size={13} /></span>
    ) : null;

    if (isChapters) {
      return (
        <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
          onContextMenu={(e) => { e.preventDefault(); onMenu(e.currentTarget, item); }}
          style={{ position: 'relative', display: 'flex', gap: 11, alignItems: 'center', padding: '9px 8px 9px 10px', borderRadius: 10, cursor: 'pointer',
            background: active ? 'color-mix(in srgb, var(--hl-text) 8%, transparent)' : (showAffordance && !item.starred ? 'color-mix(in srgb, var(--hl-text) 5%, transparent)' : 'transparent'),
            border: '1px solid', borderColor: active ? 'var(--hl-accent-line)' : 'transparent', transition: 'all .2s' }}
          onClick={() => !renaming && onSelect(item.n)}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1, color: 'var(--hl-accent)', opacity: 0.7, flexShrink: 0, width: 22 }}>{item.n}</span>
          {renaming ? renameInput : <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.25, color: active ? 'var(--hl-text)' : 'var(--hl-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>}
          {!renaming && starMark}
          {!renaming && kebab}
        </div>
      );
    }
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        onContextMenu={(e) => { e.preventDefault(); onMenu(e.currentTarget, item); }}
        style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'center', padding: '6px 6px 6px 9px', borderRadius: 8, cursor: 'pointer',
          background: active ? 'color-mix(in srgb, var(--hl-text) 10%, transparent)' : (showAffordance && !item.starred ? 'color-mix(in srgb, var(--hl-text) 6%, transparent)' : 'transparent'), transition: 'all .2s' }}
        onClick={() => !renaming && onSelect(item.n)}>
        {renaming ? renameInput : <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: active ? 'var(--hl-text)' : 'var(--hl-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>}
        {!renaming && starMark}
        {!renaming && kebab}
      </div>
    );
  }

  // ---- Subtle, threshold-gated search ------------------------------------
  // Stays a faint hairline until the conversation library grows past the
  // threshold (or the field is hovered/focused), then resolves into a real
  // search input. Keeps the rail uncluttered early in a story's life.
  function SearchField({ expanded, revealed, onExpand }) {
    const [val, setVal] = useState('');
    const [focus, setFocus] = useState(false);
    const [hov, setHov] = useState(false);
    const active = revealed || focus || hov || val.length > 0;
    if (!expanded) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 2px' }}>
          <button title="Search" aria-label="Search" onClick={onExpand} style={{ width: 36, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-faint)', opacity: revealed ? 0.85 : 0.4, transition: 'opacity .2s' }}>
            <Icon name="search" size={16} />
          </button>
        </div>
      );
    }
    return (
      <div style={{ padding: '2px 8px 0' }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderRadius: 10,
          background: active ? 'var(--hl-surface)' : 'transparent',
          border: '1px solid', borderColor: active ? 'var(--hl-border-strong)' : 'transparent',
          opacity: active ? 1 : 0.38, transition: 'opacity .25s, background .25s, border-color .25s',
        }}>
          <span style={{ flexShrink: 0, display: 'flex', color: active ? 'var(--hl-muted)' : 'var(--hl-faint)' }}><Icon name="search" size={15} /></span>
          <input value={val} onChange={(e) => setVal(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            placeholder="Search your story" aria-label="Search your story"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13.5 }} />
        </div>
      </div>
    );
  }

  // ---- Sidebar -----------------------------------------------------------
  function Sidebar({ expanded, setExpanded, style, activeView, onNav, convoCount, activeRecent, setActiveRecent, overlay, float, onPrompt, items, renamingId, menuForId, onRowMenu, onCommitRename, onCancelRename, stories, onOpenStory, onCreateStory, onInviteAll }) {
    const [convoOpen, setConvoOpen] = useState(true);
    const showRecent = expanded && style !== 'rail';
    const navBtn = (active) => ({
      display: 'flex', alignItems: 'center', gap: 12, borderRadius: 10,
      padding: expanded ? '9px 10px' : '9px 0', justifyContent: expanded ? 'flex-start' : 'center',
      width: expanded ? '100%' : 36, background: active ? 'color-mix(in srgb, var(--hl-text) 10%, transparent)' : 'transparent',
      border: 'none', color: active ? 'var(--hl-text)' : 'var(--hl-muted)', transition: 'all .2s', textAlign: 'left',
    });
    const floating = float !== undefined ? float : (overlay && expanded);
    const searchRevealed = convoCount >= SEARCH_THRESHOLD;
    return (
      <aside style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: 'var(--hl-bg-2)', borderRight: '1px solid var(--hl-border)',
        width: expanded ? 256 : 52, flexShrink: 0, transition: 'width .3s cubic-bezier(.4,0,.2,1)', overflow: 'hidden',
        ...(floating ? { position: 'absolute', left: 0, top: 0, zIndex: 40, boxShadow: '10px 0 50px -10px rgba(0,0,0,0.6)' } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-end' : 'center', padding: '8px 8px 4px' }}>
          <button onClick={() => setExpanded(!expanded)} aria-label="Toggle sidebar" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: 'none', color: 'var(--hl-muted)', transition: 'transform .3s', transform: expanded ? 'none' : 'rotate(180deg)' }}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <SearchField expanded={expanded} revealed={searchRevealed} onExpand={() => setExpanded(true)} />
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px 0' }}>
          {NAV.map((it) => {
            const active = it.action === 'view' && it.view === activeView;
            return (
              <button key={it.label} title={it.label} onClick={() => onNav(it)} style={navBtn(active)}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; } }}>
                <span style={{ flexShrink: 0, display: 'flex' }}><Icon name={it.icon} size={16} /></span>
                {expanded && <span style={{ fontSize: 14, fontWeight: 400, whiteSpace: 'nowrap' }}>{it.label}</span>}
              </button>
            );
          })}
          {(() => {
            const cActive = activeView === 'home';
            return (
              <div>
                <button title="Memories" onClick={() => { if (!expanded) { setExpanded(true); setConvoOpen(true); } else { setConvoOpen((o) => !o); } }}
                  style={navBtn(cActive)}
                  onMouseEnter={(e) => { if (!cActive) { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; } }}
                  onMouseLeave={(e) => { if (!cActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; } }}>
                  <span style={{ flexShrink: 0, display: 'flex' }}><Icon name="message" size={16} /></span>
                  {expanded && <span style={{ fontSize: 14, fontWeight: 400, whiteSpace: 'nowrap', flex: 1 }}>Memories</span>}
                  {expanded && <span style={{ display: 'flex', color: 'var(--hl-faint)', transition: 'transform .2s', transform: convoOpen ? 'rotate(90deg)' : 'none' }}><Icon name="chevronRight" size={14} /></span>}
                </button>
                {expanded && convoOpen && (
                  <div style={{ marginTop: 2, marginLeft: 18, paddingLeft: 8, borderLeft: '1px solid var(--hl-border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {items.length === 0
                      ? <span style={{ display: 'block', fontSize: 13, color: 'var(--hl-faint)', padding: '6px 9px', fontStyle: 'italic' }}>No loose chats</span>
                      : items.map((r) => (
                        <RecordRow key={r.n} item={r} style="recent" active={activeRecent === r.n}
                          renaming={renamingId === r.n} menuOpen={menuForId === r.n}
                          onSelect={setActiveRecent} onMenu={onRowMenu}
                          onCommitRename={onCommitRename} onCancelRename={onCancelRename} />
                      ))}
                  </div>
                )}
              </div>
            );
          })()}
        </nav>
        {showRecent && (
          <div className="scroll-area" style={{ marginTop: 22, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 26, paddingBottom: 10 }}>
            <div style={{ padding: '0 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <span style={{ color: 'var(--hl-faint)', display: 'flex' }}><Icon name="bookOpen" size={14} /></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Stories</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--hl-border)' }}>
                <button onClick={onCreateStory} title="Create a new story"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-accent)', transition: 'all .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ flexShrink: 0, display: 'flex' }}><Icon name="plus" size={15} /></span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Create</span>
                </button>
                <button onClick={onInviteAll} title="Invite collaborators"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', transition: 'all .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
                  <span style={{ flexShrink: 0, display: 'flex' }}><Icon name="userPlus" size={15} /></span>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>Invite</span>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stories.map((s) => (
                  <button key={s.id} title={s.tagline || s.name} onClick={() => onOpenStory(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 8px 8px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', transition: 'all .18s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 5%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
                    <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: 'var(--hl-accent)', opacity: 0.55 }} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 15.5, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '0 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <span style={{ color: 'var(--hl-faint)', display: 'flex' }}><Icon name="feather" size={12} /></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Writing Prompts</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => onPrompt && onPrompt(p)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '10px 11px', borderRadius: 11, background: 'transparent', border: '1px solid var(--hl-border)', color: 'var(--hl-muted)', transition: 'all .2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-soft)'; e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--hl-border)'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
                    <span style={{ flexShrink: 0, color: 'var(--hl-accent)', opacity: 0.8, marginTop: 1, display: 'flex' }}><Icon name="quote" size={13} /></span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, lineHeight: 1.3, fontStyle: 'italic' }}>{p}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>
    );
  }

  // ---- Header ------------------------------------------------------------
  function Header({ onClose, showMenu, onMenu, onShare, fullScreen, onToggleFull }) {
    const iconBtn = { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: 'none', color: 'var(--hl-muted)', transition: 'all .2s' };
    const hov = (e, on) => { e.currentTarget.style.background = on ? 'color-mix(in srgb, var(--hl-text) 8%, transparent)' : 'transparent'; e.currentTarget.style.color = on ? 'var(--hl-text)' : 'var(--hl-muted)'; };
    return (
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 52, borderBottom: '1px solid var(--hl-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {showMenu && (
            <button style={iconBtn} aria-label="Menu" onClick={onMenu} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}><Icon name="menu" size={18} /></button>
          )}
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 15.5, color: 'var(--hl-text)', background: 'transparent', border: 'none', borderRadius: 9, padding: '7px 10px', transition: 'background .2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>Your Story</span>
            <span style={{ color: 'var(--hl-muted)', display: 'flex' }}><Icon name="chevronDown" size={14} /></span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button style={iconBtn} aria-label="Share Legacy" title="Share Legacy" onClick={onShare} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}><Icon name="share" size={17} /></button>
          <button style={iconBtn} aria-label={fullScreen ? 'Exit full screen' : 'Expand to full screen'} title={fullScreen ? 'Exit full screen' : 'Full screen'} onClick={onToggleFull} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}><Icon name={fullScreen ? 'minimize' : 'maximize'} size={16} /></button>
          <button style={iconBtn} aria-label="Account" onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}><Icon name="user" size={18} /></button>
          <button style={iconBtn} aria-label="Close" onClick={onClose} onMouseEnter={(e) => hov(e, true)} onMouseLeave={(e) => hov(e, false)}><Icon name="x" size={18} /></button>
        </div>
      </header>
    );
  }

  // ---- Avatar ------------------------------------------------------------
  function GuideAvatar() {
    return (
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginTop: 2 }}>
        <Icon name="feather" size={15} />
      </div>
    );
  }

  // ---- Messages ----------------------------------------------------------
  function Bubble({ role, content }) {
    const isUser = role === 'user';
    return (
      <div style={{ display: 'flex', gap: 12, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        {!isUser && <GuideAvatar />}
        <div style={{
          maxWidth: '76%', borderRadius: 18, padding: isUser ? '11px 16px' : '4px 2px',
          fontSize: 16.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          fontFamily: isUser ? 'var(--font-body)' : 'var(--font-display)',
          fontWeight: isUser ? 400 : 400,
          background: isUser ? 'var(--hl-surface)' : 'transparent',
          color: 'var(--hl-text)',
          borderBottomRightRadius: isUser ? 5 : 18,
          borderBottomLeftRadius: isUser ? 18 : 5,
          letterSpacing: isUser ? 0 : '.005em',
        }}>
          {content}
        </div>
      </div>
    );
  }

  function Typing() {
    return (
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start' }}>
        <GuideAvatar />
        <div style={{ background: 'var(--hl-surface)', borderRadius: 18, borderBottomLeftRadius: 5, padding: '13px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hl-muted)', animation: 'hl-dot 1.2s ease-in-out infinite', animationDelay: i * 0.16 + 's' }} />
          ))}
        </div>
      </div>
    );
  }

  // small inline "saved to chapter" marker
  function SavedMark({ label }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-accent)', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', borderRadius: 99, padding: '5px 13px' }}>
          <Icon name="bookMark" size={12} /> {label}
        </span>
      </div>
    );
  }

  // ---- Empty state -------------------------------------------------------
  function EmptyState({ prompt, onPick }) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 8px', textAlign: 'center', animation: 'hl-fade .6s ease' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 26 }}>
          <Icon name="feather" size={22} />
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px,4vw,40px)', lineHeight: 1.15, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: '0 0 10px', maxWidth: 460 }}>{prompt}</h1>
        <p style={{ fontSize: 15.5, color: 'var(--hl-muted)', margin: '0 0 30px', maxWidth: 380, lineHeight: 1.55 }}>Begin anywhere. There's no wrong place to start a life.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 480 }}>
          {STARTERS.map((s) => (
            <button key={s} onClick={() => onPick(s)} style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--hl-text)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 99, padding: '9px 18px', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.background = 'var(--hl-surface-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border)'; e.currentTarget.style.background = 'var(--hl-surface)'; }}>
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Composer ----------------------------------------------------------
  const fileKind = (f) => {
    const t = (f.type || '') + ' ' + (f.name || '');
    if (/image\//.test(f.type)) return 'image';
    if (/audio\//.test(f.type)) return 'audioLines';
    return 'fileText';
  };
  const prettySize = (b) => {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  };
  const VOICE_DRAFTS = [
    "So my grandmother — she came over from Palermo in 1949, on a ship called the Saturnia.",
    "The summer I turned twelve we drove the whole coast in my father's blue Plymouth.",
    "I still remember the smell of the bakery on Arthur Avenue, before everything changed.",
  ];

  function FileChip({ file, onRemove }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px 7px 8px', background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', borderRadius: 12, maxWidth: 220 }}>
        <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}>
          <Icon name={fileKind(file)} size={15} />
        </span>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontSize: 12.5, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
          <span style={{ fontSize: 10.5, color: 'var(--hl-faint)', fontFamily: 'var(--font-mono)' }}>{prettySize(file.size)}</span>
        </span>
        <button onClick={onRemove} aria-label="Remove attachment" style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--hl-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 12%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
          <Icon name="x" size={12} />
        </button>
      </div>
    );
  }

  function VoiceBar({ onCancel, onConfirm }) {
    const [secs, setSecs] = useState(0);
    useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const bars = [0.5, 0.85, 0.35, 1, 0.6, 0.9, 0.45, 0.75, 1, 0.55, 0.8, 0.4, 0.95, 0.6, 0.7, 0.5, 0.88, 0.42, 0.66, 0.9];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '6px 6px 6px 14px' }}>
        <button onClick={onCancel} aria-label="Cancel recording" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
          <Icon name="x" size={16} />
        </button>
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--hl-accent)', animation: 'hl-recdot 1.2s ease-in-out infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--hl-text)', letterSpacing: '.05em', minWidth: 42 }}>{mm}:{ss}</span>
        </span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, height: 34, overflow: 'hidden' }}>
          {bars.map((h, i) => (
            <span key={i} style={{ flex: 1, height: '100%', maxWidth: 4, borderRadius: 4, background: 'var(--hl-accent)', opacity: 0.55, transformOrigin: 'center', transform: `scaleY(${h})`, animation: `hl-wave ${0.7 + (i % 5) * 0.12}s ease-in-out ${i * 0.05}s infinite` }} />
          ))}
        </div>
        <button onClick={onConfirm} aria-label="Finish recording" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-accent)'; }}>
          <Icon name="check" size={17} />
        </button>
      </div>
    );
  }

  function Composer({ onSend, disabled, onSaveChat, saved, composerAdd, voiceMode, onImmersive }) {
    const [value, setValue] = useState('');
    const [files, setFiles] = useState([]);
    const [recording, setRecording] = useState(false);
    const ref = useRef(null);
    const fileRef = useRef(null);
    const draftRef = useRef(0);

    const resize = () => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = Math.min(ref.current.scrollHeight, 180) + 'px'; } };
    const focus = () => { if (ref.current) { ref.current.focus(); requestAnimationFrame(resize); } };

    const send = () => {
      const t = value.trim();
      if ((!t && files.length === 0) || disabled) return;
      const tag = files.length ? files.map((f) => `[${f.name}]`).join(' ') : '';
      onSend([tag, t].filter(Boolean).join(t && tag ? '\n' : ''));
      setValue(''); setFiles([]);
      if (ref.current) ref.current.style.height = 'auto';
    };
    const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

    const addFiles = (list) => {
      const picked = Array.from(list || []).map((f) => ({ name: f.name, size: f.size, type: f.type }));
      if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, 6));
    };

    const finishVoice = () => {
      const draft = VOICE_DRAFTS[draftRef.current % VOICE_DRAFTS.length];
      draftRef.current += 1;
      setRecording(false);
      setValue((v) => (v ? v + ' ' : '') + draft);
      requestAnimationFrame(focus);
    };

    const can = (value.trim().length > 0 || files.length > 0) && !disabled;
    const iconBtn = {
      flexShrink: 0, width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center',
      justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--hl-muted)', transition: 'all .2s',
    };
    const hover = (e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; };
    const unhover = (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; };

    // Desktop "+" source menu (anchored popover — the desktop counterpart to the
    // mobile source sheet). Opens upward since the composer sits near the bottom.
    const [srcOpen, setSrcOpen] = useState(false);
    const srcRef = useRef(null);
    useEffect(() => {
      if (!srcOpen) return;
      const onDoc = (e) => { if (srcRef.current && !srcRef.current.contains(e.target)) setSrcOpen(false); };
      const onKey = (e) => { if (e.key === 'Escape') setSrcOpen(false); };
      window.addEventListener('mousedown', onDoc);
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
    }, [srcOpen]);
    const pickFiles = (accept) => { if (fileRef.current) { fileRef.current.accept = accept || ''; fileRef.current.click(); setTimeout(() => { if (fileRef.current) fileRef.current.accept = ''; }, 300); } setSrcOpen(false); };
    const SOURCES = [
      { icon: 'camera', label: 'Take a photo', onClick: () => pickFiles('image/*') },
      { icon: 'image', label: 'Photo library', onClick: () => pickFiles('image/*') },
      { icon: 'fileText', label: 'Scan a document', onClick: () => pickFiles('image/*,application/pdf') },
      { icon: 'mic', label: 'Record audio', onClick: () => { setSrcOpen(false); setRecording(true); } },
      { icon: 'folder', label: 'Browse files', onClick: () => pickFiles('') },
    ];

    return (
      <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', padding: '0 16px 16px' }}>
        <div style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 22, transition: 'border-color .2s', padding: 6 }}
          onFocusCapture={(e) => (e.currentTarget.style.borderColor = 'var(--hl-accent-line)')}
          onBlurCapture={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')}>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

          {recording ? (
            <VoiceBar onCancel={() => setRecording(false)} onConfirm={finishVoice} />
          ) : (
            <React.Fragment>
              {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 6px 8px' }}>
                  {files.map((f, i) => <FileChip key={i} file={f} onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))} />)}
                </div>
              )}
              <textarea ref={ref} value={value} rows={1} placeholder="Share a memory, or ask your guide anything" onChange={(e) => setValue(e.target.value)} onInput={resize} onKeyDown={onKey}
                style={{ display: 'block', width: '100%', background: 'transparent', color: 'var(--hl-text)', fontSize: 16, resize: 'none', border: 'none', outline: 'none', lineHeight: 1.5, padding: '10px 10px 4px', minHeight: 26, maxHeight: 180 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 2px' }}>
                {composerAdd === 'plus' ? (
                  <div style={{ position: 'relative' }} ref={srcRef}>
                    <button onClick={() => setSrcOpen((o) => !o)} aria-label="Add to your story" aria-expanded={srcOpen} title="Add to your story"
                      style={{ ...iconBtn, background: 'var(--hl-accent)', color: 'var(--hl-on-accent)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-accent)'; }}>
                      <span style={{ display: 'flex', transition: 'transform .2s', transform: srcOpen ? 'rotate(45deg)' : 'none' }}><Icon name="plus" size={20} /></span>
                    </button>
                    {srcOpen && (
                      <div role="menu" style={{ position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, width: 248, background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 16, boxShadow: '0 22px 60px -18px rgba(0,0,0,0.6)', padding: 6, zIndex: 40, animation: 'hl-menu-in .16s cubic-bezier(.22,1,.36,1)' }}>
                        {SOURCES.map((s) => (
                          <button key={s.label} role="menuitem" onClick={s.onClick}
                            style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', padding: '10px 11px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--hl-text)', transition: 'background .15s', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 7%, transparent)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            <span style={{ flexShrink: 0, display: 'flex', color: 'var(--hl-accent)' }}><Icon name={s.icon} size={18} /></span>
                            <span>{s.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <React.Fragment>
                    <button onClick={() => fileRef.current && fileRef.current.click()} aria-label="Attach files" title="Attach files" style={iconBtn} onMouseEnter={hover} onMouseLeave={unhover}>
                      <Icon name="paperclip" size={18} />
                    </button>
                    <button onClick={() => { fileRef.current && (fileRef.current.accept = 'image/*'); fileRef.current && fileRef.current.click(); setTimeout(() => { if (fileRef.current) fileRef.current.accept = ''; }, 300); }} aria-label="Add photo" title="Add a photo" style={iconBtn} onMouseEnter={hover} onMouseLeave={unhover}>
                      <Icon name="image" size={18} />
                    </button>
                  </React.Fragment>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={() => { if (voiceMode === 'immersive' && onImmersive) onImmersive(); else setRecording(true); }} aria-label="Record voice" title={voiceMode === 'immersive' ? 'Hands-free voice' : 'Record voice'} style={iconBtn} onMouseEnter={hover} onMouseLeave={unhover}>
                  <Icon name="mic" size={18} />
                </button>
                <button onClick={send} disabled={!can} aria-label="Send" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', transition: 'all .2s', background: can ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-text) 10%, transparent)', color: can ? 'var(--hl-on-accent)' : 'var(--hl-muted)', cursor: can ? 'pointer' : 'not-allowed' }}>
                  <Icon name="arrowUp" size={17} />
                </button>
              </div>
            </React.Fragment>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginTop: 14 }}>
          <button onClick={onSaveChat} disabled={saved} aria-label="Save this chat to your book"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 22px', borderRadius: 22,
              fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, letterSpacing: '.01em',
              border: '1px solid', transition: 'all .22s',
              cursor: saved ? 'default' : 'pointer',
              background: saved ? 'var(--hl-accent-soft)' : 'var(--hl-accent)',
              borderColor: saved ? 'var(--hl-accent-line)' : 'var(--hl-accent)',
              color: saved ? 'var(--hl-accent)' : 'var(--hl-on-accent)',
              boxShadow: saved ? 'none' : '0 6px 22px -8px var(--hl-shadow)',
            }}
            onMouseEnter={(e) => { if (!saved) { e.currentTarget.style.background = 'var(--hl-accent-hover)'; e.currentTarget.style.borderColor = 'var(--hl-accent-hover)'; } }}
            onMouseLeave={(e) => { if (!saved) { e.currentTarget.style.background = 'var(--hl-accent)'; e.currentTarget.style.borderColor = 'var(--hl-accent)'; } }}>
            <Icon name={saved ? 'check' : 'bookMark'} size={16} />
            {saved ? 'Saved to your book' : 'Save this chat'}
          </button>
          <p style={{ textAlign: 'center', width: '100%', fontSize: 11.5, color: 'var(--hl-faint)', margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>Your guide listens, asks, and never forgets a detail.</p>
        </div>
      </div>
    );
  }

  // ---- Immersive voice · hands-free guided voice -------------------------
  // Rendered absolute inset-0 INSIDE the chat panel's relative <section> (not
  // fixed) so it overlays the chat surface on desktop and the phone alike.
  function VoiceImmersive({ question, onCancel, onDone, onSkip }) {
    const [secs, setSecs] = useState(0);
    useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
    useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onCancel(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onCancel]);
    const mm = Math.floor(secs / 60); const ss = String(secs % 60).padStart(2, '0');
    const ctrl = { width: 54, height: 54, borderRadius: '50%', border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .18s' };
    const ctrlHov = (e, on) => { e.currentTarget.style.background = on ? 'color-mix(in srgb, var(--hl-text) 7%, transparent)' : 'transparent'; e.currentTarget.style.color = on ? 'var(--hl-text)' : 'var(--hl-muted)'; };
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 75, overflow: 'hidden', fontFamily: 'var(--font-body)', background: 'radial-gradient(ellipse at 50% 38%, var(--hl-surface-2) 0%, var(--hl-bg) 62%)', animation: 'hl-fade .25s ease' }}>
        <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px' }}>
          <button onClick={onCancel} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={20} /></button>
        </div>
        <div style={{ textAlign: 'center', padding: '6px 30px 0' }}>
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}><GuideAvatar /></div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Your guide asks</span>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 28, lineHeight: 1.22, color: 'var(--hl-text)', margin: '12px auto 0', maxWidth: 440 }}>{question}</p>
        </div>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'var(--hl-accent-soft)', animation: 'hl-orb 2.4s ease-in-out infinite' }} />
          <span style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', background: 'var(--hl-accent-soft)', animation: 'hl-orb 2.4s .4s ease-in-out infinite' }} />
          <span style={{ position: 'relative', width: 104, height: 104, borderRadius: '50%', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 40px -10px color-mix(in srgb, var(--hl-accent) 55%, transparent)' }}><Icon name="mic" size={40} /></span>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-accent)', marginBottom: 18 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--hl-danger)', animation: 'hl-recdot 1.2s ease-in-out infinite' }} />Listening · {mm}:{ss}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
            <button onClick={onCancel} aria-label="Cancel" title="Cancel" style={ctrl} onMouseEnter={(e) => ctrlHov(e, true)} onMouseLeave={(e) => ctrlHov(e, false)}><Icon name="x" size={20} /></button>
            <button onClick={onDone} aria-label="Done" title="Done" style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'var(--hl-text)', color: 'var(--hl-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 12px 30px -10px rgba(0,0,0,.5)' }}><Icon name="check" size={26} /></button>
            <button onClick={onSkip} aria-label="Skip to typing" title="Skip to typing" style={ctrl} onMouseEnter={(e) => ctrlHov(e, true)} onMouseLeave={(e) => ctrlHov(e, false)}><Icon name="audioLines" size={20} /></button>
          </div>
          <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--hl-muted)' }}>Pause · Done · Skip to typing</div>
        </div>
      </div>
    );
  }

  // ---- Invite collaborators modal ----------------------------------------
  function InviteModal({ onClose, link, expiry, onRegenerate, collaborators, context }) {
    const [copied, setCopied] = useState(false);
    const [flash, setFlash] = useState(false);
    const copyTimer = useRef(0);
    const flashTimer = useRef(0);

    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    useEffect(() => () => { clearTimeout(copyTimer.current); clearTimeout(flashTimer.current); }, []);

    const copy = async () => {
      const full = 'https://' + link;
      try { await navigator.clipboard.writeText(full); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = full; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
      }
      setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1900);
    };
    const regen = () => { onRegenerate(); setCopied(false); setFlash(true); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(false), 1500); };

    const expDate = new Date(expiry);
    const expLabel = 'Expires in 7 days · ' + expDate.toLocaleString('en-US', { month: 'short' }) + ' ' + expDate.getDate();
    const joinedCount = collaborators.filter((c) => c.status === 'joined').length;

    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };

    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Invite collaborators" style={{
          position: 'relative', width: 'min(462px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20,
          boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 0.5px rgba(0,0,0,0.4)',
          padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)',
        }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', transition: 'all .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="x" size={18} />
          </button>

          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 16 }}>
            <Icon name="userPlus" size={21} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27, lineHeight: 1.1, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Invite collaborators</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>
            {context
              ? <React.Fragment>Bring the people who shared <span style={{ color: 'var(--hl-text)', fontStyle: 'italic', fontFamily: 'var(--font-display)', fontSize: 16 }}>"{context}"</span> into the book. Anyone with this private link can join and add their memories in their own voice.</React.Fragment>
              : 'Bring the people who lived these stories alongside you. Anyone with this private link can join your book and add their memories in their own voice.'}
          </p>

          <div style={{ marginTop: 22 }}>
            <div style={sectionLabel}>Magic link</div>
            <div key={link} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, padding: '6px 6px 6px 13px', background: 'var(--hl-surface-2)', border: '1px solid', borderColor: flash ? 'var(--hl-accent-line)' : 'var(--hl-border)', borderRadius: 13, transition: 'border-color .3s', animation: flash ? 'hl-fade .35s ease' : 'none' }}>
              <span style={{ flexShrink: 0, display: 'flex', color: 'var(--hl-accent)' }}><Icon name="link" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '.01em' }}>{link}</span>
              <button onClick={copy} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 15px', borderRadius: 9, border: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, background: copied ? 'var(--hl-accent-soft)' : 'var(--hl-accent)', color: copied ? 'var(--hl-accent)' : 'var(--hl-on-accent)', transition: 'all .2s' }}
                onMouseEnter={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
                onMouseLeave={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent)'; }}>
                <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 11 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--hl-faint)', letterSpacing: '.02em' }}>
                <Icon name="clock" size={12} /> {expLabel}
              </span>
              <button onClick={regen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, color: 'var(--hl-muted)', transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-accent)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                <Icon name="refresh" size={13} /> Reset link
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--hl-border)', margin: '20px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
            <span style={sectionLabel}>Already invited</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)' }}>{joinedCount} joined · {collaborators.length - joinedCount} pending</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {collaborators.map((c, i) => {
              const joined = c.status === 'joined';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--hl-accent)' }}>{initials(c.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                    <span style={{ fontSize: 14.5, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--hl-faint)' }}>{c.rel}</span>
                  </span>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', background: joined ? 'var(--hl-accent-soft)' : 'color-mix(in srgb, var(--hl-text) 7%, transparent)', color: joined ? 'var(--hl-accent)' : 'var(--hl-muted)', border: '1px solid', borderColor: joined ? 'var(--hl-accent-line)' : 'transparent' }}>
                    {joined && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--hl-accent)' }} />}{c.status}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--hl-border)' }}>
            <span style={{ flexShrink: 0, display: 'flex', color: 'var(--hl-faint)', marginTop: 1 }}><Icon name="shield" size={13} /></span>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--hl-faint)', textWrap: 'pretty' }}>You stay the author. Collaborators can read and add their own memories — they can never edit or overwrite yours.</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Create story modal ------------------------------------------------
  function CreateStoryModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const canCreate = name.trim().length > 0;
    const submit = () => { if (canCreate) onCreate(name.trim(), desc.trim()); };
    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const field = { width: '100%', marginTop: 9, padding: '11px 13px', background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', borderRadius: 12, color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14.5, outline: 'none', transition: 'border-color .2s' };
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create a story" style={{ position: 'relative', width: 'min(462px, 100%)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 0.5px rgba(0,0,0,0.4)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', transition: 'all .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="x" size={18} />
          </button>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 16 }}>
            <Icon name="bookOpen" size={21} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27, lineHeight: 1.1, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Begin a new story</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>Give it a name and a line about what it holds. The description appears when you hover the story later.</p>
          <div style={{ marginTop: 22 }}>
            <div style={sectionLabel}>Name</div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="e.g. A Life in Full" style={field}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hl-accent-line)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')} />
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={sectionLabel}>Description <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-body)', color: 'var(--hl-faint)' }}>&middot; optional, shown on hover</span></div>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="The long arc &mdash; childhood to now." style={{ ...field, resize: 'none', lineHeight: 1.5 }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hl-accent-line)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hl-border)')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Cancel</button>
            <button onClick={submit} disabled={!canCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 11, border: '1px solid', borderColor: canCreate ? 'var(--hl-accent)' : 'var(--hl-border)', background: canCreate ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-text) 8%, transparent)', color: canCreate ? 'var(--hl-on-accent)' : 'var(--hl-faint)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, cursor: canCreate ? 'pointer' : 'not-allowed', transition: 'all .2s' }}
              onMouseEnter={(e) => { if (canCreate) e.currentTarget.style.background = 'var(--hl-accent-hover)'; }} onMouseLeave={(e) => { if (canCreate) e.currentTarget.style.background = 'var(--hl-accent)'; }}>
              <Icon name="plus" size={15} /> Create story
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Delete confirmation dialog ----------------------------------------
  // Destructive-action guard. Mirrors the modal vocabulary (CreateStoryModal)
  // but in a danger key: trash glyph, red confirm, Cancel auto-focused so a
  // stray Enter cancels rather than deletes. Esc closes.
  function ConfirmDeleteModal({ item, onClose, onConfirm }) {
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const dangerSoft = 'color-mix(in srgb, var(--hl-danger) 14%, transparent)';
    const dangerLine = 'color-mix(in srgb, var(--hl-danger) 34%, transparent)';
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="Delete chat" style={{ position: 'relative', width: 'min(418px, 100%)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20, boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 0.5px rgba(0,0,0,0.4)', padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: dangerSoft, border: '1px solid ' + dangerLine, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-danger)', marginBottom: 16 }}>
            <Icon name="trash" size={20} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, lineHeight: 1.12, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Delete this chat?</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px 0 0', textWrap: 'pretty' }}>
            <span style={{ color: 'var(--hl-text)', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16 }}>&ldquo;{item.title}&rdquo;</span> and every memory it holds will be permanently removed. This can&rsquo;t be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button autoFocus onClick={onClose} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Cancel</button>
            <button onClick={onConfirm} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 11, border: '1px solid var(--hl-danger)', background: 'var(--hl-danger)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-danger) 86%, #000)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-danger)'; }}>
              <Icon name="trash" size={15} /> Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Share Legacy modal ----------------------------------------------
  function ShareModal({ onClose }) {
    const [copied, setCopied] = useState(false);
    const [native, setNative] = useState(false);
    const copyTimer = useRef(0);

    useEffect(() => {
      setNative(typeof navigator !== 'undefined' && !!navigator.share);
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('keydown', onKey); clearTimeout(copyTimer.current); };
    }, [onClose]);

    const openIntent = (ch) => { try { window.open(ch.href(SHARE_URL, SHARE_MSG), '_blank', 'noopener,noreferrer'); } catch (e) {} };
    const copy = async () => {
      try { await navigator.clipboard.writeText(SHARE_URL); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = SHARE_URL; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
      }
      setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1900);
    };
    const shareNative = async () => { try { await navigator.share({ title: 'Legacy', text: SHARE_MSG, url: SHARE_URL }); } catch (e) {} };

    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const cleanUrl = SHARE_URL.replace(/^https?:\/\//, '');

    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', animation: 'hl-fade .2s ease' }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share Legacy" style={{
          position: 'relative', width: 'min(440px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 20,
          boxShadow: '0 40px 100px -24px rgba(0,0,0,0.75), 0 0 0 0.5px rgba(0,0,0,0.4)',
          padding: '28px 28px 24px', animation: 'hl-modal-in .26s cubic-bezier(.22,1,.36,1)', textAlign: 'center',
        }}>
          <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--hl-muted)', transition: 'all .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="x" size={18} />
          </button>

          <div style={{ width: 50, height: 50, margin: '0 auto 16px', borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
            <Icon name="share" size={22} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27, lineHeight: 1.1, letterSpacing: '-.01em', color: 'var(--hl-text)', margin: 0 }}>Share Legacy</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '9px auto 0', maxWidth: 340, textWrap: 'pretty' }}>Know someone with a story worth keeping? Pass it on. Every share helps another life become a book.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 24 }}>
            {SHARE_CHANNELS.map((ch) => (
              <button key={ch.key} onClick={() => openIntent(ch)} aria-label={'Share on ' + ch.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 4px 11px', borderRadius: 14,
                background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', transition: 'all .2s', cursor: 'pointer',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border)'; e.currentTarget.style.background = 'var(--hl-surface-2)'; e.currentTarget.style.transform = 'none'; }}>
                <span style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-text)' }}>
                  {ch.icon ? <Icon name={ch.icon} size={19} /> : <span style={{ fontFamily: ch.key === 'x' ? 'var(--font-body)' : 'var(--font-display)', fontWeight: 700, fontSize: ch.key === 'li' ? 16 : 20, lineHeight: 1 }}>{ch.glyph}</span>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--hl-muted)', fontWeight: 500 }}>{ch.label}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 20, textAlign: 'left' }}>
            <div style={sectionLabel}>Or copy the link</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, padding: '6px 6px 6px 13px', background: 'var(--hl-surface-2)', border: '1px solid var(--hl-border)', borderRadius: 13 }}>
              <span style={{ flexShrink: 0, display: 'flex', color: 'var(--hl-accent)' }}><Icon name="link" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanUrl}</span>
              <button onClick={copy} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 15px', borderRadius: 9, border: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, background: copied ? 'var(--hl-accent-soft)' : 'var(--hl-accent)', color: copied ? 'var(--hl-accent)' : 'var(--hl-on-accent)', transition: 'all .2s' }}
                onMouseEnter={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
                onMouseLeave={(e) => { if (!copied) e.currentTarget.style.background = 'var(--hl-accent)'; }}>
                <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {native && (
            <button onClick={shareNative} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, padding: '12px', borderRadius: 12, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.background = 'transparent'; }}>
              <Icon name="share" size={16} /> More ways to share…
            </button>
          )}

          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 7, margin: '22px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>
            <span style={{ display: 'flex', color: 'var(--hl-accent)' }}><Icon name="heart" size={12} /></span> Made to be passed down
          </p>
        </div>
      </div>
    );
  }

  // ---- View chrome (shared by the non-chat main views) ------------------
  function ViewHead({ eyebrow, title, sub }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)', marginBottom: 12 }}>{eyebrow}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px,3.4vw,44px)', lineHeight: 1.04, letterSpacing: '-.015em', color: 'var(--hl-text)', margin: 0 }}>{title}</h1>
        {sub && <p style={{ fontSize: 15.5, color: 'var(--hl-muted)', margin: '11px 0 0', maxWidth: 520, lineHeight: 1.55, textWrap: 'pretty' }}>{sub}</p>}
      </div>
    );
  }

  function AvatarStack({ people, size = 28 }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {people.slice(0, 4).map((c, i) => (
          <span key={i} title={c.name} style={{ width: size, height: size, marginLeft: i ? -9 : 0, borderRadius: '50%', background: 'var(--hl-surface-2)', border: '1.5px solid var(--hl-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: size * 0.42, fontWeight: 600, color: 'var(--hl-accent)', position: 'relative', zIndex: 4 - i }}>{initials(c.name)}</span>
        ))}
      </div>
    );
  }

  // ---- Stories: list ----------------------------------------------------
  function StoriesList({ stories, onOpen, onNewStory }) {
    const [hov, setHov] = useState(null);
    const card = (s) => {
      const lifted = hov === s.id;
      return (
        <button key={s.id} onClick={() => onOpen(s.id)} onMouseEnter={() => setHov(s.id)} onMouseLeave={() => setHov(null)}
          style={{ position: 'relative', textAlign: 'left', display: 'flex', gap: 16, padding: '20px 20px 18px', borderRadius: 16, background: 'var(--hl-surface)', border: '1px solid', borderColor: lifted ? 'var(--hl-accent-line)' : 'var(--hl-border)', transition: 'all .22s', transform: lifted ? 'translateY(-3px)' : 'none', boxShadow: lifted ? '0 18px 40px -22px rgba(0,0,0,0.7)' : 'none', overflow: 'hidden' }}>
          <span aria-hidden="true" style={{ flexShrink: 0, width: 8, alignSelf: 'stretch', borderRadius: 5, background: 'linear-gradient(var(--hl-accent), var(--hl-accent-hover))', opacity: lifted ? 0.95 : 0.65, transition: 'opacity .22s' }} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 23, lineHeight: 1.15, color: 'var(--hl-text)', letterSpacing: '-.01em' }}>{s.name}</span>
            <span style={{ fontSize: 14, color: 'var(--hl-muted)', margin: '5px 0 16px', fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>{s.tagline}</span>
            <span style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--hl-faint)' }}>{s.chapters.length} chapters &middot; {s.collaborators.length} {s.collaborators.length === 1 ? 'collaborator' : 'collaborators'}</span>
              <AvatarStack people={s.collaborators} size={26} />
            </span>
          </span>
        </button>
      );
    };
    return (
      <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '34px clamp(20px,5vw,56px) 40px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <ViewHead eyebrow="Your library" title="Stories" sub="Each story is a book in the making — its own chapters, its own circle of people. Open one to keep writing, or begin a new one." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {stories.map(card)}
            <button onClick={onNewStory} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 150, padding: 20, borderRadius: 16, background: 'transparent', border: '1px dashed var(--hl-border-strong)', color: 'var(--hl-muted)', transition: 'all .22s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.color = 'var(--hl-accent)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.background = 'transparent'; }}>
              <Icon name="plusCircle" size={24} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Begin a new story</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Stories: a single story (name, chapters, invite, create) ---------
  function StoryDetail({ story, onBack, onInvite, onCreate }) {
    const joined = story.collaborators.filter((c) => c.status === 'joined').length;
    const back = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 500, transition: 'all .2s' };
    return (
      <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px clamp(20px,5vw,56px) 44px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <button onClick={onBack} style={back} onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 7%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
            <Icon name="arrowLeft" size={15} /> All stories
          </button>

          <div style={{ marginTop: 20, paddingBottom: 26, borderBottom: '1px solid var(--hl-border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)', marginBottom: 12 }}>Story</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(34px,4.4vw,52px)', lineHeight: 1.02, letterSpacing: '-.02em', color: 'var(--hl-text)', margin: 0 }}>{story.name}</h1>
            <p style={{ fontSize: 16, color: 'var(--hl-muted)', margin: '12px 0 22px', fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>{story.tagline}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <button onClick={onCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 20px', borderRadius: 12, border: '1px solid var(--hl-accent)', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, transition: 'all .2s', boxShadow: '0 6px 22px -8px var(--hl-shadow)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-hover)'; e.currentTarget.style.borderColor = 'var(--hl-accent-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-accent)'; e.currentTarget.style.borderColor = 'var(--hl-accent)'; }}>
                <Icon name="edit" size={16} /> Create &mdash; start a new chat
              </button>
              <button onClick={onInvite} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 18px', borderRadius: 12, border: '1px solid var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.background = 'transparent'; }}>
                <Icon name="userPlus" size={16} /> Invite collaborators
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                <AvatarStack people={story.collaborators} size={28} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-faint)' }}>{joined} joined &middot; {story.collaborators.length - joined} pending</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
              <span style={{ color: 'var(--hl-faint)', display: 'flex' }}><Icon name="bookOpen" size={13} /></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Chapters</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {story.chapters.map((ch) => (
                <button key={ch.n} onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', padding: '13px 14px', borderRadius: 12, background: 'transparent', border: '1px solid transparent', transition: 'all .18s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-surface)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, color: 'var(--hl-accent)', opacity: 0.7, flexShrink: 0, width: 30 }}>{ch.n}</span>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--hl-text)' }}>{ch.title}</span>
                  <span style={{ flexShrink: 0, color: 'var(--hl-faint)', display: 'flex' }}><Icon name="chevronRight" size={16} /></span>
                </button>
              ))}
              <button onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', marginTop: 4, borderRadius: 12, background: 'transparent', border: '1px dashed var(--hl-border-strong)', color: 'var(--hl-muted)', transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.color = 'var(--hl-accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
                <Icon name="plus" size={16} /> <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>New chapter</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function StoriesView({ stories, sel, setSel, onInvite, onCreate, onNewStory }) {
    const story = sel ? stories.find((s) => s.id === sel) : null;
    if (story) return <StoryDetail story={story} onBack={() => setSel(null)} onInvite={() => onInvite(story)} onCreate={() => onCreate(story)} />;
    return <StoriesList stories={stories} onOpen={setSel} onNewStory={onNewStory} />;
  }

  // ---- Uploads ----------------------------------------------------------
  function UploadsView({ onAdd }) {
    const tile = (u, i) => {
      if (u.kind === 'image') {
        return (
          <div key={i} style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
            <div style={{ aspectRatio: '4 / 3', position: 'relative', background: `repeating-linear-gradient(135deg, color-mix(in srgb, var(--hl-accent) 10%, var(--hl-surface-2)) 0 11px, var(--hl-surface-2) 11px 22px)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>photograph</span>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 13, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)', marginTop: 3 }}>{u.meta}</div>
            </div>
          </div>
        );
      }
      return (
        <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: 14, borderRadius: 14, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
          <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon name={u.kind} size={20} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
            <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--hl-faint)', marginTop: 3 }}>{u.meta}</span>
          </span>
        </div>
      );
    };
    return (
      <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '34px clamp(20px,5vw,56px) 40px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <ViewHead eyebrow="Gathered" title="Uploads" sub="Photographs, voice notes, and letters you’ve added along the way. Drop anything here and your guide will weave it into the right chapter." />
          <button onClick={onAdd} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, width: '100%', padding: '18px', borderRadius: 14, border: '1px dashed var(--hl-border-strong)', background: 'transparent', color: 'var(--hl-muted)', marginBottom: 22, transition: 'all .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; e.currentTarget.style.color = 'var(--hl-accent)'; e.currentTarget.style.background = 'var(--hl-accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.background = 'transparent'; }}>
            <Icon name="upload" size={18} /> <span style={{ fontSize: 14.5, fontWeight: 600 }}>Add photos, audio, or documents</span>
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {UPLOADS.map(tile)}
          </div>
        </div>
      </div>
    );
  }

  // ---- Writing Prompts (dedicated browse view) --------------------------
  function PromptsView({ onPick }) {
    return (
      <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '34px clamp(20px,5vw,56px) 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <ViewHead eyebrow="A way in" title="Writing Prompts" sub="When you don’t know where to begin, begin here. Pick a thread and your guide will follow it with you." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
            {PROMPTS_ALL.map((p, i) => (
              <button key={i} onClick={() => onPick(p)} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left', padding: '18px 20px', borderRadius: 14, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', color: 'var(--hl-text)', transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-soft)'; e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hl-surface)'; e.currentTarget.style.borderColor = 'var(--hl-border)'; }}>
                <span style={{ flexShrink: 0, color: 'var(--hl-accent)', opacity: 0.85, marginTop: 2, display: 'flex' }}><Icon name="quote" size={16} /></span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, lineHeight: 1.3, fontStyle: 'italic' }}>{p}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Panel -------------------------------------------------------------
  function ChatPanel({ onClose, emptyPrompt, navMode, coachRule, composerAdd, voiceMode, fullScreen, onToggleFull }) {
    const sectionRef = useRef(null);
    const [narrow, setNarrow] = useState(false);
    const mode = navMode || 'dock';
    const [expanded, setExpanded] = useState(true);
    const [navOpen, setNavOpen] = useState(false);   // floating sidebar (hover / drawer / peek modes)
    const [coach, setCoach] = useState(false);       // peek coachmark visibility
    const [armKey, setArmKey] = useState(0);         // bump to re-arm (load / new chat / mode change)
    const coachTimer = useRef(0);
    const navOpenRef = useRef(false);
    const hoverTimer = useRef(0);
    const [activeRecent, setActiveRecent] = useState(null);
    const [view, setView] = useState('home');   // home | stories | uploads | prompts
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [savedChat, setSavedChat] = useState(false);
    const [items, setItems] = useState(() => RECENT.map((r) => ({ ...r, starred: false })));
    const [stories, setStories] = useState(() => STORIES.map((s) => ({ ...s })));
    const [storySel, setStorySel] = useState(null);
    const [createStory, setCreateStory] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);   // item pending deletion
    const [menu, setMenu] = useState(null);          // { n, top, left }
    const [renamingId, setRenamingId] = useState(null);
    const [toast, setToast] = useState(null);
    const [invite, setInvite] = useState(null);
    const [share, setShare] = useState(false);
    const [immersive, setImmersive] = useState(false);
    const IMMERSIVE_Q = "Tell me about the house — what's the first thing you remember?";
    const [inviteLink, setInviteLink] = useState(() => LINK_BASE + makeToken());
    const [inviteExpiry, setInviteExpiry] = useState(() => Date.now() + 7 * 864e5);
    const toastRef = useRef(0);
    const turnRef = useRef(0);
    const bottomRef = useRef(null);

    // Width-based responsiveness: react to the PANEL's own width, not the
    // window — so it adapts in the desktop right-panel, the mobile bezel, and
    // any test container alike.
    useEffect(() => {
      const el = sectionRef.current;
      if (!el) return;
      const measure = (w) => setNarrow(w < 620);
      measure(el.getBoundingClientRect().width); // immediate, in case RO lags
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(([e]) => measure(e.contentRect.width));
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // On narrow widths the sidebar starts collapsed (it opens as an overlay).
    useEffect(() => { setExpanded(!narrow); }, [narrow]);
    useEffect(() => { setNavOpen(false); setArmKey((k) => k + 1); }, [mode]);
    useEffect(() => { navOpenRef.current = navOpen; }, [navOpen]);

    // ---- Peek coachmark: WHEN to fire -------------------------------------
    // rule: 'off' | 'every' | 'session' | 'first-use'. Every rule shares an
    // "idle" firing moment — the tip only appears if the menu hasn't been
    // opened within COACH_DELAY of arming, so people who find it on their own
    // never get nagged.
    const COACH_DELAY = 2800;
    const cRule = coachRule || 'first-use';
    const coachLearned = () => { try { localStorage.setItem('hl.peekCoachUsed', '1'); } catch (e) {} };
    const coachAllowed = () => {
      if (mode !== 'peek' || cRule === 'off') return false;
      try {
        if (cRule === 'first-use') return localStorage.getItem('hl.peekCoachUsed') !== '1';
        if (cRule === 'session') return sessionStorage.getItem('hl.peekCoachSession') !== '1';
      } catch (e) { return true; }
      return true; // 'every'
    };
    // Arm on load / new chat / mode or rule change.
    useEffect(() => {
      setCoach(false);
      clearTimeout(coachTimer.current);
      if (!coachAllowed()) return;
      coachTimer.current = setTimeout(() => {
        if (navOpenRef.current) return;                 // they already opened it
        setCoach(true);
        if (cRule === 'session') { try { sessionStorage.setItem('hl.peekCoachSession', '1'); } catch (e) {} }
      }, COACH_DELAY);
      return () => clearTimeout(coachTimer.current);
    }, [armKey, mode, cRule]);
    // Auto-dismiss once shown.
    useEffect(() => {
      if (!coach) return;
      const id = setTimeout(() => setCoach(false), 6500);
      return () => clearTimeout(id);
    }, [coach]);
    useEffect(() => { bottomRef.current && bottomRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

    const newChat = () => { setMessages([]); setLoading(false); turnRef.current = 0; setActiveRecent(null); setSavedChat(false); setView('home'); setArmKey((k) => k + 1); };

    // Floating-nav visibility (hover / drawer / peek). Dock mode ignores these.
    const openNav = () => { clearTimeout(hoverTimer.current); setCoach(false); coachLearned(); setNavOpen(true); };
    const closeNav = () => { clearTimeout(hoverTimer.current); setNavOpen(false); };
    const deferClose = () => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setNavOpen(false), 160); };

    // Route a nav click. View items swap the main pane; New Chat resets the
    // conversation; Share opens the modal.
    const onNav = (it) => {
      if (narrow) setExpanded(false);
      if (mode !== 'dock') setNavOpen(false);
      if (it.action === 'new') return newChat();
      if (it.action === 'share') return setShare(true);
      if (it.action === 'view') return setView(it.view);
    };
    // A story's Create action launches a fresh chat in that story's context.
    const startStoryChat = (story) => { newChat(); if (story) showToast('New chat \u00b7 ' + story.name); };

    // ---- record menu ----
    const showToast = (msg) => { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(null), 2200); };
    // Opening a story shows its detail (chapters + collaborators) in the main pane.
    const openStoryDetail = (id) => { setStorySel(id); setView('stories'); if (narrow) setExpanded(false); };
    // Create-story modal → append a new story; its description becomes the hover tagline.
    const addStory = (name, description) => {
      const id = 'sx' + Date.now();
      setStories((arr) => [...arr, { id, name, tagline: description || '', chapters: [], collaborators: [] }]);
      setCreateStory(false);
      showToast('Story created');
    };
    const openRowMenu = (anchorEl, item) => {
      const sect = sectionRef.current; if (!sect) return;
      const a = anchorEl.getBoundingClientRect();
      const s = sect.getBoundingClientRect();
      const MENU_W = 212, MENU_H = 300, GAP = 5;
      let left = a.right - s.left - MENU_W + 8;             // right-align under the kebab
      left = Math.max(8, Math.min(left, s.width - MENU_W - 8));
      let top = a.bottom - s.top + GAP;
      if (top + MENU_H > s.height - 8) top = a.top - s.top - MENU_H - GAP;   // flip up if needed
      top = Math.max(8, top);
      setMenu({ n: item.n, top, left });
    };
    const closeMenu = () => setMenu(null);
    const menuItem = menu ? items.find((i) => i.n === menu.n) : null;
    const openInvite = (item) => setInvite({ context: item ? item.title : null });
    const regenerateLink = () => { setInviteLink(LINK_BASE + makeToken()); setInviteExpiry(Date.now() + 7 * 864e5); };
    const onMenuAction = (key) => {
      const it = menuItem; if (!it) return;
      closeMenu();
      if (key === 'star') { setItems((arr) => arr.map((x) => x.n === it.n ? { ...x, starred: !x.starred } : x)); showToast(it.starred ? 'Star removed' : 'Starred'); }
      else if (key === 'rename') { setRenamingId(it.n); }
      else if (key === 'invite') { openInvite(it); }
      else if (key === 'move') { showToast('Moved to another story'); }
      else if (key === 'remove') { showToast('Removed from story'); }
      else if (key === 'delete') { setConfirmDelete(it); }   // confirm before destroying
    };
    // Actually remove the chat once the user confirms in the dialog.
    const doDelete = () => {
      const it = confirmDelete; if (!it) return;
      setItems((arr) => arr.filter((x) => x.n !== it.n));
      if (activeRecent === it.n) setActiveRecent(null);
      setConfirmDelete(null);
      showToast('Chat deleted');
    };
    const commitRename = (n, title) => { const t = (title || '').trim(); if (t) setItems((arr) => arr.map((x) => x.n === n ? { ...x, title: t } : x)); setRenamingId(null); };

    useEffect(() => {
      if (!menu) return;
      const close = () => setMenu(null);
      const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey); };
    }, [menu]);

    const send = (text) => {
      setMessages((m) => [...m, { id: uid(), role: 'user', content: text }]);
      setLoading(true);
      const idx = Math.min(turnRef.current, GUIDE_TURNS.length - 1);
      const reply = GUIDE_TURNS[idx];
      const isSaveTurn = idx === GUIDE_TURNS.length - 1;
      turnRef.current += 1;
      setTimeout(() => {
        setLoading(false);
        setMessages((m) => {
          const next = [...m];
          if (isSaveTurn) next.push({ id: uid(), role: 'saved', content: 'Saved to Chapter One' });
          next.push({ id: uid(), role: 'assistant', content: reply });
          return next;
        });
      }, 1100 + Math.random() * 500);
    };

    const started = messages.length > 0;

    const SCRIM = { position: 'absolute', inset: 0, zIndex: 35, background: 'rgba(0,0,0,0.45)' };
    // Shared Sidebar props. `over` = rendered as the full floating panel.
    const sbProps = (over) => ({
      style: over ? 'labeled' : (mode === 'hover' ? 'rail' : 'labeled'),
      activeView: view, onNav, convoCount: items.length,
      activeRecent, setActiveRecent: (n) => { setActiveRecent(n); setView('home'); },
      overlay: narrow,
      onPrompt: (p) => { setView('home'); send(p); setNavOpen(false); if (narrow) setExpanded(false); },
      items, renamingId, menuForId: menu ? menu.n : null, onRowMenu: openRowMenu,
      onCommitRename: commitRename, onCancelRename: () => setRenamingId(null),
      stories, onOpenStory: openStoryDetail, onCreateStory: () => setCreateStory(true), onInviteAll: () => openInvite(null),
    });

    return (
      <section ref={sectionRef} style={{ height: '100%', display: 'flex', background: 'var(--hl-bg)', overflow: 'hidden', position: 'relative' }}>
        {/* DOCK — persistent sidebar that pushes the conversation aside (overlay on narrow). */}
        {mode === 'dock' && (
          <React.Fragment>
            <Sidebar {...sbProps(false)} expanded={expanded} setExpanded={setExpanded} float={narrow && expanded} />
            {narrow && expanded && <div onClick={() => setExpanded(false)} style={SCRIM} />}
          </React.Fragment>
        )}

        {/* HOVER — a slim icon rail stays docked; the full panel floats out on hover/tap. */}
        {mode === 'hover' && (
          <div onMouseLeave={!narrow ? deferClose : undefined} style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
            <div onMouseEnter={!narrow ? openNav : undefined} style={{ display: 'flex' }}>
              <Sidebar {...sbProps(false)} expanded={false} setExpanded={(v) => v ? openNav() : closeNav()} float={false} />
            </div>
            {navOpen && (
              <div onMouseEnter={openNav} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 40 }}>
                <Sidebar {...sbProps(true)} expanded={true} setExpanded={(v) => { if (!v) closeNav(); }} float={true} />
              </div>
            )}
          </div>
        )}

        {/* DRAWER — nav fully hidden; opens as an overlay from the header menu button. */}
        {mode === 'drawer' && navOpen && (
          <React.Fragment>
            <div onClick={closeNav} style={SCRIM} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 40 }}>
              <Sidebar {...sbProps(true)} expanded={true} setExpanded={(v) => { if (!v) closeNav(); }} float={true} />
            </div>
          </React.Fragment>
        )}

        {/* PEEK — nav hidden behind a slim edge handle; hover (desktop) or tap reveals it. */}
        {mode === 'peek' && (
          <React.Fragment>
            {!navOpen && (
              <button onMouseEnter={!narrow ? openNav : undefined} onClick={openNav} aria-label="Open menu" title="Menu"
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, zIndex: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <span style={{ width: 5, height: 52, borderRadius: 99, background: 'var(--hl-accent)', opacity: 0.55, animation: coach ? 'hl-edgepulse 1.5s ease-in-out infinite' : 'none' }} />
              </button>
            )}
            {!navOpen && coach && (
              <div style={{ position: 'absolute', left: 22, top: '50%', zIndex: 37, width: 232, transform: 'translateY(-50%)', animation: 'hl-coach-in .42s cubic-bezier(.22,1,.36,1)' }}>
                <div style={{ position: 'absolute', left: -7, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderRight: '7px solid var(--hl-surface)' }} />
                <div style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 14, padding: '13px 15px 12px', boxShadow: '0 18px 44px -16px rgba(0,0,0,0.55)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--hl-accent)', marginBottom: 6 }}>One thing</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 19, lineHeight: 1.2, color: 'var(--hl-text)', marginBottom: 5 }}>Your menu hides here.</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--hl-muted)' }}>Tap the edge anytime — stories, prompts, search, all of it.</div>
                  <button onClick={() => { setCoach(false); coachLearned(); }} style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--hl-muted)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hl-text)'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hl-muted)'; }}>Got it</button>
                </div>
              </div>
            )}
            {navOpen && (
              <React.Fragment>
                <div onClick={closeNav} style={SCRIM} />
                <div onMouseLeave={!narrow ? deferClose : undefined} onMouseEnter={openNav} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 40 }}>
                  <Sidebar {...sbProps(true)} expanded={true} setExpanded={(v) => { if (!v) closeNav(); }} float={true} />
                </div>
              </React.Fragment>
            )}
          </React.Fragment>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%' }}>
          <Header onClose={onClose} showMenu={mode === 'drawer' || (mode === 'dock' && narrow)} onMenu={() => mode === 'drawer' ? openNav() : setExpanded(true)} onShare={() => setShare(true)} fullScreen={fullScreen} onToggleFull={onToggleFull} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {view === 'stories' ? (
              <StoriesView stories={stories} sel={storySel} setSel={setStorySel} onInvite={(s) => openInvite(s ? { title: s.name } : null)} onCreate={startStoryChat} onNewStory={() => setCreateStory(true)} />
            ) : view === 'uploads' ? (
              <UploadsView onAdd={() => showToast('Choose files to upload')} />
            ) : view === 'prompts' ? (
              <PromptsView onPick={(p) => { setView('home'); send(p); }} />
            ) : (
              <React.Fragment>
                {started ? (
                  <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: narrow ? '20px 12px 8px' : '28px 16px 8px' }}>
                    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
                      {messages.map((m) => m.role === 'saved'
                        ? <SavedMark key={m.id} label={m.content} />
                        : <Bubble key={m.id} role={m.role} content={m.content} />)}
                      {loading && <Typing />}
                      <div ref={bottomRef} />
                    </div>
                  </div>
                ) : (
                  <EmptyState prompt={emptyPrompt} onPick={send} />
                )}
                <div style={{ paddingTop: 6 }}>
                  <Composer onSend={(t) => { setSavedChat(false); send(t); }} disabled={loading} onSaveChat={() => setSavedChat(true)} saved={savedChat} composerAdd={composerAdd} voiceMode={voiceMode} onImmersive={() => setImmersive(true)} />
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
        {menu && menuItem && (
          <React.Fragment>
            <div onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} style={{ position: 'absolute', inset: 0, zIndex: 55 }} />
            <RecordMenu pos={menu} item={menuItem} onAction={onMenuAction} />
          </React.Fragment>
        )}
        {toast && (
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 65, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 15px', borderRadius: 99, background: 'color-mix(in srgb, var(--hl-surface-2) 94%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--hl-border-strong)', boxShadow: '0 12px 36px -10px rgba(0,0,0,0.6)', fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--hl-text)', animation: 'hl-toast-in .22s cubic-bezier(.22,1,.36,1)', pointerEvents: 'none' }}>
            <span style={{ display: 'flex', color: 'var(--hl-accent)' }}><Icon name="check" size={13} /></span>{toast}
          </div>
        )}
        {invite && (
          <InviteModal onClose={() => setInvite(null)} link={inviteLink} expiry={inviteExpiry} onRegenerate={regenerateLink} collaborators={SEED_COLLABS} context={invite.context} />
        )}
        {share && <ShareModal onClose={() => setShare(false)} />}
        {createStory && <CreateStoryModal onClose={() => setCreateStory(false)} onCreate={addStory} />}
        {confirmDelete && <ConfirmDeleteModal item={confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={doDelete} />}
        {immersive && (
          <VoiceImmersive question={IMMERSIVE_Q}
            onCancel={() => setImmersive(false)}
            onDone={() => { setImmersive(false); setSavedChat(false); send(VOICE_DRAFTS[Math.floor(Math.random() * VOICE_DRAFTS.length)]); }}
            onSkip={() => setImmersive(false)} />
        )}
      </section>
    );
  }

  window.ChatPanel = ChatPanel;
})();
