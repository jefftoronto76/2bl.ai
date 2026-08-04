/* Blocks (app/admin/prompt-studio/blocks) — meter, toolbar, table rows, expand */
(function () {
  const { useState, useRef, useEffect } = React;
  const { Button, Switch, TypeBadge, Lbadge, Select } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

  const LIMIT = 8000, YELLOW = 5000;

  /* Hover tooltip wrapper for icon buttons — matches Mantine <Tooltip> in production. */
  function Tip({ label, children }) {
    return (
      <span className="tip">
        {children}
        <span className="tip-bubble" role="tooltip">{label}</span>
      </span>
    );
  }

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
    { value: 'sage-prod',     label: 'Sage — Production',    short: 'Sage Prod',    version: 7, status: 'Live',  color: 'green'  },
    { value: 'sage-staging',  label: 'Sage — Staging',       short: 'Sage Staging', version: 8, status: 'Draft', color: 'blue'   },
    { value: 'discovery',     label: 'Discovery Bot',        short: 'Discovery',    version: 3, status: 'Live',  color: 'violet' },
    { value: 'onboarding',    label: 'Onboarding Concierge', short: 'Onboarding',   version: 4, status: 'Live',  color: 'green'  },
    { value: 'billing',       label: 'Billing Support',      short: 'Billing',      version: 2, status: 'Draft', color: 'orange' },
    { value: 'returns',       label: 'Returns & Refunds',    short: 'Returns',      version: 5, status: 'Live',  color: 'blue'   },
    { value: 'enterprise',    label: 'Enterprise Desk',      short: 'Enterprise',   version: 1, status: 'Draft', color: 'violet' },
    { value: 'escalations',   label: 'Escalation Triage',    short: 'Escalation',   version: 6, status: 'Live',  color: 'red'    },
    { value: 'spanish',       label: 'Sage — Español',       short: 'Español',      version: 2, status: 'Draft', color: 'orange' },
    { value: 'sandbox',       label: 'Sandbox / QA',         short: 'Sandbox',      version: 9, status: 'Draft', color: 'red'    },
  ];
  const PS_BY_VALUE = Object.fromEntries(PROMPT_SETS.map((s) => [s.value, s]));
  window.PROMPT_SETS = window.PROMPT_SETS || PROMPT_SETS;

  /* ── Current Prompt Set picker — lives in the Blocks header ── */
  function PromptSetSelect({ promptSet, setPromptSet }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
    }, [open]);
    useEffect(() => { if (!open) setQ(''); }, [open]);
    const set = PROMPT_SETS.find((s) => s.value === promptSet) || PROMPT_SETS[0];
    // Search keeps the picker usable as the number of prompt sets grows.
    const showSearch = PROMPT_SETS.length > 6;
    const matches = PROMPT_SETS.filter((s) => !q.trim() || s.label.toLowerCase().includes(q.trim().toLowerCase()));
    return (
      <div className="ps-select" ref={ref}>
        <button className="ps-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
          <span className="ps-name">{set.label}</span>
          <span className={`ps-badge ${set.status === 'Live' ? 'live' : 'draft'}`}>{set.status}</span>
          <I.ChevronRight size={15} className={`ps-caret ${open ? 'open' : ''}`} />
        </button>
        {open && (
          <div className="ps-menu" role="listbox">
            {showSearch && (
              <div className="ps-search">
                <I.Search size={14} />
                <input autoFocus value={q} placeholder="Find a prompt set" onChange={(e) => setQ(e.target.value)} />
              </div>
            )}
            {matches.map((s) => (
              <button key={s.value} className={`ps-item ${s.value === promptSet ? 'on' : ''}`} role="option" aria-selected={s.value === promptSet} onClick={() => { setPromptSet(s.value); setOpen(false); }}>
                <span className="ps-item-name">{s.label}</span>
                <span className="ps-item-meta">v{s.version}</span>
                <span className={`ps-badge ${s.status === 'Live' ? 'live' : 'draft'}`}>{s.status}</span>
                <span className="ps-item-check">{s.value === promptSet ? <I.Check size={14} /> : null}</span>
              </button>
            ))}
            {matches.length === 0 && <div className="ps-nomatch">No prompt sets match.</div>}
          </div>
        )}
      </div>
    );
  }

  const PS_COLORS = { green: '#2d6a4f', blue: '#228be6', violet: '#7950f2', orange: '#fd7e14', red: '#fa5252' };

  /* ── Block filters ────────────────────────────────────────────────────────
     Replaces the old multi-select prompt-set filter. One prompt set is in view
     at a time (driven by the header "Current Prompt Set" picker), so a block
     table never mixes sets. What remains — Type, Status, free-text search — is
     presented three interchangeable ways (Tweak `filterLayout`):
       'bar'     — one unified search field with inline filter tokens + popover
       'rail'    — faceted left sidebar (Type / Status as count lists)
       'popover' — slim toolbar + a single "Filters" button with a count badge */

  function useOutside(ref, cb, active) {
    useEffect(() => {
      if (!active) return;
      const f = (e) => { if (ref.current && !ref.current.contains(e.target)) cb(); };
      document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
    }, [active]);
  }
  const typeColor = (t) => window.BLOCK_TYPE_COLORS[t];
  const typeDot = (t) => window.BLOCK_BADGE[window.BLOCK_TYPE_COLORS[t]].solid;

  /* Shared text search field (rail + popover layouts). */
  function SearchInput({ q, width = 300, placeholder = 'Search blocks' }) {
    return (
      <div className="search" style={{ maxWidth: width, flex: `1 1 ${Math.min(width, 240)}px` }}>
        <I.Search size={14} />
        <input value={q.query} placeholder={placeholder} onChange={(e) => q.setQuery(e.target.value)} />
        {q.query && <button className="clear" onClick={() => q.setQuery('')} aria-label="Clear"><I.X size={12} /></button>}
      </div>
    );
  }

  /* Result count + expand-all — same on every layout. */
  function ResultMeta({ filteredCount, totalCount, allExpanded, onToggleExpand }) {
    return (
      <div className="toolbar-counter">
        <span className="tc-count">{filteredCount} / {totalCount}</span>
        <button className="link-btn" onClick={onToggleExpand}>{allExpanded ? <I.ChevronsUp size={14} /> : <I.ChevronsDown size={14} />}{allExpanded ? 'Collapse all' : 'Expand all'}</button>
      </div>
    );
  }

  /* Removable token for an active Type / Status filter (bar + popover). */
  function FilterToken({ color, label, onClear }) {
    return (
      <span className={`ftoken c-${color}`}><span className="ftoken-dot" />{label}<button onClick={onClear} aria-label={`Remove ${label} filter`}><I.X size={11} /></button></span>
    );
  }

  /* ── Layout A: unified filter bar ── */
  function FilterBar({ q, typeCounts, statusCounts }) {
    const [pop, setPop] = useState(false);
    const ref = useRef(null);
    useOutside(ref, () => setPop(false), pop);
    const hasText = q.query.trim().length > 0;
    return (
      <div className="fbar">
        <div className="fbar-field">
          <I.Search size={15} />
          {q.typeFilter !== 'all' && <FilterToken color={typeColor(q.typeFilter)} label={window.BLOCK_TYPE_LABELS[q.typeFilter]} onClear={() => q.setTypeFilter('all')} />}
          {q.statusFilter !== 'all' && <FilterToken color={q.statusFilter === 'active' ? 'green' : 'gray'} label={q.statusFilter === 'active' ? 'Active' : 'Disabled'} onClear={() => q.setStatusFilter('all')} />}
          <input value={q.query} placeholder={(q.typeFilter !== 'all' || q.statusFilter !== 'all') ? 'Search…' : 'Search blocks by title or content'} onChange={(e) => q.setQuery(e.target.value)} />
          {hasText && <button className="clear" onClick={() => q.setQuery('')} aria-label="Clear search"><I.X size={13} /></button>}
          <div className="fbar-add" ref={ref}>
            <button className={`fadd-btn ${pop ? 'on' : ''}`} onClick={() => setPop((o) => !o)} aria-expanded={pop} aria-haspopup="menu"><I.Plus size={14} /> Filter</button>
            {pop && (
              <div className="fadd-menu" role="menu">
                <div className="fadd-group">
                  <div className="fadd-glabel">Type</div>
                  {window.ORDERED_BLOCK_TYPES.map((t) => (
                    <button key={t} className={`fadd-opt ${q.typeFilter === t ? 'on' : ''}`} onClick={() => { q.setTypeFilter(q.typeFilter === t ? 'all' : t); setPop(false); }}>
                      <span className="fadd-dot" style={{ background: typeDot(t) }} /><span className="fadd-name">{window.BLOCK_TYPE_LABELS[t]}</span><span className="fadd-count">{typeCounts[t] || 0}</span>{q.typeFilter === t && <I.Check size={13} />}
                    </button>
                  ))}
                </div>
                <div className="fadd-group">
                  <div className="fadd-glabel">Status</div>
                  {['active', 'disabled'].map((s) => (
                    <button key={s} className={`fadd-opt ${q.statusFilter === s ? 'on' : ''}`} onClick={() => { q.setStatusFilter(q.statusFilter === s ? 'all' : s); setPop(false); }}>
                      <span className={`fadd-sdot ${s}`} /><span className="fadd-name">{s === 'active' ? 'Active' : 'Disabled'}</span><span className="fadd-count">{statusCounts[s] || 0}</span>{q.statusFilter === s && <I.Check size={13} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Layout B: faceted rail ── */
  function FilterRail({ q, typeCounts, statusCounts, total }) {
    function Opt({ on, dot, sdot, name, count, onClick }) {
      return (
        <button className={`frail-opt ${on ? 'on' : ''}`} onClick={onClick}>
          {dot && <span className="frail-dot" style={{ background: dot }} />}
          {sdot && <span className={`fadd-sdot ${sdot}`} />}
          <span className="frail-name">{name}</span>
          <span className="frail-count">{count}</span>
        </button>
      );
    }
    return (
      <aside className="frail">
        <div className="frail-group">
          <div className="frail-glabel">Type</div>
          <Opt on={q.typeFilter === 'all'} name="All types" count={total} onClick={() => q.setTypeFilter('all')} />
          {window.ORDERED_BLOCK_TYPES.map((t) => (
            <Opt key={t} on={q.typeFilter === t} dot={typeDot(t)} name={window.BLOCK_TYPE_LABELS[t]} count={typeCounts[t] || 0} onClick={() => q.setTypeFilter(q.typeFilter === t ? 'all' : t)} />
          ))}
        </div>
        <div className="frail-group">
          <div className="frail-glabel">Status</div>
          <Opt on={q.statusFilter === 'all'} name="All" count={total} onClick={() => q.setStatusFilter('all')} />
          <Opt on={q.statusFilter === 'active'} sdot="active" name="Active" count={statusCounts.active || 0} onClick={() => q.setStatusFilter(q.statusFilter === 'active' ? 'all' : 'active')} />
          <Opt on={q.statusFilter === 'disabled'} sdot="disabled" name="Disabled" count={statusCounts.disabled || 0} onClick={() => q.setStatusFilter(q.statusFilter === 'disabled' ? 'all' : 'disabled')} />
        </div>
      </aside>
    );
  }

  /* ── Layout C: slim toolbar + Filters popover ── */
  function FilterPopover({ q, typeCounts, statusCounts }) {
    const [pop, setPop] = useState(false);
    const ref = useRef(null);
    useOutside(ref, () => setPop(false), pop);
    const active = (q.typeFilter !== 'all' ? 1 : 0) + (q.statusFilter !== 'all' ? 1 : 0);
    return (
      <div className="fpop-row">
        <SearchInput q={q} width={300} />
        <div className="fpop" ref={ref}>
          <button className={`fpop-btn ${active ? 'active' : ''} ${pop ? 'on' : ''}`} onClick={() => setPop((o) => !o)} aria-expanded={pop} aria-haspopup="menu">
            <I.Filter size={14} /> Filters{active > 0 && <span className="fpop-badge">{active}</span>}
          </button>
          {pop && (
            <div className="fpop-menu" role="menu">
              <div className="fpop-sec">
                <div className="fpop-seclabel">Type</div>
                <div className="chips">
                  <button className={`chip ${q.typeFilter === 'all' ? 'on c-gray' : ''}`} onClick={() => q.setTypeFilter('all')}>All</button>
                  {window.ORDERED_BLOCK_TYPES.map((t) => (
                    <button key={t} className={`chip ${q.typeFilter === t ? 'on c-' + typeColor(t) : ''}`} onClick={() => q.setTypeFilter(t)}>
                      <span className="chip-dot" style={{ background: typeDot(t) }} />{window.BLOCK_TYPE_LABELS[t]}<span className="chip-count">{typeCounts[t] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="fpop-sec">
                <div className="fpop-seclabel">Status</div>
                <div className="chips">
                  <button className={`chip ${q.statusFilter === 'all' ? 'on c-gray' : ''}`} onClick={() => q.setStatusFilter('all')}>All</button>
                  <button className={`chip ${q.statusFilter === 'active' ? 'on c-green' : ''}`} onClick={() => q.setStatusFilter('active')}>Active<span className="chip-count">{statusCounts.active || 0}</span></button>
                  <button className={`chip ${q.statusFilter === 'disabled' ? 'on c-gray' : ''}`} onClick={() => q.setStatusFilter('disabled')}>Disabled<span className="chip-count">{statusCounts.disabled || 0}</span></button>
                </div>
              </div>
              {active > 0 && <button className="fpop-clear" onClick={() => { q.setTypeFilter('all'); q.setStatusFilter('all'); }}>Clear all filters</button>}
            </div>
          )}
        </div>
        <div className="fpop-active">
          {q.typeFilter !== 'all' && <FilterToken color={typeColor(q.typeFilter)} label={window.BLOCK_TYPE_LABELS[q.typeFilter]} onClear={() => q.setTypeFilter('all')} />}
          {q.statusFilter !== 'all' && <FilterToken color={q.statusFilter === 'active' ? 'green' : 'gray'} label={q.statusFilter === 'active' ? 'Active' : 'Disabled'} onClear={() => q.setStatusFilter('all')} />}
        </div>
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

  /* ── Summary section + hide/show affordance (3 proven patterns via Tweaks) ──
     control: 'header' (button top-right of the panel) | 'handle' (centered pull-tab
     on the seam between summary and toolbar) | 'edge' (slim vertical tab on the
     right). Collapse animates via grid-rows. State persists in localStorage. */
  function SummarySection({ control, hidden, animate, onToggle, stats, children }) {
    const Up = I.ChevronsUp, Down = I.ChevronsDown;
    return (
      <div className={`summary-sec ctl-${control}`}>
        <div className={`summary-collapse ${animate ? 'anim' : ''} ${hidden ? 'closed' : ''}`} aria-hidden={hidden}>
          <div className="summary-collapse-in" style={{ maxHeight: hidden ? 0 : 760, transition: animate ? 'max-height 300ms cubic-bezier(0.4,0,0.2,1)' : 'none' }}>

            <div className="summary-rel">
              {children}
              {control === 'header' && (
                <button className="sum-ctl-btn sum-hide" onClick={onToggle} aria-expanded={!hidden}>
                  <Up size={14} /> Hide summary
                </button>
              )}
              {control === 'edge' && (
                <button className="sum-edge" onClick={onToggle} aria-expanded={!hidden} aria-label="Hide summary">
                  <Up size={15} /><span className="se-text">Hide</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {control === 'handle' && (
          <div className="sum-handle">
            <button onClick={onToggle} aria-expanded={!hidden}>
              {hidden ? <><Down size={14} /> Show summary</> : <><Up size={14} /> Hide</>}
            </button>
          </div>
        )}

        {hidden && control !== 'handle' && (
          <button className="sum-recall" onClick={onToggle} aria-label="Show summary">
            <span className="sr-label">Prompt summary</span>
            <span className="sr-stats">
              <span className="sr-stat"><span className={`sr-dot ${stats.live ? 'live' : 'draft'}`} />{stats.status}</span>
              <span className="sr-stat"><b>{stats.count}</b> active blocks</span>
              <span className="sr-stat"><b>{stats.tokens.toLocaleString()}</b> tokens</span>
            </span>
            <span className="sr-show"><Down size={14} /> Show summary</span>
          </button>
        )}
      </div>
    );
  }

  /* (Toolbar replaced by FilterBar / FilterRail / FilterPopover layouts above.) */

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
  function Row({ block, selected, expanded, maxTok, showSet, onSel, onToggleStatus, onToggleExpand, onEdit, onCopy, copied }) {
    const tok = window.tokensFor(block.body);
    const barPct = maxTok > 0 ? (tok / maxTok) * 100 : 0;
    const ps = PS_BY_VALUE[block.prompt_set];
    return (
      <>
        <tr className="brow">
          <td style={{ width: 40 }}><button className={`checkbox ${selected ? 'on' : ''}`} onClick={() => onSel(block.id)} aria-label="Select">{selected ? <I.Check size={13} stroke={3} /> : null}</button></td>
          <td style={{ width: 28 }}><Tip label={expanded ? 'Collapse' : 'Expand'}><button className="actionicon" onClick={() => onToggleExpand(block.id)} aria-label="Expand"><I.ChevronRight size={14} className={`chev ${expanded ? 'open' : ''}`} /></button></Tip></td>
          <td>
            <div className="block-title"><span className="order-prefix">{orderPrefix(block.order)}</span>{block.title}{showSet && ps && <span className={`set-pill c-${ps.color}`}><span className="set-pill-dot" style={{ background: PS_COLORS[ps.color] }} />{ps.short}</span>}</div>
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
              <Tip label={copied ? 'Copied!' : 'Copy body'}><button className="actionicon" onClick={() => onCopy(block)} aria-label="Copy body" style={{ color: copied ? 'var(--green-6)' : undefined }}>{copied ? <I.Check size={16} /> : <I.Clipboard size={16} />}</button></Tip>
              <Tip label="Edit"><button className="actionicon" onClick={() => onEdit(block)} aria-label="Edit"><I.Pencil size={16} /></button></Tip>
              <Tip label="Duplicate"><button className="actionicon" aria-label="Duplicate"><I.Copy size={16} /></button></Tip>
              <Tip label="Delete"><button className="actionicon" aria-label="Delete" style={{ color: 'var(--red-6)' }}><I.Trash size={16} /></button></Tip>
            </div>
          </td>
        </tr>
        {expanded && (
          <tr><td /><td /><td colSpan={5}><ExpandPanel block={block} onEdit={() => onEdit(block)} /></td></tr>
        )}
      </>
    );
  }

  function Blocks({ notify, summaryControl = 'header', summaryStartHidden = false, summaryAnimate = true, filterLayout = 'bar' }) {
    const [items, setItems] = useState(window.BLOCKS);
    const [promptSet, setPromptSet] = useState('sage-prod');
    const [selected, setSelected] = useState(new Set());
    const [expanded, setExpanded] = useState(new Set());
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [copiedId, setCopiedId] = useState(null);
    // One prompt set is in view at a time — driven by the header "Current Prompt Set" picker,
    // so a block table never mixes sets. Facet counts are scoped to that set.
    const showSet = false;
    const inSet = items.filter((b) => b.prompt_set === promptSet);
    const typeCounts = {}; for (const b of inSet) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
    const statusCounts = { active: 0, disabled: 0 }; for (const b of inSet) statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;

    // Summary hide/show — seed from localStorage, fall back to the Start-hidden tweak.
    const [summaryHidden, setSummaryHidden] = useState(() => {
      try { const v = localStorage.getItem('blocks.summaryHidden'); if (v !== null) return v === '1'; } catch (e) {}
      return !!summaryStartHidden;
    });
    function toggleSummary() {
      setSummaryHidden((h) => { const n = !h; try { localStorage.setItem('blocks.summaryHidden', n ? '1' : '0'); } catch (e) {} return n; });
    }
    // Let the Start-hidden tweak drive the view live (but not clobber localStorage on mount).
    const firstRun = useRef(true);
    useEffect(() => { if (firstRun.current) { firstRun.current = false; return; } setSummaryHidden(!!summaryStartHidden); }, [summaryStartHidden]);

    // Overview / donut measure the CURRENT (header) prompt set's compiled reality.
    const activeBlocks = items.filter((b) => b.status === 'active' && b.prompt_set === promptSet);
    const filtered = items.filter((b) => {
      if (b.prompt_set !== promptSet) return false;
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

    const summarySet = PROMPT_SETS.find((s) => s.value === promptSet) || PROMPT_SETS[0];
    const summaryTokens = activeBlocks.reduce((s, b) => s + window.tokensFor(b.body), 0);
    const summaryStats = { status: summarySet.status, live: summarySet.status === 'Live', count: activeBlocks.length, tokens: summaryTokens };

    const filt = { query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter };
    const meta = <ResultMeta filteredCount={filtered.length} totalCount={inSet.length} allExpanded={allExpanded} onToggleExpand={onToggleExpandAll} />;
    const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || query.trim().length > 0;

    const bulkBar = selected.size > 0 ? (
      <div className="bulkbar" style={{ marginBottom: 16 }}>
        <span className="bb-count">{selected.size} selected</span>
        <div className="bb-actions">
          <button className="btn btn-sm btn-white" onClick={() => { setItems((it) => it.map((b) => selected.has(b.id) ? { ...b, status: 'active' } : b)); setSelected(new Set()); }}>Enable</button>
          <button className="btn btn-sm btn-white" onClick={() => { setItems((it) => it.map((b) => selected.has(b.id) ? { ...b, status: 'disabled' } : b)); setSelected(new Set()); }}>Disable</button>
          <button className="btn btn-sm btn-white danger" onClick={() => { setItems((it) => it.filter((b) => !selected.has(b.id))); setSelected(new Set()); }}>Delete</button>
          <button className="bb-clear" onClick={() => setSelected(new Set())} aria-label="Clear"><I.X size={15} /></button>
        </div>
      </div>
    ) : null;

    const tableBody = filtered.length === 0 ? (
      <div className="blocks-empty">
        <div className="blocks-empty-title">No blocks to show</div>
        <div className="blocks-empty-body">{inSet.length === 0 ? `“${summarySet.label}” has no blocks yet.` : 'No blocks in this set match your filters.'}</div>
        {hasFilters && inSet.length > 0 && <button className="link-btn" onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setQuery(''); }}>Clear filters</button>}
        {inSet.length === 0 && <button className="btn btn-sm" style={{ marginTop: 4 }}>New block</button>}
      </div>
    ) : (
      <>
        <div className="table-wrap only-desktop">
          <table className="blocks">
            <thead><tr>
              <th style={{ width: 40 }}><button className={`checkbox ${allSel ? 'on' : filteredSel > 0 ? 'ind' : ''}`} onClick={toggleSelAll} aria-label="Select all">{allSel ? <I.Check size={13} stroke={3} /> : filteredSel > 0 ? <span className="bar-ind" /> : null}</button></th>
              <th style={{ width: 28 }} aria-hidden></th><th>Title</th><th>Type</th><th>Tokens</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((b) => (
                <Row key={b.id} block={b} selected={selected.has(b.id)} expanded={expanded.has(b.id)} maxTok={maxTok} showSet={showSet} copied={copiedId === b.id}
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
      </>
    );

    return (
      <div className="screen" data-screen-label="Admin · Blocks">
        <div className="screen-headbar">
          <div className="hb-promptset">
            <span className="hb-ps-label">Current Prompt Set</span>
            <PromptSetSelect promptSet={promptSet} setPromptSet={setPromptSet} />
          </div>
        </div>
        <div className="screen-scroll blocks-scroll">
          <SummarySection control={summaryControl} hidden={summaryHidden} animate={summaryAnimate} onToggle={toggleSummary} stats={summaryStats}>
            <Overview
              blocks={activeBlocks}
              promptSet={promptSet}
              setPromptSet={setPromptSet}
              onNewBlock={() => {}}
              onPublish={() => notify && notify({ title: 'Prompt published', message: 'Version ' + (window.MASTER_PROMPT_VERSION + 1) })}
            />
          </SummarySection>

          {filterLayout === 'rail' ? (
            <div className="blocks-railwrap">
              <FilterRail q={filt} typeCounts={typeCounts} statusCounts={statusCounts} total={inSet.length} />
              <div className="blocks-railmain">
                <div className="blocks-sticky railbar">
                  <SearchInput q={filt} width={360} placeholder="Search blocks in this set" />
                  {meta}
                </div>
                {bulkBar}
                {tableBody}
              </div>
            </div>
          ) : (
            <>
              <div className="blocks-sticky">
                <div className="fl-toprow">
                  {filterLayout === 'popover'
                    ? <FilterPopover q={filt} typeCounts={typeCounts} statusCounts={statusCounts} />
                    : <FilterBar q={filt} typeCounts={typeCounts} statusCounts={statusCounts} />}
                  {meta}
                </div>
              </div>
              {bulkBar}
              {tableBody}
            </>
          )}
        </div>
      </div>
    );
  }

  window.Screens.Blocks = Blocks;
})();
