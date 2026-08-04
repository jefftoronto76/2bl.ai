/* Composer (app/admin/prompt-builder/page.tsx)
   Chat-pattern rebuild: inner conversation sidebar + chat canvas + Heirloom-style
   composer. Opening options live as collapsible pills inside the composer. Blocks
   still draft inline in the canvas. */
(function () {
  const { useState, useRef, useEffect } = React;
  const { Button, Select, TextInput } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

  const MAX_EXCHANGES = 10, WARN = 8;
  const TYPES = [
    { value: 'identity', label: 'Identity & Voice' },
    { value: 'knowledge', label: 'Knowledge' },
    { value: 'guardrail', label: 'Guardrail' },
    { value: 'process', label: 'Process' },
    { value: 'escalation', label: 'Escalation' },
  ];
  const TOPICS = {
    identity: [{ value: 't1', label: 'Persona' }, { value: 't2', label: 'Tone' }],
    knowledge: [{ value: 't3', label: 'Company' }, { value: 't4', label: 'Pricing' }],
    guardrail: [{ value: 't5', label: 'Off-limits' }],
    process: [{ value: 't6', label: 'Booking' }],
    escalation: [{ value: 't7', label: 'Handoff' }],
  };

  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const now = Date.now();
  // Mock conversation history — grouped by recency in the inner sidebar.
  const SAMPLE_THREADS = [
    {
      id: 'th-timeline', title: 'Engagement timeline block', group: 'Today',
      preview: 'Saved a Knowledge block on phasing', ts: now - 40 * MIN,
      messages: [
        { role: 'user', content: 'Visitors keep asking how long a typical engagement runs. Can we add something?', timestamp: now - 52 * MIN },
        { role: 'assistant', content: "Good catch — that's a Knowledge gap today. Tell me the rough shape of a typical engagement and I'll draft a block Sage can quote.", timestamp: now - 51 * MIN },
        { role: 'user', content: 'Discovery is ~2 weeks, build is 6–8 weeks, then a 2-week handoff.', timestamp: now - 41 * MIN },
        { role: 'assistant', content: "Here's a block drafted from that. Review the type and name, then save it.", timestamp: now - 40 * MIN },
      ],
    },
    {
      id: 'th-offlimits', title: 'Off-limits competitors', group: 'Today',
      preview: 'Named two competitors to avoid', ts: now - 5 * HOUR,
      messages: [
        { role: 'user', content: 'Our off-limits block is vague. Sage should avoid naming competitors directly.', timestamp: now - 5 * HOUR - 3 * MIN },
        { role: 'assistant', content: 'Understood. Which competitors should Sage decline to discuss, and how should it redirect?', timestamp: now - 5 * HOUR - 2 * MIN },
      ],
    },
    {
      id: 'th-persona', title: 'Persona & tone refresh', group: 'This week',
      preview: 'Tightened the voice guidance', ts: now - 2 * DAY,
      messages: [
        { role: 'user', content: 'Sage sounds a little stiff. Can we warm up the tone without losing precision?', timestamp: now - 2 * DAY },
        { role: 'assistant', content: 'We can. I drafted an updated Identity & Voice block — plain-spoken, warm, still exact. Take a look.', timestamp: now - 2 * DAY + MIN },
      ],
    },
    {
      id: 'th-booking', title: 'Booking flow follow-up', group: 'Earlier',
      preview: 'Process block for not-ready visitors', ts: now - 9 * DAY,
      messages: [
        { role: 'user', content: "What happens when someone isn't ready to book yet?", timestamp: now - 9 * DAY },
        { role: 'assistant', content: 'Right now nothing catches them. A short Process block offering a lighter next step would help. Want me to draft one?', timestamp: now - 9 * DAY + MIN },
      ],
    },
  ];

  function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function relTime(ts) {
    const d = now - ts;
    if (d < HOUR) return Math.max(1, Math.round(d / MIN)) + 'm';
    if (d < DAY) return Math.round(d / HOUR) + 'h';
    return Math.round(d / DAY) + 'd';
  }
  const GROUPS = ['Today', 'This week', 'Earlier'];

  function UploadMenu({ open, onClose, onPick }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const f = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
    }, [open]);
    if (!open) return null;
    const items = [['Add files', false], ['Google Drive', true], ['Dropbox', true], ['Box', true], ['Take a screenshot', true]];
    return (
      <div className="menu-dd" ref={ref} style={{ bottom: 'calc(100% + 8px)', top: 'auto', left: 0, right: 'auto' }}>
        {items.map(([label, dis]) => (
          <button key={label} className="menu-item" disabled={dis} onClick={() => { if (!dis) onPick(); onClose(); }} style={dis ? { opacity: 0.45 } : undefined}>
            <span className="mi-icon"><I.File size={16} /></span>{label}
          </button>
        ))}
      </div>
    );
  }

  /* Heirloom-style composer: collapsible suggestion pills · auto-grow input ·
     send · status meta. Tenant (green) palette. */
  function HeirloomComposer({ input, setInput, onSend, atLimit, uploaded, onUpload, onClearUpload, loading, pills }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [pillsOpen, setPillsOpen] = useState(true);
    const taRef = useRef(null);
    const hasPills = pills && pills.length > 0;

    useEffect(() => {
      const el = taRef.current; if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }, [input]);

    return (
      <div className={`hc ${focused ? 'focus' : ''}`}>
        {hasPills && (
          pillsOpen ? (
            <div className="hc-chips">
              {pills.map((p) => (
                <button key={p.label} className="hc-chip" disabled={p.disabled || atLimit} onClick={p.onClick} title={p.disabled ? 'Add some blocks first' : undefined}>
                  {p.label}
                </button>
              ))}
              <button className="hc-chips-x" aria-label="Hide suggestions" title="Hide suggestions" onClick={() => setPillsOpen(false)}>
                <I.X size={13} />
              </button>
            </div>
          ) : (
            <div className="hc-chips collapsed">
              <button className="hc-suggest" onClick={() => setPillsOpen(true)}>
                <span className="hc-spark" aria-hidden>✦</span>Suggestions
                <span className="hc-count">{pills.length}</span>
              </button>
            </div>
          )
        )}

        <div className="hc-row">
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button className="hc-tool" aria-label="Add content" disabled={atLimit} onClick={() => setMenuOpen((o) => !o)}><I.Plus size={18} /></button>
            <UploadMenu open={menuOpen} onClose={() => setMenuOpen(false)} onPick={onUpload} />
          </div>
          <textarea
            ref={taRef} className="hc-input" value={input} rows={1}
            placeholder={atLimit ? 'Exchange limit reached' : 'Type or paste content for a block…'}
            disabled={atLimit}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          />
          <button className="hc-send" aria-label="Send message" disabled={atLimit || !input.trim()} onClick={onSend}><I.Send size={17} /></button>
        </div>

        {uploaded && (
          <div className="hc-upload">
            <span className="hc-upload-ok"><I.Check size={12} />Saved to assets.</span>
            <button className="actionicon" style={{ width: 20, height: 20 }} onClick={onClearUpload} aria-label="Remove file"><I.X size={12} /></button>
          </div>
        )}

        <div className="hc-foot">
          <span className={`hc-status ${loading ? 'thinking' : ''}`}>
            <span className="dot" aria-hidden />{loading ? 'Drafting…' : 'Ready'}
          </span>
          <span className="hc-kbd"><kbd>↵</kbd> to send · <kbd>⇧↵</kbd> new line</span>
        </div>
      </div>
    );
  }

  function MetadataSection({ type, setType, topicId, setTopicId, blockName, setBlockName }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="composer-meta-wrap">
        <button className="meta-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Block metadata<span className={`meta-caret ${open ? 'open' : ''}`}>▾</span></button>
        {open && (
          <div className="stack-sm" style={{ paddingTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: type ? '1fr 1fr' : '1fr', gap: 12 }}>
              <Select label="Type" placeholder="Select a type…" data={TYPES} value={type || null} onChange={(v) => { setType(v); setTopicId(''); }} />
              {type && <Select label="Topic" placeholder="Select a topic…" data={[...(TOPICS[type] || []), { value: '__new__', label: 'New topic…' }]} value={topicId || null} onChange={setTopicId} />}
            </div>
            <TextInput label="Block name" value={blockName} onChange={setBlockName} placeholder="e.g. Off-limit topics, Career summary…" />
          </div>
        )}
      </div>
    );
  }

  function DraftCard({ draft, index, count, onSave, onRemove }) {
    const [type, setType] = useState(draft.suggestedType || '');
    const [topicName, setTopicName] = useState(draft.suggestedTopic || '');
    const [name, setName] = useState(draft.title || '');
    return (
      <div className="draft-card">
        <div className="draft-head">
          <span className="draft-kicker">Block ready{count > 1 ? ` (${index + 1} of ${count})` : ''}</span>
          <button className="actionicon" aria-label="Edit"><I.Pencil size={14} /></button>
        </div>
        <div className="draft-body">{draft.content}</div>
        <div className="draft-grid">
          <Select label="Type" placeholder="Type…" data={TYPES} value={type || null} onChange={setType} />
          <TextInput label="Topic" value={topicName} onChange={setTopicName} placeholder="Topic" />
          <TextInput label="Block name" value={name} onChange={setName} placeholder="Name" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" onClick={() => onSave(index)} disabled={!type || !name.trim()}>Check &amp; Save</Button>
          <Button size="sm" variant="subtle" color="gray" onClick={() => onSave(index)} disabled={!type || !name.trim()}>Save anyway</Button>
          <Button size="sm" variant="subtle" color="red" onClick={() => onRemove(index)}>Discard</Button>
        </div>
      </div>
    );
  }

  function ConversationSidebar({ open, threads, activeId, onSelect, onNew, onClose }) {
    return (
      <aside className={`cmp-side ${open ? '' : 'collapsed'}`} aria-hidden={!open}>
        <div className="cmp-side-inner">
          <div className="cmp-side-head">
            <span className="cmp-side-title">Conversations</span>
            <div className="cmp-side-head-actions">
              <button className="cmp-newbtn" onClick={onNew}><I.Plus size={15} />New</button>
              <button className="cmp-side-close" onClick={onClose} aria-label="Hide conversations" title="Hide"><I.ChevronRight size={16} className="flip" /></button>
            </div>
          </div>
          <div className="cmp-threads nav-scroll-light">
          {GROUPS.map((g) => {
            const items = threads.filter((t) => t.group === g);
            if (!items.length) return null;
            return (
              <React.Fragment key={g}>
                <div className="cmp-group-label">{g}</div>
                {items.map((t) => (
                  <button key={t.id} className={`cmp-thread ${t.id === activeId ? 'active' : ''}`} onClick={() => onSelect(t.id)}>
                    <span className="ct-row">
                      <span className="ct-title">{t.title}</span>
                      <span className="ct-time">{t.draft ? 'now' : relTime(t.ts)}</span>
                    </span>
                    <span className="ct-sub">{t.draft ? 'New conversation' : t.preview}</span>
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </div>
        </div>
      </aside>
    );
  }

  function Composer({ notify, userName }) {
    const existing = window.COMPOSER_EXISTING;
    const newThread = () => ({ id: 'th-' + Math.random().toString(36).slice(2, 8), title: 'New conversation', group: 'Today', draft: true, ts: Date.now(), messages: [] });

    const [threads, setThreads] = useState(() => [newThread(), ...SAMPLE_THREADS]);
    const [activeId, setActiveId] = useState(() => threads[0].id);
    const active = threads.find((t) => t.id === activeId) || threads[0];

    const [messages, setMessages] = useState(active.messages);
    const [input, setInput] = useState('');
    const [hasOpening, setHasOpening] = useState(active.messages.length > 0);
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploaded, setUploaded] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [type, setType] = useState(''); const [topicId, setTopicId] = useState(''); const [blockName, setBlockName] = useState('');
    const [sideOpen, setSideOpen] = useState(false);
    const endRef = useRef(null);

    const hasMessages = messages.length > 0;
    const exchangeCount = messages.filter((m) => m.role === 'user').length;
    const atLimit = exchangeCount >= MAX_EXCHANGES;

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, drafts, loading]);

    function selectThread(id) {
      const t = threads.find((x) => x.id === id); if (!t) return;
      setActiveId(id); setMessages(t.messages); setDrafts([]); setInput('');
      setHasOpening(t.messages.length > 0); setLoading(false); setSideOpen(false);
    }
    function startNew() {
      const t = newThread();
      setThreads((ts) => [t, ...ts.filter((x) => !(x.draft && x.messages.length === 0))]);
      setActiveId(t.id); setMessages([]); setDrafts([]); setInput('');
      setHasOpening(false); setLoading(false); setSideOpen(false);
    }

    function pushAssistant(text, after) {
      setLoading(true);
      setTimeout(() => { setMessages((m) => [...m, { role: 'assistant', content: text, timestamp: Date.now() }]); setLoading(false); after && after(); }, 650);
    }

    function opening(choice) {
      setHasOpening(true);
      if (choice === 'new') { setMessages([{ role: 'assistant', content: "Sounds great — to get started, just type in what you're thinking for the block.", timestamp: Date.now() }]); return; }
      const text = choice === 'summarize'
        ? `You currently have ${existing.length} active blocks covering identity, guardrails, knowledge, process, and escalation. The foundation is solid. The biggest opportunity is fleshing out your **Knowledge** blocks with specific engagement details — that's where Sage gets vague today.`
        : `A few gaps stand out:\n\n- **Knowledge**: pricing is routed to a call, but there's no block on what a typical engagement timeline looks like.\n- **Process**: consider a follow-up block for visitors who aren't ready to book.\n- **Guardrail**: your off-limits block could name specific competitors to avoid.`;
      setMessages([{ role: 'user', content: choice === 'summarize' ? 'Summarize my prompt' : 'Identify opportunities to improve', timestamp: Date.now() }]);
      pushAssistant(text);
    }

    function send() {
      const text = input.trim();
      if (!text || loading || atLimit) return;
      setInput(''); setDrafts([]); setHasOpening(true);
      const userMsg = { role: 'user', content: text, timestamp: Date.now() };
      setMessages((m) => [...m, userMsg]);
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        setMessages((m) => [...m, { role: 'assistant', content: "Here's a block drafted from what you shared. Review the type and name, then save it.", timestamp: Date.now() }]);
        setDrafts([{ title: blockName || 'New block', content: text, suggestedType: type || 'knowledge', suggestedTopic: '' }]);
      }, 800);
    }

    function saveDraft(i) {
      setDrafts((d) => d.filter((_, idx) => idx !== i));
      notify && notify({ title: 'Block saved', message: 'Added to your blocks.' });
      pushAssistant('Block saved! What would you like to build next?');
    }
    function removeDraft(i) { setDrafts((d) => d.filter((_, idx) => idx !== i)); }

    function copyAll() { navigator.clipboard.writeText(messages.map((m) => `${m.role}: ${m.content}`).join('\n\n')); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); }
    function copyBubble(i, c) { navigator.clipboard.writeText(c); setCopiedId(i); setTimeout(() => setCopiedId(null), 1000); }

    function renderMd(text) {
      return text.split('\n').map((line, i) => {
        if (line.trim().startsWith('- ')) return <li key={i} dangerouslySetInnerHTML={{ __html: bold(line.trim().slice(2)) }} />;
        if (!line.trim()) return null;
        return <p key={i} dangerouslySetInnerHTML={{ __html: bold(line) }} />;
      });
    }
    function bold(s) { return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }

    const pills = [
      { label: 'Summarize my prompt', disabled: existing.length === 0, onClick: () => opening('summarize') },
      { label: 'Identify opportunities', disabled: existing.length === 0, onClick: () => opening('opportunities') },
      { label: 'Create a new block', disabled: false, onClick: () => opening('new') },
    ];

    return (
      <div className="composer-screen" data-screen-label="Admin · Composer">
        <ConversationSidebar open={sideOpen} threads={threads} activeId={activeId} onSelect={selectThread} onNew={startNew} onClose={() => setSideOpen(false)} />
        {sideOpen && <div className="cmp-side-scrim" onClick={() => setSideOpen(false)} />}

        <div className="cmp-main">
          <div className="cmp-topbar">
            <button className="cmp-hamburger" onClick={() => setSideOpen((o) => !o)} aria-label="Toggle conversations" aria-expanded={sideOpen} title="Conversations">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="ct-h">{active.draft && !hasMessages ? 'Composer' : active.title}</h1>
            <span className="spacer" />
            {exchangeCount > 0 && (
              <span className={`exch-badge ${exchangeCount >= MAX_EXCHANGES ? 'over' : exchangeCount >= WARN ? 'warn' : ''}`}>{exchangeCount} of {MAX_EXCHANGES} exchanges</span>
            )}
            <button className={`copy-all ${copiedAll ? 'copied' : ''}`} onClick={copyAll} disabled={!hasMessages}>{copiedAll ? 'Copied!' : 'Copy all'}</button>
          </div>

          <div className="cmp-scroll">
            {!hasMessages ? (
              <div className="cmp-empty">
                <p className="composer-welcome">Welcome back{userName ? `, ${userName.split(' ')[0]}` : ''}.<br /><span className="cw-sub">Build a block, or pick a starting point below.</span></p>
              </div>
            ) : (
              <div className="chat-thread">
                {drafts.length > 0 && <div className="chat-center-note">Here {drafts.length === 1 ? 'is 1 block' : `are ${drafts.length} blocks`} based on your input.</div>}
                {messages.map((m, i) => (
                  <div key={i} className={`chat-row ${m.role}`}>
                    <div className="chat-bubble-wrap">
                      <div className={`bubble ${m.role}`} onClick={() => m.content && copyBubble(i, m.content)} title="Click to copy"
                        style={{ outline: copiedId === i ? '2px solid var(--green-5)' : '2px solid transparent' }}>
                        {m.role === 'assistant' ? renderMd(m.content) : m.content}
                      </div>
                      <span className="bubble-time">{fmtTime(m.timestamp)}</span>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="chat-row assistant"><div className="chat-bubble-wrap"><div className="bubble assistant"><span className="hc-typing"><i /><i /><i /></span></div></div></div>
                )}
                {drafts.map((d, i) => <DraftCard key={i} draft={d} index={i} count={drafts.length} onSave={saveDraft} onRemove={removeDraft} />)}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="cmp-footer">
            <HeirloomComposer
              input={input} setInput={setInput} onSend={send} atLimit={atLimit} loading={loading}
              uploaded={uploaded} onUpload={() => setUploaded(true)} onClearUpload={() => setUploaded(false)}
              pills={hasMessages ? null : pills}
            />
            <div className="cmp-meta-row">
              <MetadataSection type={type} setType={setType} topicId={topicId} setTopicId={setTopicId} blockName={blockName} setBlockName={setBlockName} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.Screens.Composer = Composer;
})();
