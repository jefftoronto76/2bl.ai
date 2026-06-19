/* Blocks (app/admin/prompt-studio/blocks) — meter, toolbar, table rows, expand */
(function () {
  const { useState, useRef, useEffect } = React;
  const { Button, Switch, TypeBadge, Lbadge, Select } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

  const LIMIT = 8000, YELLOW = 5000;

  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function orderPrefix(o) { return o && o > 0 ? String(o).padStart(2, '0') : ''; }

  /* ── Prompt sets (combined) — selectable collections compiled into a prompt ── */
  const PROMPT_SETS = [
    { value: 'sage-prod',    label: 'Sage — Production', version: 7, status: 'Live' },
    { value: 'sage-staging', label: 'Sage — Staging',    version: 8, status: 'Draft' },
    { value: 'discovery',    label: 'Discovery Bot',      version: 3, status: 'Live' },
  ];

  /* ── Current Prompt Set picker — lives in the Blocks header ── */
  function PromptSetSelect({ promptSet, setPromptSet }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
    }, [open]);
    const set = PROMPT_SETS.find((s) => s.value === promptSet) || PROMPT_SETS[0];
    return (
      <div className="ps-select" ref={ref}>
        <button className="ps-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
          <span className="ps-name">{set.label}</span>
          <span className={`ps-badge ${set.status === 'Live' ? 'live' : 'draft'}`}>{set.status}</span>
          <I.ChevronRight size={15} className={`ps-caret ${open ? 'open' : ''}`} />
        </button>
        {open && (
          <div className="ps-menu" role="listbox">
            {PROMPT_SETS.map((s) => (
              <button key={s.value} className={`ps-item ${s.value === promptSet ? 'on' : ''}`} role="option" aria-selected={s.value === promptSet} onClick={() => { setPromptSet(s.value); setOpen(false); }}>
                <span className="ps-item-name">{s.label}</span>
                <span className="ps-item-meta">v{s.version}</span>
                <span className={`ps-badge ${s.status === 'Live' ? 'live' : 'draft'}`}>{s.status}</span>
                <span className="ps-item-check">{s.value === promptSet ? <I.Check size={14} /> : null}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Donut chart — token distribution; hover a segment for its detail ── */
  function Donut({ byType, total, limit }) {
    const [hover, setHover] = useState(null);
    const size = 200, sw = 28, r = (size - sw) / 2, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
    const over = total > limit;
    let offset = 0;
    const segs = window.ORDERED_BLOCK_TYPES.map((t) => {
      const len = total > 0 ? (byType[t] / total) * C : 0;
      const seg = { t, len, off: offset, color: window.BLOCK_BADGE[window.BLOCK_TYPE_COLORS[t]].solid };
      offset += len;
      return seg;
    });
    const hv = hover ? { label: window.BLOCK_TYPE_LABELS[hover], tokens: byType[hover], pct: total > 0 ? Math.round((byType[hover] / total) * 100) : 0, color: window.BLOCK_BADGE[window.BLOCK_TYPE_COLORS[hover]].solid } : null;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} of ${limit} tokens used`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--gray-2)" strokeWidth={sw} />
        {total > 0 && segs.map((s) => (
          <circle key={s.t} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={-s.off}
            transform={`rotate(-90 ${cx} ${cy})`}
            opacity={hover && hover !== s.t ? 0.28 : 1}
            onMouseEnter={() => setHover(s.t)} onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer', transition: 'opacity 130ms ease' }}>
            <title>{`${window.BLOCK_TYPE_LABELS[s.t]}: ${byType[s.t].toLocaleString()} tokens`}</title>
          </circle>
        ))}
        {hv ? (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, fill: hv.color }}>{hv.label}</text>
            <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 13, fill: 'var(--text)' }}>{hv.tokens.toLocaleString()}</text>
            <text x={cx} y={cy + 33} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 11, fill: 'var(--muted)' }}>{hv.pct}% of prompt</text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 500, fill: over ? 'var(--red-6)' : 'var(--text)' }}>{total.toLocaleString()}</text>
            <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 11, fill: 'var(--muted)' }}>/ {limit.toLocaleString()} tokens</text>
          </>
        )}
      </svg>
    );
  }

  /* ── Overview — prompt-set picker + details (left), donut (right) ── */
  function Overview({ blocks, promptSet, setPromptSet, onNewBlock, onPublish }) {
    const byType = { identity: 0, knowledge: 0, guardrail: 0, process: 0, escalation: 0 };
    for (const b of blocks) byType[b.type] += window.tokensFor(b.body);
    const total = window.ORDERED_BLOCK_TYPES.reduce((s, t) => s + byType[t], 0);
    const set = PROMPT_SETS.find((s) => s.value === promptSet) || PROMPT_SETS[0];
    const lastUpdated = blocks.length ? blocks.reduce((a, b) => (a > b.updated_at ? a : b.updated_at), blocks[0].updated_at) : null;

    return (
      <div className="blocks-overview">
        <div className="ucard flat po-left">
          <div className="def-grid">
            <div className="dk">Status</div>
            <div className="dv"><Lbadge text={set.status} bg={set.status === 'Live' ? 'rgba(45,106,79,0.12)' : 'rgba(245,159,0,0.14)'} fg={set.status === 'Live' ? '#2d6a4f' : '#e67700'} sm /></div>
            <div className="dk">Live version</div>
            <div className="dv" style={{ fontFamily: 'var(--mono)' }}>v{set.version}</div>
            <div className="dk">Active blocks</div>
            <div className="dv" style={{ fontFamily: 'var(--mono)' }}>{blocks.length}</div>
            <div className="dk">Last updated</div>
            <div className="dv">{lastUpdated ? relTime(lastUpdated) : '—'}</div>
          </div>
          <div className="po-actions">
            <Button variant="default" leftSection={<I.Plus size={14} />} onClick={onNewBlock}>New block</Button>
            <Button onClick={onPublish}>Compile &amp; Publish</Button>
          </div>
        </div>

        <div className="ucard flat po-right">
          <Donut byType={byType} total={total} limit={LIMIT} />
          <div className="donut-hint">Hover a segment for its breakdown</div>
        </div>
      </div>
    );
  }

  /* ── Toolbar ── */
  function Toolbar({ query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter, allExpanded, onToggleExpand, filteredCount, totalCount }) {
    return (
      <div className="blocks-toolbar">
        <div className="search" style={{ maxWidth: 280, flex: '0 1 280px' }}>
          <I.Search size={14} />
          <input value={query} placeholder="Search blocks" onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="clear" onClick={() => setQuery('')} aria-label="Clear"><I.X size={12} /></button>}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
          <div className="chips">
            <button className={`chip ${typeFilter === 'all' ? 'on c-gray' : ''}`} onClick={() => setTypeFilter('all')}>All</button>
            {window.ORDERED_BLOCK_TYPES.map((t) => (
              <button key={t} className={`chip ${typeFilter === t ? 'on c-' + window.BLOCK_TYPE_COLORS[t] : ''}`} onClick={() => setTypeFilter(t)}>
                <span className="chip-dot" style={{ background: window.BLOCK_BADGE[window.BLOCK_TYPE_COLORS[t]].solid }} />{window.BLOCK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="chips">
            <button className={`chip ${statusFilter === 'all' ? 'on c-gray' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
            <button className={`chip ${statusFilter === 'active' ? 'on c-green' : ''}`} onClick={() => setStatusFilter('active')}>Active</button>
            <button className={`chip ${statusFilter === 'disabled' ? 'on c-gray' : ''}`} onClick={() => setStatusFilter('disabled')}>Disabled</button>
          </div>
        </div>
        <div className="toolbar-counter">
          <span className="tc-count">{filteredCount} / {totalCount}</span>
          <button className="link-btn" onClick={onToggleExpand}>{allExpanded ? <I.ChevronsUp size={14} /> : <I.ChevronsDown size={14} />}{allExpanded ? 'Collapse all' : 'Expand all'}</button>
        </div>
      </div>
    );
  }

  /* ── Expand panel ── */
  function ExpandPanel({ block, onEdit }) {
    const lines = block.body.split('\n');
    const preview = lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n…' : '');
    return (
      <div className="expand-panel">
        <div className="ep-main">
          <span className="ep-label">Block content</span>
          <pre className="ep-pre">{preview}</pre>
          <Button variant="default" size="sm" leftSection={<I.Pencil size={14} />} onClick={onEdit}>Edit</Button>
        </div>
        <div className="ep-meta">
          <div><div className="mi-label">Tokens</div><div className="mi-val mono">{window.tokensFor(block.body).toLocaleString()}</div></div>
          <div><div className="mi-label">Author</div><div className="mi-val">{block.author || '—'}</div></div>
          <div><div className="mi-label">Updated</div><div className="mi-val">{relTime(block.updated_at)}</div></div>
          <div><div className="mi-label">Order</div><div className="mi-val mono">{block.order && block.order > 0 ? block.order : '—'}</div></div>
        </div>
      </div>
    );
  }

  /* ── Row ── */
  function Row({ block, selected, expanded, maxTok, onSel, onToggleStatus, onToggleExpand, onEdit, onCopy, copied }) {
    const tok = window.tokensFor(block.body);
    const barPct = maxTok > 0 ? (tok / maxTok) * 100 : 0;
    return (
      <>
        <tr className="brow">
          <td style={{ width: 40 }}><button className={`checkbox ${selected ? 'on' : ''}`} onClick={() => onSel(block.id)} aria-label="Select">{selected ? <I.Check size={13} stroke={3} /> : null}</button></td>
          <td style={{ width: 28 }}><button className="actionicon" onClick={() => onToggleExpand(block.id)} aria-label="Expand"><I.ChevronRight size={14} className={`chev ${expanded ? 'open' : ''}`} /></button></td>
          <td>
            <div className="block-title"><span className="order-prefix">{orderPrefix(block.order)}</span>{block.title}</div>
            <div className="block-updated">Updated {relTime(block.updated_at)}</div>
          </td>
          <td><TypeBadge type={block.type} sm /></td>
          <td><div className="tok-cell"><span className="tok-num">{tok.toLocaleString()}</span><div className="tok-bar"><span style={{ width: `${barPct}%` }} /></div></div></td>
          <td>
            <div className="status-cell">
              <Switch checked={block.status === 'active'} onChange={(c) => onToggleStatus(block.id, c)} />
              <span className={`status-text ${block.status === 'active' ? 'on' : 'off'}`}>{block.status === 'active' ? 'Active' : 'Disabled'}</span>
            </div>
          </td>
          <td>
            <div className="row-actions">
              <button className="actionicon" onClick={() => onCopy(block)} aria-label="Copy body" style={{ color: copied ? 'var(--green-6)' : undefined }}>{copied ? <I.Check size={16} /> : <I.Clipboard size={16} />}</button>
              <button className="actionicon" onClick={() => onEdit(block)} aria-label="Edit"><I.Pencil size={16} /></button>
              <button className="actionicon" aria-label="Duplicate"><I.Copy size={16} /></button>
              <button className="actionicon" aria-label="Delete" style={{ color: 'var(--red-6)' }}><I.Trash size={16} /></button>
            </div>
          </td>
        </tr>
        {expanded && (
          <tr><td /><td /><td colSpan={5}><ExpandPanel block={block} onEdit={() => onEdit(block)} /></td></tr>
        )}
      </>
    );
  }

  function Blocks({ notify }) {
    const [items, setItems] = useState(window.BLOCKS);
    const [promptSet, setPromptSet] = useState('sage-prod');
    const [selected, setSelected] = useState(new Set());
    const [expanded, setExpanded] = useState(new Set());
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [copiedId, setCopiedId] = useState(null);

    const activeBlocks = items.filter((b) => b.status === 'active');
    const filtered = items.filter((b) => {
      if (typeFilter !== 'all' && b.type !== typeFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (query.trim()) { const q = query.trim().toLowerCase(); if (!`${b.title} ${b.body}`.toLowerCase().includes(q)) return false; }
      return true;
    });
    const maxTok = filtered.length ? Math.max(0, ...filtered.map((b) => window.tokensFor(b.body))) : 0;
    const allExpanded = filtered.length > 0 && filtered.every((b) => expanded.has(b.id));

    function toggleSel(id) { setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
    function toggleExpand(id) { setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
    function toggleStatus(id, checked) { setItems((it) => it.map((b) => b.id === id ? { ...b, status: checked ? 'active' : 'disabled' } : b)); }
    function onToggleExpandAll() { allExpanded ? setExpanded(new Set()) : setExpanded(new Set(filtered.map((b) => b.id))); }
    function onCopy(b) { navigator.clipboard.writeText(b.body); setCopiedId(b.id); setTimeout(() => setCopiedId(null), 2000); }
    const filteredSel = filtered.filter((b) => selected.has(b.id)).length;
    const allSel = filtered.length > 0 && filteredSel === filtered.length;
    function toggleSelAll() { setSelected((prev) => { const n = new Set(prev); if (filteredSel > 0) filtered.forEach((b) => n.delete(b.id)); else filtered.forEach((b) => n.add(b.id)); return n; }); }

    return (
      <div className="screen" data-screen-label="Admin · Blocks">
        <div className="screen-headbar">
          <div className="hb-promptset">
            <span className="hb-ps-label">Current Prompt Set</span>
            <PromptSetSelect promptSet={promptSet} setPromptSet={setPromptSet} />
          </div>
        </div>
        <div className="screen-scroll blocks-scroll">
          <Overview
            blocks={activeBlocks}
            promptSet={promptSet}
            setPromptSet={setPromptSet}
            onNewBlock={() => {}}
            onPublish={() => notify && notify({ title: 'Prompt published', message: 'Version ' + (window.MASTER_PROMPT_VERSION + 1) })}
          />
          <div className="blocks-sticky">
            <Toolbar query={query} setQuery={setQuery} typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} allExpanded={allExpanded} onToggleExpand={onToggleExpandAll} filteredCount={filtered.length} totalCount={items.length} />
          </div>
          {selected.size > 0 && (
            <div className="bulkbar" style={{ marginBottom: 16 }}>
              <span className="bb-count">{selected.size} selected</span>
              <div className="bb-actions">
                <button className="btn btn-sm btn-white" onClick={() => { setItems((it) => it.map((b) => selected.has(b.id) ? { ...b, status: 'active' } : b)); setSelected(new Set()); }}>Enable</button>
                <button className="btn btn-sm btn-white" onClick={() => { setItems((it) => it.map((b) => selected.has(b.id) ? { ...b, status: 'disabled' } : b)); setSelected(new Set()); }}>Disable</button>
                <button className="btn btn-sm btn-white danger" onClick={() => { setItems((it) => it.filter((b) => !selected.has(b.id))); setSelected(new Set()); }}>Delete</button>
                <button className="bb-clear" onClick={() => setSelected(new Set())} aria-label="Clear"><I.X size={15} /></button>
              </div>
            </div>
          )}

          <div className="table-wrap only-desktop">
            <table className="blocks">
              <thead><tr>
                <th style={{ width: 40 }}><button className={`checkbox ${allSel ? 'on' : filteredSel > 0 ? 'ind' : ''}`} onClick={toggleSelAll} aria-label="Select all">{allSel ? <I.Check size={13} stroke={3} /> : filteredSel > 0 ? <span className="bar-ind" /> : null}</button></th>
                <th style={{ width: 28 }} aria-hidden></th><th>Title</th><th>Type</th><th>Tokens</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((b) => (
                  <Row key={b.id} block={b} selected={selected.has(b.id)} expanded={expanded.has(b.id)} maxTok={maxTok} copied={copiedId === b.id}
                    onSel={toggleSel} onToggleStatus={toggleStatus} onToggleExpand={toggleExpand} onEdit={() => {}} onCopy={onCopy} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="only-mobile"><div className="card-stack">
            {filtered.map((b) => (
              <div key={b.id} className="block-card">
                <div className="bc-top">
                  <button className={`checkbox ${selected.has(b.id) ? 'on' : ''}`} onClick={() => toggleSel(b.id)} aria-label="Select">{selected.has(b.id) ? <I.Check size={13} stroke={3} /> : null}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="block-title"><span className="order-prefix">{orderPrefix(b.order)}</span>{b.title}</div>
                    <div className="block-updated">Updated {relTime(b.updated_at)}</div>
                  </div>
                  <TypeBadge type={b.type} sm />
                </div>
                <div className="group-between">
                  <div className="tok-cell"><span className="tok-num">{window.tokensFor(b.body).toLocaleString()}</span><div className="tok-bar"><span style={{ width: `${maxTok ? (window.tokensFor(b.body) / maxTok) * 100 : 0}%` }} /></div></div>
                  <div className="status-cell"><Switch checked={b.status === 'active'} onChange={(c) => toggleStatus(b.id, c)} /><span className={`status-text ${b.status === 'active' ? 'on' : 'off'}`}>{b.status === 'active' ? 'Active' : 'Disabled'}</span></div>
                </div>
              </div>
            ))}
          </div></div>
        </div>
      </div>
    );
  }

  window.Screens.Blocks = Blocks;
})();
