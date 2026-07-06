/* ────────────────────────────────────────────────────────────────────────
   Legacy — "Start Your Story" chat drawer.

   A self-mounting recreation of the production Heirloom chat widget
   (ChatDrawerV2 + ChatHero): right-anchored drawer, docked sidebar, the
   "What's a story worth keeping?" empty state, writing prompts, a rich
   composer, and a live conversation. Opens when any CTA dispatches the
   'legacy-open-chat' window event.

   Live responses come from window.claude.complete; when that isn't available
   (or errors) a scripted biographer fallback keeps the demo flowing offline.

   Styled with the lander's --hl-* tokens + inline styles (the lander has no
   Tailwind). Loaded AFTER React via <script type="text/babel" src>.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;

  /* ── Icons (lucide subset) ─────────────────────────────────────────── */
  const P = {
    feather: ['M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z', 'M16 8 2 22', 'M17.5 15H9'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    max: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
    min: ['M8 3v4a1 1 0 0 1-1 1H3', 'M21 8h-4a1 1 0 0 1-1-1V3', 'M3 16h4a1 1 0 0 1 1 1v4', 'M16 21v-4a1 1 0 0 1 1-1h4'],
    menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
    chevron: ['m6 9 6 6 6-6'],
    search: ['M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'm20 20-3.4-3.4'],
    pen: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.4 2.6a2.1 2.1 0 0 1 3 3l-9 9-4 1 1-4z'],
    share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'm8.6 13.5 6.8 4', 'm15.4 6.5-6.8 4'],
    book: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
    plus: ['M5 12h14', 'M12 5v14'],
    spark: ['M9.94 14.66A2 2 0 0 0 8.5 13.2l-5.2-1.34a.4.4 0 0 1 0-.78L8.5 9.74A2 2 0 0 0 9.94 8.3l1.35-5.2a.4.4 0 0 1 .77 0l1.35 5.2A2 2 0 0 0 15.2 9.74l5.2 1.34a.4.4 0 0 1 0 .78L15.2 13.2a2 2 0 0 0-1.44 1.46l-1.35 5.2a.4.4 0 0 1-.77 0z', 'M20 3v4', 'M22 5h-4'],
    arrowUp: ['m5 12 7-7 7 7', 'M12 19V5'],
    mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
    user: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6.2 18.8A4 4 0 0 1 10 16h4a4 4 0 0 1 3.8 2.8'],
    camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z', 'M12 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    image: ['M18 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3Z', 'M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z', 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21'],
    file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
    folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
    bookmark: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
    check: ['M20 6 9 17l-5-5'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    star: ['M11.5 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .29-.9l5.17-.76a2.12 2.12 0 0 0 1.6-1.16z'],
  };
  function Icon({ n, s = 18, sw = 1.75, fill = 'none', style }) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
        strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
        {(P[n] || []).map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }

  /* ── Content ────────────────────────────────────────────────────────── */
  const PROMPTS = [
    'What’s a smell that takes you straight back to childhood?',
    'Tell me about a meal you’ll never forget.',
    'What did your first home look like?',
    'Who taught you something you still carry?',
  ];
  const SEED = [
    { id: 's-seed-1', title: 'The summer we drove to the coast', starred: true },
    { id: 's-seed-2', title: 'Grandpa’s workshop', starred: false },
  ];
  const SYSTEM = [
    'You are the story guide inside Legacy, a warm, private memory-keeping app.',
    'You interview the person like a patient, gifted biographer helping them capture a memory worth keeping forever.',
    'Ask exactly ONE thoughtful, specific follow-up question at a time. Draw out sensory and emotional detail — who was there, what it felt like, the smells and sounds, the small moment that mattered most.',
    'Be warm, curious, and unhurried. Never lecture, never use lists or markdown. Keep replies to 2–4 short sentences and always end with a single gentle question.',
  ].join(' ');
  const FALLBACKS = [
    'That’s a beautiful place to begin. Who was there with you — and what were they doing when you picture that moment?',
    'I can almost see it. What’s one small detail you’ve never forgotten — a smell, a sound, something someone said?',
    'That stays with a person. How did it feel right then — and what do you think that moment taught you?',
    'Tell me more about that. What was happening just before — how did the day lead you there?',
    'There’s a whole story in this. If you could keep one single line from this memory forever, what would it say?',
    'Thank you for trusting me with that. What happened next — where does this memory go from here?',
  ];

  async function askGuide(messages, turn) {
    try {
      if (window.claude && typeof window.claude.complete === 'function') {
        const text = await window.claude.complete({
          system: SYSTEM,
          max_tokens: 400,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        if (text && text.trim()) return text.trim();
      }
    } catch (e) { /* fall through to scripted */ }
    await new Promise((r) => setTimeout(r, 700));
    return FALLBACKS[Math.min(turn, FALLBACKS.length - 1)];
  }

  const LS = 'legacy.story.v1';
  const loadState = () => {
    try { const r = JSON.parse(localStorage.getItem(LS) || '{}'); return r; } catch (e) { return {}; }
  };

  /* ── Small styled primitives ──────────────────────────────────────────── */
  const iconBtn = { display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 9, background: 'transparent', border: 'none', color: 'var(--hl-muted)', cursor: 'pointer', transition: 'background .15s,color .15s' };
  function IconBtn({ n, s = 18, label, onClick, style }) {
    return (
      <button type="button" aria-label={label} title={label} onClick={onClick} style={{ ...iconBtn, ...style }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 8%, transparent)'; e.currentTarget.style.color = 'var(--hl-text)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-muted)'; }}>
        <Icon n={n} s={s} />
      </button>
    );
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────── */
  function Sidebar({ sessions, activeId, onNew, onSelect, onPrompt, onRowAction, onCreateStory, stories, onClose, query, setQuery }) {
    const [convOpen, setConvOpen] = useState(true);
    const [menuId, setMenuId] = useState(null);
    const showSearch = sessions.length >= 6;
    const filtered = query ? sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())) : sessions;
    const sectionLabel = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-faint)' };
    const navRow = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 10, background: 'transparent', border: 'none', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background .15s' };
    const hov = (e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 6%, transparent)');
    const unhov = (e) => (e.currentTarget.style.background = 'transparent');
    return (
      <aside style={{ width: 264, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--hl-surface-2)', borderRight: '1px solid var(--hl-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'grid', placeItems: 'center', color: 'var(--hl-accent)' }}><Icon n="feather" s={15} /></span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: 'var(--hl-text)' }}>Legacy</span>
          {onClose && <button aria-label="Close menu" onClick={onClose} style={{ ...iconBtn, marginLeft: 'auto' }}><Icon n="x" s={18} /></button>}
        </div>

        <div style={{ padding: '4px 12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button style={navRow} onClick={onNew} onMouseEnter={hov} onMouseLeave={unhov}><Icon n="pen" s={17} style={{ color: 'var(--hl-accent)' }} /> New chat</button>
          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
              <Icon n="search" s={15} style={{ color: 'var(--hl-faint)' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--hl-text)' }} />
            </div>
          )}
        </div>

        <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 16px' }}>
          <button onClick={() => setConvOpen((v) => !v)} style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 6px 8px', width: '100%' }}>
            <Icon n="chevron" s={12} style={{ transform: convOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s', color: 'var(--hl-faint)' }} /> Conversations
          </button>
          {convOpen && filtered.map((s) => (
            <div key={s.id} style={{ position: 'relative' }}>
              <button onClick={() => onSelect(s.id)} onMouseEnter={hov} onMouseLeave={unhov}
                style={{ ...navRow, fontWeight: s.id === activeId ? 600 : 400, background: s.id === activeId ? 'color-mix(in srgb, var(--hl-accent) 12%, transparent)' : 'transparent', paddingRight: 34 }}>
                {s.starred && <Icon n="star" s={12} fill="var(--hl-accent)" style={{ color: 'var(--hl-accent)', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
              </button>
              <button aria-label="More" onClick={() => setMenuId(menuId === s.id ? null : s.id)} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--hl-faint)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><i style={dot} /><i style={dot} /><i style={dot} /></span>
              </button>
              {menuId === s.id && (
                <div style={{ position: 'absolute', right: 6, top: '100%', zIndex: 5, marginTop: 2, width: 148, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 12, boxShadow: '0 18px 44px -18px var(--hl-shadow)', padding: 5 }}>
                  {[['star', s.starred ? 'Unstar' : 'Star', 'star'], ['pen', 'Rename', 'rename'], ['trash', 'Delete', 'delete']].map(([ic, lbl, act]) => (
                    <button key={act} onClick={() => { setMenuId(null); onRowAction(s.id, act); }} style={menuItem} onMouseEnter={hov} onMouseLeave={unhov}>
                      <Icon n={ic} s={14} style={{ color: act === 'delete' ? 'var(--hl-accent)' : 'var(--hl-muted)' }} /> {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 6px 8px' }}>
            <span style={sectionLabel}>Stories</span>
            <button aria-label="Create story" onClick={onCreateStory} style={{ ...iconBtn, width: 24, height: 24, color: 'var(--hl-accent)' }}><Icon n="plus" s={15} /></button>
          </div>
          {stories.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--hl-faint)', padding: '0 6px 4px', lineHeight: 1.5, margin: 0 }}>Group related memories into a story you can publish as a book.</p>
          ) : stories.map((st) => (
            <div key={st.id} style={{ ...navRow, cursor: 'default' }}><Icon n="book" s={16} style={{ color: 'var(--hl-accent)' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</span></div>
          ))}

          <div style={{ padding: '18px 6px 8px' }}><span style={sectionLabel}>Writing prompts</span></div>
          {PROMPTS.map((p, i) => (
            <button key={i} onClick={() => onPrompt(p)} onMouseEnter={hov} onMouseLeave={unhov}
              style={{ ...navRow, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: 'var(--hl-muted)' }}>
              <Icon n="spark" s={14} style={{ color: 'var(--hl-accent)', flexShrink: 0, marginTop: 2 }} /><span>{p}</span>
            </button>
          ))}
        </div>
      </aside>
    );
  }
  const dot = { width: 3, height: 3, borderRadius: 9, background: 'currentColor', display: 'block' };
  const menuItem = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 13.5, cursor: 'pointer', textAlign: 'left' };

  /* ── Messages ─────────────────────────────────────────────────────────── */
  function Avatar() {
    return <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 99, background: 'var(--hl-accent)', display: 'grid', placeItems: 'center', color: 'var(--hl-on-accent)', marginTop: 2 }}><Icon n="feather" s={17} /></span>;
  }
  function Messages({ messages, loading }) {
    const endRef = useRef(null);
    useEffect(() => { endRef.current && endRef.current.scrollTo ? null : null; }, []);
    useEffect(() => { if (endRef.current) endRef.current.parentElement.scrollTop = endRef.current.parentElement.scrollHeight; }, [messages, loading]);
    return (
      <div className="lg-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 12, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && <Avatar />}
              <div style={{ maxWidth: '76%', borderRadius: 18, padding: m.role === 'user' ? '12px 16px' : '2px 0', fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.62, color: 'var(--hl-text)', whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'var(--hl-surface)' : 'transparent', border: m.role === 'user' ? '1px solid var(--hl-border)' : 'none', borderBottomRightRadius: m.role === 'user' ? 5 : 18, borderBottomLeftRadius: m.role === 'assistant' ? 5 : 18 }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 12 }}>
              <Avatar />
              <div style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 18, borderBottomLeftRadius: 5, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--hl-faint)', animation: `lgBounce 1.1s ${i * 0.15}s infinite ease-in-out` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
    );
  }

  /* ── Composer ─────────────────────────────────────────────────────────── */
  const SOURCES = [['camera', 'Take a photo'], ['image', 'Photo library'], ['file', 'Scan a document'], ['mic', 'Record audio'], ['folder', 'Browse files']];
  function Composer({ onSend, disabled }) {
    const [text, setText] = useState('');
    const [srcOpen, setSrcOpen] = useState(false);
    const taRef = useRef(null);
    const grow = () => { const el = taRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; };
    const submit = () => { const t = text.trim(); if (!t || disabled) return; onSend(t); setText(''); requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = 'auto'; }); };
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', padding: '0 16px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 22, padding: '8px 8px 8px 8px', boxShadow: '0 8px 24px -16px var(--hl-shadow)' }}>
          <div style={{ position: 'relative' }}>
            <button aria-label="Add to your story" onClick={() => setSrcOpen((v) => !v)} style={{ ...iconBtn, width: 38, height: 38, color: srcOpen ? 'var(--hl-accent)' : 'var(--hl-muted)' }}><Icon n="plus" s={20} /></button>
            {srcOpen && (
              <>
                <div onClick={() => setSrcOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
                <div style={{ position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, zIndex: 2, width: 232, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 16, boxShadow: '0 22px 60px -18px var(--hl-shadow)', padding: 6 }}>
                  {SOURCES.map(([ic, lbl]) => (
                    <button key={lbl} onClick={() => setSrcOpen(false)} style={menuItem} onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--hl-text) 7%, transparent)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <Icon n={ic} s={18} style={{ color: 'var(--hl-accent)' }} /> {lbl}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <textarea ref={taRef} rows={1} value={text} placeholder="Share a memory…"
            onChange={(e) => { setText(e.target.value); grow(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.5, color: 'var(--hl-text)', padding: '9px 2px', maxHeight: 160 }} />
          <button aria-label="Record voice" style={{ ...iconBtn, width: 38, height: 38 }}><Icon n="mic" s={19} /></button>
          <button aria-label="Send" onClick={submit} disabled={!text.trim() || disabled}
            style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 99, border: 'none', display: 'grid', placeItems: 'center', background: (text.trim() && !disabled) ? 'var(--hl-accent)' : 'color-mix(in srgb, var(--hl-accent) 30%, transparent)', color: 'var(--hl-on-accent)', cursor: (text.trim() && !disabled) ? 'pointer' : 'default', transition: 'background .2s' }}>
            <Icon n="arrowUp" s={19} sw={2.2} />
          </button>
        </div>
        <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.04em', color: 'var(--hl-faint)', margin: '10px 0 0' }}>Legacy keeps your stories private. Press Enter to send.</p>
      </div>
    );
  }

  /* ── Save-chat bar (appears after a few exchanges) ────────────────────── */
  function SaveBar({ onSave }) {
    return (
      <div style={{ maxWidth: 680, margin: '14px auto 0', padding: '0 16px' }}>
        <button onClick={onSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 11, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}>
          <Icon n="bookmark" s={15} /> Save this chat
        </button>
      </div>
    );
  }

  /* ── Modals (Begin story / Save) ──────────────────────────────────────── */
  function Modal({ children, onClose, label }) {
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true); }, [onClose]);
    return (
      <div role="dialog" aria-modal="true" aria-label={label} style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', padding: 20 }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,21,15,0.42)', backdropFilter: 'blur(3px)' }} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 20, padding: 26, boxShadow: '0 30px 80px -30px var(--hl-shadow)' }}>{children}</div>
      </div>
    );
  }
  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--hl-border)', background: 'var(--hl-bg)', fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--hl-text)', outline: 'none', marginTop: 8 };
  const btnPrimary = { padding: '11px 20px', borderRadius: 11, border: 'none', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' };
  const btnGhost = { padding: '11px 20px', borderRadius: 11, border: '1px solid var(--hl-border)', background: 'transparent', color: 'var(--hl-muted)', fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 500, cursor: 'pointer' };

  function BeginStory({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    return (
      <Modal onClose={onClose} label="Begin a story">
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24, margin: '0 0 4px', color: 'var(--hl-text)' }}>Begin a story</h3>
        <p style={{ fontSize: 13.5, color: 'var(--hl-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>A story gathers related memories into one book you can share and publish.</p>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name.trim(), desc.trim())} placeholder="e.g. Dad’s life in his own words" style={field} />
        <label style={{ display: 'block', marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>Description <span style={{ textTransform: 'none', letterSpacing: 0 }}>(shown on hover)</span></label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" style={field} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.5, cursor: name.trim() ? 'pointer' : 'default' }} disabled={!name.trim()} onClick={() => onCreate(name.trim(), desc.trim())}>Create story</button>
        </div>
      </Modal>
    );
  }

  function SaveModal({ onClose }) {
    const [done, setDone] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    return (
      <Modal onClose={onClose} label="Save your story">
        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', marginBottom: 12 }}><Icon n="check" s={24} sw={2.4} /></span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 23, margin: '0 0 6px', color: 'var(--hl-text)' }}>Your story is saved.</h3>
            <p style={{ fontSize: 14, color: 'var(--hl-muted)', margin: '0 0 20px', lineHeight: 1.55 }}>We’ll email you a link to pick up right where you left off.</p>
            <button style={btnPrimary} onClick={onClose}>Back to your story</button>
          </div>
        ) : (
          <>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24, margin: '0 0 4px', color: 'var(--hl-text)' }}>Save your story</h3>
            <p style={{ fontSize: 13.5, color: 'var(--hl-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>Create a free account to keep this conversation and pick up any time.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={field} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email" style={field} />
            <button style={{ ...btnPrimary, width: '100%', marginTop: 18, opacity: (name.trim() && email.trim()) ? 1 : 0.5 }} disabled={!(name.trim() && email.trim())} onClick={() => setDone(true)}>Save my story</button>
          </>
        )}
      </Modal>
    );
  }

  /* ── Root ─────────────────────────────────────────────────────────────── */
  function StoryChat() {
    const saved = loadState();
    const [open, setOpen] = useState(false);
    const [full, setFull] = useState(false);
    const [mobileNav, setMobileNav] = useState(false);
    const [messages, setMessages] = useState(saved.messages || []);
    const [loading, setLoading] = useState(false);
    const [sessions, setSessions] = useState(saved.sessions || SEED);
    const [activeId, setActiveId] = useState(saved.activeId || null);
    const [stories, setStories] = useState([]);
    const [query, setQuery] = useState('');
    const [beginOpen, setBeginOpen] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
      const mq = window.matchMedia('(max-width: 768px)');
      const on = () => setIsMobile(mq.matches); on();
      mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
    }, []);

    // Persist transcript + sessions
    useEffect(() => {
      try { localStorage.setItem(LS, JSON.stringify({ messages, sessions, activeId })); } catch (e) {}
    }, [messages, sessions, activeId]);

    // Open on CTA event
    useEffect(() => {
      const openIt = () => setOpen(true);
      window.addEventListener('legacy-open-chat', openIt);
      return () => window.removeEventListener('legacy-open-chat', openIt);
    }, []);

    // Esc closes (drawer level; modals register their own capture handlers first)
    useEffect(() => {
      const k = (e) => {
        if (e.key !== 'Escape' || !open) return;
        if (beginOpen || saveOpen) return;
        if (isMobile && mobileNav) { setMobileNav(false); return; }
        setOpen(false);
      };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [open, beginOpen, saveOpen, isMobile, mobileNav]);

    const flash = useCallback((m) => { setToast({ m, k: Date.now() }); }, []);
    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2000); return () => clearTimeout(t); }, [toast]);

    const send = useCallback(async (text) => {
      const userMsg = { id: 'u' + Date.now(), role: 'user', content: text };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        const turn = next.filter((m) => m.role === 'assistant').length;
        setLoading(true);
        askGuide(next, turn).then((reply) => {
          setMessages((cur) => [...cur, { id: 'a' + Date.now(), role: 'assistant', content: reply }]);
          setLoading(false);
        });
        return next;
      });
      setMobileNav(false);
    }, []);

    const newChat = () => {
      if (messages.length) {
        const title = messages[0].content.slice(0, 42) + (messages[0].content.length > 42 ? '…' : '');
        const id = 'sess' + Date.now();
        setSessions((prev) => [{ id, title, starred: false }, ...prev]);
      }
      setMessages([]); setActiveId(null); setMobileNav(false);
    };
    const rowAction = (id, act) => {
      if (act === 'delete') { setSessions((p) => p.filter((s) => s.id !== id)); flash('Deleted'); }
      else if (act === 'star') { setSessions((p) => p.map((s) => s.id === id ? { ...s, starred: !s.starred } : s)); flash('Updated'); }
      else if (act === 'rename') { flash('Rename coming soon'); }
    };
    const createStory = (name, description) => { setStories((p) => [...p, { id: 'st' + Date.now(), name, description }]); setBeginOpen(false); flash('Story created'); };

    const hasStarted = messages.length > 0;
    const drawerW = full ? '100vw' : 'min(760px, 100vw)';

    const sidebarEl = (
      <Sidebar sessions={sessions} activeId={activeId} onNew={newChat}
        onSelect={(id) => { setActiveId(id); setMobileNav(false); flash('Demo: conversations are illustrative'); }}
        onPrompt={(p) => { setMobileNav(false); send(p); }} onRowAction={rowAction}
        onCreateStory={() => { setMobileNav(false); setBeginOpen(true); }} stories={stories}
        onClose={isMobile ? () => setMobileNav(false) : undefined} query={query} setQuery={setQuery} />
    );

    return (
      <>
        {/* Backdrop */}
        <div onClick={() => setOpen(false)} aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(26,21,15,0.5)', backdropFilter: 'blur(4px)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .4s ease' }} />

        {/* Drawer */}
        <div role="dialog" aria-modal="true" aria-label="Start your story" inert={!open ? '' : undefined}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 51, width: drawerW, display: 'flex', flexDirection: 'column', background: 'var(--hl-bg)', fontFamily: 'var(--font-body)', boxShadow: '-30px 0 80px -30px rgba(26,21,15,0.6)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .5s cubic-bezier(.22,1,.36,1), width .4s ease', pointerEvents: open ? 'auto' : 'none' }}>

          {/* Header */}
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', height: 52, borderBottom: '1px solid var(--hl-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {isMobile && <IconBtn n="menu" label="Menu" onClick={() => setMobileNav(true)} />}
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 9, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15.5, color: 'var(--hl-text)' }}>
                Your Story <Icon n="chevron" s={14} style={{ color: 'var(--hl-muted)' }} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconBtn n="share" s={16} label="Share" />
              {!isMobile && <IconBtn n={full ? 'min' : 'max'} s={16} label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull((v) => !v)} />}
              <IconBtn n="user" s={18} label="Account" />
              <IconBtn n="x" s={18} label="Close" onClick={() => setOpen(false)} />
            </div>
          </header>

          {/* Body */}
          <div style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0 }}>
            {!isMobile && sidebarEl}
            {isMobile && mobileNav && (
              <>
                <div onClick={() => setMobileNav(false)} style={{ position: 'absolute', inset: 0, zIndex: 18, background: 'rgba(26,21,15,0.4)' }} />
                <div style={{ position: 'absolute', insetBlock: 0, left: 0, zIndex: 19 }}>{sidebarEl}</div>
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%' }}>
              {hasStarted ? <Messages messages={messages} loading={loading} /> : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
                  <span style={{ color: 'var(--hl-accent)', marginBottom: 20 }}><Icon n="feather" s={30} /></span>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px,4vw,42px)', letterSpacing: '-.01em', color: 'var(--hl-text)', margin: '0 0 10px' }}>What’s a story worth keeping?</h1>
                  <p style={{ fontSize: 16, color: 'var(--hl-muted)', margin: 0, maxWidth: 400, lineHeight: 1.6 }}>Start anywhere — a moment, a person, a place. I’ll ask the questions that draw the rest out.</p>
                </div>
              )}
              <div style={{ paddingBottom: 16, flexShrink: 0 }}>
                <Composer onSend={send} disabled={loading} />
                {messages.length >= 4 && <SaveBar onSave={() => setSaveOpen(true)} />}
              </div>
            </div>

            {beginOpen && <BeginStory onClose={() => setBeginOpen(false)} onCreate={createStory} />}
            {saveOpen && <SaveModal onClose={() => setSaveOpen(false)} />}
          </div>

          {toast && (
            <div key={toast.k} style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 99, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', boxShadow: '0 14px 34px -12px var(--hl-shadow)', pointerEvents: 'none' }}>
              <Icon n="check" s={13} style={{ color: 'var(--hl-accent)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--hl-text)' }}>{toast.m}</span>
            </div>
          )}
        </div>
      </>
    );
  }

  /* ── Mount + styles ───────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    @keyframes lgBounce { 0%,80%,100%{ transform: translateY(0); opacity:.5 } 40%{ transform: translateY(-5px); opacity:1 } }
    .lg-scroll::-webkit-scrollbar { width: 9px; }
    .lg-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--hl-text) 16%, transparent); border-radius: 9px; border: 3px solid transparent; background-clip: padding-box; }
    .lg-scroll::-webkit-scrollbar-track { background: transparent; }
    #legacy-story-root textarea::placeholder { color: var(--hl-faint); }
    #legacy-story-root input::placeholder { color: var(--hl-faint); }
    @media (prefers-reduced-motion: reduce) { #legacy-story-root [style*="lgBounce"] { animation: none !important; } }
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'legacy-story-root';
  document.body.appendChild(root);
  ReactDOM.createRoot(root).render(<StoryChat />);
})();
