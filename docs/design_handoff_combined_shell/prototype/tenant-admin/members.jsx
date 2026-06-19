/* Members management page — user-centric (one row per user, many tenant memberships).
   Self-contained; receives a `notify(toast)` callback from App. */
(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const I = window.Icons;

  /* ── Checkbox ─────────────────────────────────────────────────────── */
  function Checkbox({ checked, indeterminate, onChange, label }) {
    return (
      <button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} aria-label={label}
        className={`checkbox ${indeterminate ? 'ind' : checked ? 'on' : ''}`}
        onClick={(e) => { e.stopPropagation(); onChange(); }}>
        {indeterminate ? <span className="bar-ind" /> : checked ? <I.Check size={13} stroke={3} /> : null}
      </button>
    );
  }

  /* ── Lightweight Select (role editor) ─────────────────────────────── */
  function Select({ data, value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const selected = data.find((d) => d.value === value);
    useEffect(() => {
      if (!open) return;
      const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    return (
      <div className="select" ref={ref}>
        <div className={`select-trigger ${open ? 'open' : ''}`} tabIndex={0} onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}>
          <span className="val">{selected ? selected.label : 'Select'}</span>
          <span className="right"><I.ChevronRight size={15} style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }} /></span>
        </div>
        {open && (
          <div className="dropdown">
            {data.map((d) => (
              <div key={d.value} className={`option ${d.value === value ? 'sel' : ''}`}
                onClick={() => { onChange(d.value); setOpen(false); }}>{d.label}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Row action menu ──────────────────────────────────────────────── */
  function Menu({ items }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const ref = useRef(null);
    const btnRef = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
      const onScroll = () => setOpen(false);
      document.addEventListener('mousedown', onDoc);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      return () => {
        document.removeEventListener('mousedown', onDoc);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
      };
    }, [open]);
    function toggle(e) {
      e.stopPropagation();
      if (!open && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
      }
      setOpen((o) => !o);
    }
    return (
      <div className="menu">
        <button ref={btnRef} className="kebab" aria-label="Member actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <I.Dots size={18} />
        </button>
        {open && pos && (
          <div className="menu-dd" role="menu" ref={ref} style={{ position: 'fixed', top: pos.top, right: pos.right }} onClick={(e) => e.stopPropagation()}>
            {items.map((it, i) =>
              it.type === 'sep' ? <div key={i} className="menu-sep" /> :
              it.type === 'label' ? <div key={i} className="menu-label">{it.label}</div> : (
                <button key={i} role="menuitem" className={`menu-item ${it.danger ? 'danger' : ''}`}
                  onClick={() => { setOpen(false); it.onClick(); }}>
                  <span className="mi-icon">{it.icon}</span>{it.label}
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  function Badge({ cfg, size }) {
    return <span className="badge" style={{ background: cfg.bg, color: cfg.fg, height: size === 'sm' ? 18 : 20 }}>{cfg.label}</span>;
  }

  /* ── Tenant membership pills (up to 3 + "+N more") ────────────────── */
  function TenantPills({ memberships }) {
    const names = memberships.map((m) => m.tenant);
    const shown = names.slice(0, 3);
    const extra = names.length - shown.length;
    return (
      <div className="pills">
        {shown.map((n) => <span key={n} className="pill" title={n}>{n}</span>)}
        {extra > 0 && <span className="pill more">+{extra} more</span>}
      </div>
    );
  }

  /* ── Member detail drawer — one section per tenant membership ─────── */
  function DetailDrawer({ user, onClose, onSaveRoles }) {
    const [roles, setRoles] = useState(user.memberships.map((m) => m.role));
    const av = window.avatarColor(user.id);
    const dirty = roles.some((r, i) => r !== user.memberships[i].role);
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <div className="drawer-right" role="dialog" aria-modal="true" aria-label={`${user.name} details`}>
          <div className="detail-head">
            <span className="av-lg" style={{ background: av.bg, color: av.fg }}>{window.initials(user.name)}</span>
            <span className="dh-meta">
              <span className="dh-name">{user.name}</span>
              <div className="dh-mail">{user.email}</div>
            </span>
            <button className="modal-x" onClick={onClose} aria-label="Close"><I.X size={18} /></button>
          </div>

          <div className="drawer-body">
            {user.memberships.map((m, i) => (
              <div className="tenant-section" key={m.tenant}>
                <div className="ts-head">
                  <span className="ts-rule" />
                  <span className="ts-name">{m.tenant}</span>
                  <span className="ts-rule" />
                </div>
                <div className="def-grid">
                  <div className="dk">Status</div><div className="dv"><Badge cfg={window.STATUS_BADGE[m.status]} size="sm" /></div>
                  <div className="dk">Plan</div><div className="dv"><Badge cfg={window.PLAN_BADGE[m.plan]} size="sm" /></div>
                  <div className="dk">Joined</div><div className="dv">{m.joined}</div>
                  <div className="dk">Last active</div><div className="dv">{m.lastActive}</div>
                </div>
                <div className="field">
                  <label>Role</label>
                  <Select data={window.ROLE_OPTIONS} value={roles[i]}
                    onChange={(v) => setRoles((prev) => prev.map((r, j) => (j === i ? v : r)))} />
                </div>
              </div>
            ))}
          </div>

          <div className="drawer-foot">
            <button className="btn btn-subtle" onClick={onClose}>Cancel</button>
            <button className="btn btn-filled" disabled={!dirty} onClick={() => onSaveRoles(user.id, roles)}>Save changes</button>
          </div>
        </div>
      </>
    );
  }

  const STATUS_ORDER = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'invited', label: 'Invited' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'deleted', label: 'Deleted' },
  ];

  // Aggregate status for the list column / row actions: prefer the primary membership,
  // but if every membership is deleted the user reads as deleted.
  function primaryStatus(u) {
    if (u.memberships.every((m) => m.status === 'deleted')) return 'deleted';
    return u.memberships[0].status;
  }

  function MembersPage({ notify }) {
    const [users, setUsers] = useState(window.USERS);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState(new Set());
    const [detail, setDetail] = useState(null); // user id

    const counts = useMemo(() => {
      const c = { all: users.length, active: 0, invited: 0, suspended: 0, deleted: 0 };
      for (const u of users) {
        const seen = new Set(u.memberships.map((m) => m.status));
        for (const s of ['active', 'invited', 'suspended', 'deleted']) if (seen.has(s)) c[s]++;
      }
      return c;
    }, [users]);

    const visible = useMemo(() => {
      const q = query.trim().toLowerCase();
      return users.filter((u) => {
        if (filter !== 'all' && !u.memberships.some((m) => m.status === filter)) return false;
        if (!q) return true;
        const hay = (u.name + ' ' + u.email + ' ' + u.memberships.map((m) => m.tenant).join(' ')).toLowerCase();
        return hay.includes(q);
      });
    }, [users, query, filter]);

    const visibleIds = visible.map((u) => u.id);
    const selectedVisible = visibleIds.filter((id) => selected.has(id));
    const allChecked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
    const someChecked = selectedVisible.length > 0 && !allChecked;

    function toggleOne(id) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
    function toggleAll() {
      setSelected((prev) => {
        const n = new Set(prev);
        if (allChecked) visibleIds.forEach((id) => n.delete(id));
        else visibleIds.forEach((id) => n.add(id));
        return n;
      });
    }
    function clearSel() { setSelected(new Set()); }

    // Map a user's memberships through fn(m) → new membership.
    function mapUser(id, fn, toast) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, memberships: u.memberships.map(fn) } : u)));
      if (toast) notify(toast);
    }
    function removeUser(id, toast) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (toast) notify(toast);
    }
    function bumpPlan(p) { return p === 'free' ? 'pro' : 'team'; }

    // ── Bulk operations (apply across every membership of selected users) ──
    const selArr = () => users.filter((u) => selected.has(u.id));
    function bulkUpgrade() {
      const targets = selArr().filter((u) => u.memberships.some((m) => m.plan !== 'team' && m.status !== 'deleted'));
      if (!targets.length) return notify({ color: 'green', title: 'Nothing to upgrade', message: 'Selected members are already on Team.' });
      const ids = new Set(targets.map((u) => u.id));
      setUsers((prev) => prev.map((u) => ids.has(u.id)
        ? { ...u, memberships: u.memberships.map((m) => (m.plan !== 'team' && m.status !== 'deleted') ? { ...m, plan: bumpPlan(m.plan) } : m) } : u));
      notify({ color: 'green', title: 'Plans upgraded', message: `${targets.length} member${targets.length > 1 ? 's' : ''} upgraded.` });
    }
    function bulkStatus(pred, to, title) {
      const targets = selArr().filter((u) => u.memberships.some(pred));
      if (!targets.length) return notify({ color: 'green', title: 'No eligible members', message: 'Nothing in the selection applies.' });
      const ids = new Set(targets.map((u) => u.id));
      setUsers((prev) => prev.map((u) => ids.has(u.id)
        ? { ...u, memberships: u.memberships.map((m) => (pred(m) ? { ...m, status: to } : m)) } : u));
      notify({ color: 'green', title, message: `${targets.length} member${targets.length > 1 ? 's' : ''} updated.` });
    }

    function actionsFor(u) {
      const st = primaryStatus(u);
      const items = [{ type: 'label', label: 'Actions' }];
      if (st === 'active' || st === 'suspended') {
        if (u.memberships.some((m) => m.plan !== 'team' && m.status !== 'deleted')) {
          items.push({ label: 'Upgrade plan', icon: <I.ArrowUp size={16} />,
            onClick: () => mapUser(u.id, (m) => (m.plan !== 'team' && m.status !== 'deleted') ? { ...m, plan: bumpPlan(m.plan) } : m,
              { color: 'green', title: 'Plan upgraded', message: `${u.name}'s memberships upgraded.` }) });
        }
      }
      if (st === 'active') items.push({ label: 'Suspend', icon: <I.Pause size={16} />,
        onClick: () => mapUser(u.id, (m) => m.status === 'active' ? { ...m, status: 'suspended' } : m, { color: 'green', title: 'Member suspended', message: `${u.name} can no longer sign in.` }) });
      if (st === 'suspended') items.push({ label: 'Reactivate', icon: <I.Play size={16} />,
        onClick: () => mapUser(u.id, (m) => m.status === 'suspended' ? { ...m, status: 'active' } : m, { color: 'green', title: 'Member reactivated', message: `${u.name} is active again.` }) });
      if (st === 'invited') {
        items.push({ label: 'Resend invite', icon: <I.Send size={16} />, onClick: () => notify({ color: 'green', title: 'Invite resent', message: `Sent to ${u.email}.` }) });
        items.push({ type: 'sep' });
        items.push({ label: 'Revoke invite', icon: <I.X size={16} />, danger: true, onClick: () => removeUser(u.id, { color: 'green', title: 'Invite revoked', message: `${u.email} was removed.` }) });
        return items;
      }
      if (st === 'deleted') {
        items.push({ label: 'Restore', icon: <I.Restore size={16} />, onClick: () => mapUser(u.id, (m) => ({ ...m, status: 'active' }), { color: 'green', title: 'Member restored', message: `${u.name} was restored.` }) });
        items.push({ type: 'sep' });
        items.push({ label: 'Delete permanently', icon: <I.Trash size={16} />, danger: true, onClick: () => removeUser(u.id, { color: 'green', title: 'Member deleted', message: `${u.name} was permanently removed.` }) });
        return items;
      }
      items.push({ type: 'sep' });
      items.push({ label: 'Delete', icon: <I.Trash size={16} />, danger: true, onClick: () => mapUser(u.id, (m) => ({ ...m, status: 'deleted' }), { color: 'green', title: 'Member deleted', message: `${u.name} moved to deleted.` }) });
      return items;
    }

    function saveRoles(id, roles) {
      const u = users.find((x) => x.id === id);
      const changed = roles.filter((r, i) => r !== u.memberships[i].role).length;
      setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, memberships: x.memberships.map((m, i) => ({ ...m, role: roles[i] })) } : x)));
      notify({ color: 'green', title: 'Roles updated', message: `${changed} role${changed > 1 ? 's' : ''} updated for ${u.name}.` });
      setDetail(null);
    }

    const detailUser = detail ? users.find((u) => u.id === detail) : null;

    return (
      <div className="stack-lg" data-screen-label="Platform · Members">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-sub">Everyone with access across all tenants.</p>
        </div>

        <div className="toolbar">
          <div className="search">
            <I.Search size={16} />
            <input placeholder="Search name, email, or tenant" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="clear" aria-label="Clear search" onClick={() => setQuery('')}><I.X size={14} /></button>}
          </div>
          <div className="segmented" role="tablist" aria-label="Filter by status">
            {STATUS_ORDER.map((s) => (
              <button key={s.key} role="tab" aria-selected={filter === s.key} className={filter === s.key ? 'on' : ''} onClick={() => setFilter(s.key)}>
                {s.label}<span className="pillcount">{counts[s.key]}</span>
              </button>
            ))}
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-filled"><I.UserPlus size={16} />Invite member</button>
        </div>

        {selectedVisible.length > 0 && (
          <div className="bulkbar">
            <span className="bb-count">{selectedVisible.length} selected</span>
            <div className="bb-actions">
              <button className="btn btn-sm btn-white" onClick={bulkUpgrade}><I.ArrowUp size={15} />Upgrade</button>
              <button className="btn btn-sm btn-white" onClick={() => bulkStatus((m) => m.status === 'active', 'suspended', 'Members suspended')}><I.Pause size={15} />Suspend</button>
              <button className="btn btn-sm btn-white" onClick={() => bulkStatus((m) => m.status === 'suspended' || m.status === 'deleted', 'active', 'Members reactivated')}><I.Play size={15} />Reactivate</button>
              <button className="btn btn-sm btn-white danger" onClick={() => bulkStatus((m) => m.status !== 'deleted', 'deleted', 'Members deleted')}><I.Trash size={15} />Delete</button>
              <button className="bb-clear" aria-label="Clear selection" onClick={clearSel}><I.X size={16} /></button>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="empty-state">
            <div className="es-title">No members found</div>
            <div className="es-sub">{query ? `Nothing matches “${query}”.` : 'No members in this view.'}</div>
          </div>
        ) : (
          <>
          <div className="table-wrap only-desktop">
            <table className="tenants">
              <thead>
                <tr>
                  <th className="col-check"><Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} label="Select all" /></th>
                  <th>Member</th><th>Tenant</th><th>Role</th><th>Plan</th><th>Status</th><th>Last active</th>
                  <th className="col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const av = window.avatarColor(u.id);
                  const checked = selected.has(u.id);
                  const p = u.memberships[0];
                  const deleted = primaryStatus(u) === 'deleted';
                  return (
                    <tr key={u.id} className={deleted ? 'deleted-row' : ''} style={{ cursor: 'pointer' }}
                      role="button" tabIndex={0} aria-label={`Open ${u.name}`}
                      onClick={() => setDetail(u.id)}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetail(u.id); } }}>
                      <td className="col-check"><Checkbox checked={checked} onChange={() => toggleOne(u.id)} label={`Select ${u.name}`} /></td>
                      <td>
                        <div className="member-cell">
                          <span className="av" style={{ background: av.bg, color: av.fg }}>{window.initials(u.name)}</span>
                          <span className="m-meta">
                            <span className="m-name">{u.name}</span>
                            <span className="m-mail">{u.email}</span>
                          </span>
                        </div>
                      </td>
                      <td><TenantPills memberships={u.memberships} /></td>
                      <td><Badge cfg={window.ROLE_BADGE[p.role]} size="sm" /></td>
                      <td><Badge cfg={window.PLAN_BADGE[p.plan]} size="sm" /></td>
                      <td><Badge cfg={window.STATUS_BADGE[p.status]} size="sm" /></td>
                      <td className="lastactive">{p.lastActive}</td>
                      <td className="col-actions"><Menu items={actionsFor(u)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: card stack */}
          <div className="only-mobile">
          <div className="card-stack">
            {visible.map((u) => {
              const av = window.avatarColor(u.id);
              const checked = selected.has(u.id);
              const p = u.memberships[0];
              const deleted = primaryStatus(u) === 'deleted';
              return (
                <div key={u.id} className={`m-card ${deleted ? 'deleted-card' : ''}`}
                  role="button" tabIndex={0} aria-label={`Open ${u.name}`} onClick={() => setDetail(u.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetail(u.id); } }}>
                  <div className="mc-top">
                    <Checkbox checked={checked} onChange={() => toggleOne(u.id)} label={`Select ${u.name}`} />
                    <span className="av" style={{ background: av.bg, color: av.fg }}>{window.initials(u.name)}</span>
                    <span className="mc-id">
                      <span className="m-name">{u.name}</span>
                      <span className="m-mail">{u.email}</span>
                    </span>
                    <Menu items={actionsFor(u)} />
                  </div>
                  <div className="mc-badges">
                    <Badge cfg={window.ROLE_BADGE[p.role]} size="sm" />
                    <Badge cfg={window.PLAN_BADGE[p.plan]} size="sm" />
                    <Badge cfg={window.STATUS_BADGE[p.status]} size="sm" />
                  </div>
                  <div className="mc-pills"><TenantPills memberships={u.memberships} /></div>
                  <div className="mc-foot"><span>Last active</span><span>{p.lastActive}</span></div>
                </div>
              );
            })}
          </div>
          </div>
          </>
        )}

        {detailUser && (
          <DetailDrawer user={detailUser} onClose={() => setDetail(null)} onSaveRoles={saveRoles} />
        )}
      </div>
    );
  }

  window.MembersPage = MembersPage;
})();
