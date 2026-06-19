/* Platform Tenants screen + Products/Usage coming-soon — ported verbatim from
   platform-production/app.jsx so the combined shell can render it as a Screen.
   Exposed on window.Screens.Tenants / .Products / .Usage. */
(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const { ChevronRight, Plus, Trash, Alert, Search, X } = window.Icons;
  window.Screens = window.Screens || {};

  /* ── slugify — mirrors the server SLUG_RE ─────────────────────────── */
  function slugify(input) {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* ── Badge (tenant type) ──────────────────────────────────────────── */
  function TypeBadge({ type, size }) {
    if (!type) return <span className="dim">—</span>;
    const c = window.BADGE_COLORS[window.typeColor(type)];
    return (
      <span className="badge" style={{ background: c.bg, color: c.fg, height: size === 'sm' ? 18 : 20 }}>
        {type}
      </span>
    );
  }

  /* ── Custom Select (Mantine look: searchable / clearable) ─────────── */
  function Select({ label, placeholder, description, data, value, onChange, required, error, searchable, clearable, nothingFound = 'Nothing found' }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);
    const selected = data.find((d) => d.value === value);

    useEffect(() => {
      if (!open) return;
      const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const filtered = searchable && q
      ? data.filter((d) => d.label.toLowerCase().includes(q.toLowerCase()))
      : data;

    return (
      <div className="field">
        {label && <label>{label}{required && <span className="req">*</span>}</label>}
        <div className="select" ref={ref}>
          <div
            className={`select-trigger ${open ? 'open' : ''} ${error ? 'err' : ''}`}
            tabIndex={0}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
          >
            {selected ? <span className="val">{selected.label}</span> : <span className="ph">{placeholder}</span>}
            <span className="right">
              {clearable && selected && (
                <button type="button" className="select-clear" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onChange(null); }} aria-label="Clear">
                  <X size={13} />
                </button>
              )}
              <ChevronRight size={15} className="chev" style={{ transform: open ? 'rotate(90deg)' : 'rotate(90deg) scaleX(-1)' }} />
            </span>
          </div>
          {open && (
            <div className="dropdown">
              {searchable && (
                <div className="search-row">
                  <Search size={14} />
                  <input autoFocus value={q} placeholder="Search" onChange={(e) => setQ(e.target.value)} />
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="option empty">{nothingFound}</div>
              ) : filtered.map((d) => (
                <div
                  key={d.value}
                  className={`option ${d.value === value ? 'sel' : ''}`}
                  onClick={() => { onChange(d.value); setOpen(false); setQ(''); }}
                >
                  {d.label}
                </div>
              ))}
            </div>
          )}
        </div>
        {description && !error && <div className="desc">{description}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  /* ── TextInput ────────────────────────────────────────────────────── */
  function TextInput({ label, placeholder, description, value, onChange, required, error, autoFocus }) {
    return (
      <div className="field">
        {label && <label>{label}{required && <span className="req">*</span>}</label>}
        <input
          className={`input ${error ? 'err' : ''}`}
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        {description && !error && <div className="desc">{description}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  /* ── Button ───────────────────────────────────────────────────────── */
  function Button({ children, variant = 'filled', color, leftSection, loading, disabled, onClick }) {
    let cls = 'btn ';
    if (variant === 'filled') cls += color === 'red' ? 'btn-danger' : 'btn-filled';
    else if (variant === 'subtle') cls += 'btn-subtle' + (color === 'red' ? ' red' : '');
    return (
      <button className={cls} onClick={onClick} disabled={disabled || loading}>
        {loading ? <span className="spin" /> : leftSection}
        {children}
      </button>
    );
  }

  /* ── Tree flattening (verbatim logic from useVisibleNodes) ────────── */
  function useVisibleNodes(tenants, expandedIds) {
    return useMemo(() => {
      const ids = new Set(tenants.map((t) => t.id));
      const childrenByParent = new Map();
      for (const t of tenants) {
        const pid = t.parent_id && ids.has(t.parent_id) ? t.parent_id : null;
        if (pid) {
          const arr = childrenByParent.get(pid) ?? [];
          arr.push(t);
          childrenByParent.set(pid, arr);
        }
      }
      const roots = tenants.filter((t) => !(t.parent_id && ids.has(t.parent_id)));
      const out = [];
      const walk = (node, depth) => {
        const kids = childrenByParent.get(node.id) ?? [];
        out.push({ tenant: node, depth, childCount: kids.length });
        if (expandedIds.has(node.id)) for (const k of kids) walk(k, depth + 1);
      };
      for (const r of roots) walk(r, 0);
      return out;
    }, [tenants, expandedIds]);
  }

  /* ── New / Edit modal (shared form) ───────────────────────────────── */
  function TenantModal({ mode, tenant, tenants, onClose, onSave, onDelete }) {
    const [name, setName] = useState(tenant ? tenant.name : '');
    const [type, setType] = useState(tenant ? tenant.type : null);
    const [parentId, setParentId] = useState(tenant ? tenant.parent_id : null);
    const [slug, setSlug] = useState(tenant ? (tenant.slug ?? '') : '');
    const [slugEdited, setSlugEdited] = useState(false);
    const [domain, setDomain] = useState(tenant ? (tenant.domain ?? '') : '');
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [errors, setErrors] = useState({});

    const parentOptions = tenants
      .filter((t) => !tenant || t.id !== tenant.id)
      .map((t) => ({ value: t.id, label: t.name }));

    function onName(v) {
      setName(v);
      if (mode === 'new' && !slugEdited) setSlug(slugify(v));
    }
    function onSlug(v) { setSlugEdited(true); setSlug(slugify(v)); }

    function validate() {
      const next = {};
      if (name.trim().length === 0) next.name = 'Name is required';
      if (!type) next.type = 'Type is required';
      if (slug.trim().length === 0) next.slug = 'Slug is required';
      setErrors(next);
      return Object.keys(next).length === 0;
    }

    function handleSave() {
      if (!validate()) return;
      setSaving(true);
      setTimeout(() => {
        onSave({
          id: tenant ? tenant.id : slug.trim() || `t-${Date.now()}`,
          parent_id: parentId,
          name: name.trim(),
          type,
          slug: slug.trim(),
          domain: domain.trim() || null,
        });
        setSaving(false);
      }, 280);
    }

    return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-head">
            <span className="modal-title">{mode === 'new' ? 'New tenant' : 'Edit tenant'}</span>
            <button className="modal-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="modal-body">
            <TextInput label="Name" placeholder="Acme Coaching" required value={name} onChange={onName} error={errors.name} autoFocus />
            <Select label="Type" placeholder="Select a type" required data={window.TENANT_TYPES} value={type} onChange={setType} error={errors.type} />
            <Select
              label="Parent tenant" placeholder="None (top-level)"
              description="Optional — leave empty for a top-level tenant."
              data={parentOptions} value={parentId} onChange={setParentId}
              searchable clearable nothingFound="No tenants"
            />
            <TextInput
              label="Slug" placeholder="acme-coaching" required value={slug} onChange={onSlug} error={errors.slug}
              description={mode === 'new' ? 'Auto-generated from the name. Lowercase letters, numbers, and hyphens.' : 'Lowercase letters, numbers, and hyphens.'}
            />
            <TextInput
              label="Domain" placeholder="acme.com" value={domain} onChange={setDomain} error={errors.domain}
              description="Optional — leave blank for a subdomain off 2bl.ai."
            />

            {mode === 'new' ? (
              <div className="group-end" style={{ marginTop: 4 }}>
                <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={handleSave} loading={saving}>Create tenant</Button>
              </div>
            ) : (
              <div className="group-between" style={{ marginTop: 4 }}>
                <Button variant="subtle" color="red" leftSection={<Trash size={16} />} onClick={() => setConfirming(true)} disabled={saving}>Delete</Button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>Cancel</Button>
                  <Button onClick={handleSave} loading={saving}>Save changes</Button>
                </div>
              </div>
            )}

            {confirming && (
              <>
                <div className="divider" />
                <div className="alert">
                  <span className="a-icon"><Alert size={18} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="a-title">Delete this tenant?</div>
                    <div className="a-body">
                      This permanently removes <strong>{tenant.name}</strong>. This cannot be undone.
                      <div className="group-end" style={{ marginTop: 12 }}>
                        <Button variant="subtle" color="gray" onClick={() => setConfirming(false)}>Cancel</Button>
                        <Button color="red" onClick={() => onDelete(tenant)}>Delete tenant</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Tenant list (table + tree) ───────────────────────────────────── */
  function TenantList({ tenants, onNew, onEdit }) {
    const [expandedIds, setExpandedIds] = useState(new Set(['sbl', 'sage']));
    const visible = useVisibleNodes(tenants, expandedIds);

    function toggle(id) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }

    return (
      <>
        <div className="row-end">
          <Button leftSection={<Plus size={16} />} onClick={onNew}>New tenant</Button>
        </div>

        <div className="table-wrap only-desktop">
          <table className="tenants">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Domain</th><th>Slug</th></tr>
            </thead>
            <tbody>
              {visible.map(({ tenant, depth, childCount }) => {
                const expanded = expandedIds.has(tenant.id);
                return (
                  <tr
                    key={tenant.id}
                    role="button" tabIndex={0}
                    aria-label={`Edit ${tenant.name}`}
                    onClick={() => onEdit(tenant)}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdit(tenant); } }}
                  >
                    <td>
                      <div className="name-cell" style={{ paddingLeft: depth * 20 }}>
                        <span className="chev-box">
                          {childCount > 0 && (
                            <button
                              className="actionicon"
                              aria-label={expanded ? `Collapse ${tenant.name}` : `Expand ${tenant.name}`}
                              aria-expanded={expanded}
                              onClick={(e) => { e.stopPropagation(); toggle(tenant.id); }}
                            >
                              <ChevronRight size={16} className={`chev ${expanded ? 'open' : ''}`} />
                            </button>
                          )}
                        </span>
                        <span className="nm">{tenant.name}</span>
                        {childCount > 0 && <span className="child-count">({childCount})</span>}
                      </div>
                    </td>
                    <td><TypeBadge type={tenant.type} /></td>
                    <td>{tenant.domain ? tenant.domain : <span className="dim">—</span>}</td>
                    <td>{tenant.slug ? tenant.slug : <span className="dim">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: card stack */}
        <div className="only-mobile">
          <div className="card-stack">
            {visible.map(({ tenant, depth, childCount }) => {
              const expanded = expandedIds.has(tenant.id);
              return (
                <div
                  key={tenant.id}
                  className="t-card"
                  role="button" tabIndex={0}
                  aria-label={`Edit ${tenant.name}`}
                  style={{ marginLeft: depth * 14 }}
                  onClick={() => onEdit(tenant)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdit(tenant); } }}
                >
                  <div className="tc-top">
                    <div className="tc-id">
                      <span className="tc-name">{tenant.name}</span>
                      <TypeBadge type={tenant.type} size="sm" />
                    </div>
                    {childCount > 0 && (
                      <button
                        className="actionicon"
                        aria-label={expanded ? `Collapse ${tenant.name}` : `Expand ${tenant.name} (${childCount})`}
                        aria-expanded={expanded}
                        onClick={(e) => { e.stopPropagation(); toggle(tenant.id); }}
                      >
                        <ChevronRight size={18} className={`chev ${expanded ? 'open' : ''}`} />
                      </button>
                    )}
                  </div>
                  <div className="tc-sub">
                    {tenant.domain ?? 'No domain'}{tenant.slug ? ` · ${tenant.slug}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  /* ── Tenants screen (owns tenant state + modal) ───────────────────── */
  function Tenants({ notify }) {
    const [tenants, setTenants] = useState(window.TENANTS);
    const [modal, setModal] = useState(null); // {mode:'new'} | {mode:'edit', tenant}

    function commitTenants(next) {
      setTenants([...next].sort((a, b) => a.name.localeCompare(b.name)));
    }

    function handleSave(t) {
      const exists = tenants.some((x) => x.id === t.id);
      if (exists) {
        commitTenants(tenants.map((x) => (x.id === t.id ? t : x)));
        notify({ color: 'green', title: 'Tenant updated', message: `${t.name} saved.` });
      } else {
        commitTenants([...tenants, t]);
        notify({ color: 'green', title: 'Tenant created', message: `${t.name} is ready.` });
      }
      setModal(null);
    }

    function handleDelete(t) {
      const drop = new Set([t.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const x of tenants) {
          if (x.parent_id && drop.has(x.parent_id) && !drop.has(x.id)) { drop.add(x.id); grew = true; }
        }
      }
      commitTenants(tenants.filter((x) => !drop.has(x.id)));
      notify({ color: 'green', title: 'Tenant deleted', message: `${t.name} was removed.` });
      setModal(null);
    }

    return (
      <>
        <div className="stack-lg" data-screen-label="Platform · Tenants">
          <div>
            <h1 className="page-title">Tenants</h1>
            <p className="page-sub">Every tenant on the platform, grouped by parent.</p>
          </div>
          <TenantList
            tenants={tenants}
            onNew={() => setModal({ mode: 'new' })}
            onEdit={(t) => setModal({ mode: 'edit', tenant: t })}
          />
        </div>

        {modal && (
          <TenantModal
            mode={modal.mode}
            tenant={modal.tenant}
            tenants={tenants}
            onClose={() => setModal(null)}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </>
    );
  }

  /* ── Coming-soon page ─────────────────────────────────────────────── */
  function ComingSoon({ title }) {
    return (
      <div className="coming">
        <h1>{title}</h1>
        <p>Coming soon.</p>
      </div>
    );
  }

  window.Screens.Tenants = Tenants;
  window.Screens.Products = () => <ComingSoon title="Products" />;
  window.Screens.Usage = () => <ComingSoon title="Usage" />;
})();
