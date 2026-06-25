/* Platform Settings screen — /platform/settings.
   One field for now: Master Prompt — a cross-tenant prompt-set picker that marks one
   set as the platform master (the system prompt powering every tenant's Composer when
   building blocks). Reuses the Composer/Blocks `.ps-*` picker pattern, widened to span
   tenants (tenant name per option + search). Save confirms — not auto-save.
   Exposed on window.Screens.PlatformSettings. See design_handoff_platform_settings/. */
(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const I = window.Icons;

  /* All prompt sets across every tenant the platform admin can see. In production:
     GET /api/platform/prompt-sets. id is the value persisted as the master pointer. */
  const ALL_SETS = [
    { id: 'sage-prod',   label: 'Sage — Production',  tenant: 'Sage',               status: 'Live',  version: 7 },
    { id: 'sage-stage',  label: 'Sage — Staging',     tenant: 'Sage',               status: 'Draft', version: 8 },
    { id: 'acme-disc',   label: 'Discovery Bot',      tenant: 'Acme Coaching',      status: 'Live',  version: 3 },
    { id: 'river-conc',  label: 'Concierge',          tenant: 'Riverside Wellness', status: 'Live',  version: 5 },
    { id: 'summit-list', label: 'Listings Assistant', tenant: 'Summit Realty',      status: 'Draft', version: 2 },
    { id: 'heir-guide',  label: 'Heirloom Guide',     tenant: 'Heirloom',           status: 'Live',  version: 4 },
    { id: 'ledger-help', label: 'Ledger Helpdesk',    tenant: 'Ledger',             status: 'Draft', version: 1 },
  ];

  /* Current master pointer. In production: GET /api/platform/settings/master-prompt. */
  const INITIAL_MASTER = { promptSetId: 'sage-prod', setByName: 'Jeff Lougheed', setAt: 'Jun 12, 2026' };

  function StatusBadge({ status }) {
    return <span className={`ps-badge ${status === 'Live' ? 'live' : 'draft'}`}>{status}</span>;
  }

  function DoubleCheck() {
    return (
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1 13l4 4L13 7" /><path d="M9 17L19.5 6" />
      </svg>
    );
  }

  /* ── The cross-tenant picker — same .ps-* chrome as the Composer, + tenant + search ── */
  function MasterPromptPicker({ options, selectedId, masterId, onSelect, disabled }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
      if (!open) return;
      const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const selected = options.find((o) => o.id === selectedId) || null;
    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter((o) => o.label.toLowerCase().includes(q) || o.tenant.toLowerCase().includes(q));
    }, [options, query]);

    return (
      <div className="ps-select mp-select" ref={ref}>
        <button className="ps-trigger mp-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {selected ? (
            <span className="mp-trig-label">
              <span className="ps-name">{selected.label}</span>
              <span className="mp-dot" aria-hidden>·</span>
              <span className="mp-tenant">{selected.tenant}</span>
              <StatusBadge status={selected.status} />
            </span>
          ) : (
            <span className="mp-placeholder">Select a prompt set…</span>
          )}
          <I.ChevronRight size={15} className={`ps-caret ${open ? 'open' : ''}`} />
        </button>

        {open && (
          <div className="ps-menu mp-menu" role="listbox">
            <div className="mp-search">
              <I.Search size={15} />
              <input autoFocus value={query} placeholder="Search prompt set or tenant…" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }} />
            </div>
            <div className="mp-list">
              {filtered.length === 0 ? (
                <div className="mp-nomatch">No matching prompt sets</div>
              ) : filtered.map((o) => (
                <button key={o.id} className={`ps-item mp-item ${o.id === selectedId ? 'on' : ''}`} role="option" aria-selected={o.id === selectedId} onClick={() => { onSelect(o.id); setOpen(false); setQuery(''); }}>
                  <span className="ps-item-name">{o.label}</span>
                  <span className="mp-sep" aria-hidden>·</span>
                  <span className="mp-item-tenant">{o.tenant}</span>
                  <span className="mp-item-version">v{o.version}</span>
                  <StatusBadge status={o.status} />
                  {o.id === masterId && <span className="mp-master-badge">Master</span>}
                  <span className={`ps-item-check ${o.id === masterId ? 'mp-check-master' : ''}`}>
                    {o.id === masterId ? <DoubleCheck /> : (o.id === selectedId ? <I.Check size={14} /> : null)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function PlatformSettings({ notify }) {
    // Toggle this to [] to preview the empty state.
    const [options] = useState(ALL_SETS);
    const [master, setMaster] = useState(INITIAL_MASTER);
    const [pending, setPending] = useState(INITIAL_MASTER.promptSetId);
    const [saving, setSaving] = useState(false);

    const isEmpty = options.length === 0;
    const dirty = pending !== master.promptSetId;
    const current = options.find((o) => o.id === master.promptSetId) || null;

    function save() {
      if (!dirty || pending == null) return;
      setSaving(true);
      const picked = options.find((o) => o.id === pending);
      setTimeout(() => {
        setMaster({ promptSetId: pending, setByName: 'Jeff Lougheed', setAt: 'Jun 24, 2026' });
        setSaving(false);
        notify && notify({ title: 'Master prompt updated', message: `${picked.label} · ${picked.tenant} is now the platform master.` });
      }, 650);
    }

    return (
      <div className="stack-lg" data-screen-label="Platform · Settings">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Platform-wide configuration.</p>
        </div>

        <section className="mp-card">
          <div className="mp-field-head">
            <h2 className="mp-field-label">Master Prompt</h2>
            <p className="mp-field-help">
              The system prompt that powers every tenant&rsquo;s Composer when building blocks.
              The set you mark here is compiled and sent as the master system prompt platform-wide.
            </p>
          </div>

          {isEmpty ? (
            <div className="mp-empty">
              <p className="mp-empty-title">No prompt sets yet.</p>
              <p className="mp-empty-body">Create a prompt set in any tenant&rsquo;s Composer, then return here to mark it as the platform master.</p>
            </div>
          ) : (
            <>
              <div className="mp-current">
                {current ? (
                  <>
                    <span className="mp-current-dot" aria-hidden />
                    <span className="mp-current-text">
                      <span className="mp-current-muted">Current master</span>
                      <span className="mp-sep" aria-hidden>·</span>
                      <strong>{current.label}</strong>
                      <span className="mp-sep" aria-hidden>·</span>
                      <span className="mp-tenant">{current.tenant}</span>
                      <StatusBadge status={current.status} />
                    </span>
                    {master.setByName && (
                      <span className="mp-current-stamp">Set by {master.setByName}{master.setAt ? ` · ${master.setAt}` : ''}</span>
                    )}
                  </>
                ) : (
                  <span className="mp-nomaster">No master set yet</span>
                )}
              </div>

              <div className="mp-control">
                <MasterPromptPicker options={options} selectedId={pending} masterId={master.promptSetId} onSelect={setPending} disabled={saving} />
              </div>

              <div className="mp-saverow">
                <button className="btn btn-filled" disabled={!dirty || pending == null || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {dirty && !saving && <button className="mp-cancel" onClick={() => setPending(master.promptSetId)}>Cancel</button>}
                {dirty && !saving && <span className="mp-dirty">Unsaved change</span>}
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  window.Screens = window.Screens || {};
  window.Screens.PlatformSettings = PlatformSettings;
})();
