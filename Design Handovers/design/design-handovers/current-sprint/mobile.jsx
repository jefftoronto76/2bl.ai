// Mobile-first variation — review-and-toggle optimized
const { useState: useStateM, useMemo: useMemoM, useEffect: useEffectM } = React;

function MobileBlocks({ onCompile }) {
  const [blocks, setBlocks] = useStateM(BLOCKS);
  const [query, setQuery] = useStateM("");
  const [searchOpen, setSearchOpen] = useStateM(false);
  const [typeFilter, setTypeFilter] = useStateM("all");
  const [drawerOpen, setDrawerOpen] = useStateM(false);
  const [meterExpanded, setMeterExpanded] = useStateM(false);
  const [selectMode, setSelectMode] = useStateM(false);
  const [selected, setSelected] = useStateM(new Set());
  const [reorderMode, setReorderMode] = useStateM(false);
  const [detailId, setDetailId] = useStateM(null);
  const [menuOpen, setMenuOpen] = useStateM(false);

  useEffectM(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const filtered = useMemoM(() => blocks
    .filter(b => !query || b.title.toLowerCase().includes(query.toLowerCase()))
    .filter(b => typeFilter === "all" || b.type === typeFilter)
    .sort((a, b) => a.order - b.order), [blocks, query, typeFilter]);

  const toggleActive = (id) => setBlocks(blocks.map(b => b.id === id ? { ...b, active: !b.active } : b));
  const toggleSelect = (id) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const bulkActive = (v) => { setBlocks(blocks.map(b => selected.has(b.id) ? { ...b, active: v } : b)); };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const active = blocks.filter(b => b.active);
  const used = active.reduce((s, b) => s + b.tokens, 0);
  const pct = Math.min(100, (used / TOKEN_BUDGET) * 100);
  const warn = pct > 80;

  const current = detailId ? blocks.find(b => b.id === detailId) : null;

  // Pointer-based reorder for touch devices. Production should use @dnd-kit with touch sensors.
  const { getItemProps: getDndItem, getHandleProps: getDndHandle } = useSortable({
    ids: filtered.map(b => b.id),
    onReorder: (newIds) => {
      const byId = new Map(blocks.map(b => [b.id, b]));
      const reordered = newIds.map((id, i) => ({ ...byId.get(id), order: i }));
      const tail = blocks.filter(b => !newIds.includes(b.id));
      setBlocks([...reordered, ...tail]);
    },
  });

  return (
    <div className="mobile-shell">
      {/* App bar (or selection bar when multi-select) */}
      {selectMode ? (
        <header className="m-appbar m-appbar--select">
          <button className="m-iconbtn" onClick={exitSelect} aria-label="Cancel"><Icon name="x" size={20}/></button>
          <div className="m-appbar__title">{selected.size} selected</div>
          <div className="m-appbar__actions">
            <button className="m-iconbtn" onClick={() => bulkActive(true)} aria-label="Enable"><Icon name="check" size={20}/></button>
            <button className="m-iconbtn" onClick={() => bulkActive(false)} aria-label="Disable"><Icon name="x" size={20}/></button>
            <button className="m-iconbtn m-iconbtn--danger" aria-label="Delete"><Icon name="trash" size={18}/></button>
          </div>
        </header>
      ) : reorderMode ? (
        <header className="m-appbar">
          <button className="m-iconbtn" onClick={() => setReorderMode(false)} aria-label="Done"><Icon name="x" size={20}/></button>
          <div className="m-appbar__title">Reorder blocks</div>
          <button className="btn btn--filled btn--sm" onClick={() => setReorderMode(false)}>Done</button>
        </header>
      ) : (
        <header className="m-appbar">
          <button className="m-iconbtn" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <div className="m-appbar__title">Blocks</div>
          <div className="m-appbar__actions">
            <button className="m-iconbtn" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search"><Icon name="search" size={18}/></button>
            <button className="btn btn--filled-green btn--sm m-appbar__publish" onClick={onCompile}>
              <Icon name="sparkles" size={14}/> Publish
            </button>
          </div>
        </header>
      )}

      {/* Token meter strip */}
      {!selectMode && (
        <button className="m-meter" onClick={() => setMeterExpanded(!meterExpanded)}>
          <div className="m-meter__bar">
            <div className="m-meter__fill" style={{ width: pct + "%", background: warn ? "var(--mantine-color-yellow-6)" : "var(--mantine-color-blue-6)" }} />
          </div>
          <div className="m-meter__row">
            <span>
              <span className="text-mono fw-600" style={{ color: warn ? "var(--mantine-color-yellow-7)" : "var(--text)" }}>{used.toLocaleString()}</span>
              <span className="text-dimmed"> / {TOKEN_BUDGET.toLocaleString()} tokens</span>
            </span>
            <span className="text-xs text-dimmed">{active.length}/{blocks.length} active <span style={{ display: "inline-block", transition: "transform 120ms", transform: meterExpanded ? "rotate(180deg)" : "none" }}>▾</span></span>
          </div>
          {meterExpanded && (
            <div className="m-meter__legend">
              {["process", "knowledge", "identity"].map(t => {
                const sum = active.filter(b => b.type === t).reduce((s, b) => s + b.tokens, 0);
                const color = { process: "var(--mantine-color-orange-6)", knowledge: "var(--mantine-color-teal-6)", identity: "var(--mantine-color-violet-6)" }[t];
                return (
                  <div key={t} className="m-meter__leg">
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
                    <span style={{ textTransform: "capitalize" }}>{t}</span>
                    <span className="text-mono fw-500">{sum.toLocaleString()}</span>
                    <span className="text-dimmed">{((sum / TOKEN_BUDGET) * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </button>
      )}

      {/* Search overlay */}
      {searchOpen && !selectMode && (
        <div className="m-search">
          <Icon name="search" size={16}/>
          <input autoFocus className="m-search__input" placeholder="Search blocks…" value={query} onChange={e => setQuery(e.target.value)} />
          <button className="m-iconbtn" onClick={() => { setQuery(""); setSearchOpen(false); }} aria-label="Close"><Icon name="x" size={16}/></button>
        </div>
      )}

      {/* Filter chips + actions row */}
      {!selectMode && !reorderMode && (
        <div className="m-chips">
          <div className="m-chips__scroll scroll-area">
            {[{ v: "all", l: "All" }, { v: "process", l: "Process" }, { v: "knowledge", l: "Knowledge" }, { v: "identity", l: "Identity" }].map(o => (
              <button key={o.v} onClick={() => setTypeFilter(o.v)} className={"m-chip" + (typeFilter === o.v ? " is-active" : "")}>{o.l}</button>
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <button className="m-chips__select" onClick={() => setMenuOpen(!menuOpen)}>
              <Icon name="dots" size={14}/>
            </button>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setMenuOpen(false)} />
                <div className="m-menu">
                  <button onClick={() => { setSelectMode(true); setMenuOpen(false); }}>
                    <Icon name="check" size={14}/> Select
                  </button>
                  <button onClick={() => { setReorderMode(true); setMenuOpen(false); }}>
                    <Icon name="drag" size={14}/> Reorder
                  </button>
                  <button onClick={() => { setMenuOpen(false); }}>
                    <Icon name="plus" size={14}/> New block
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Block list */}
      <div className={"m-list scroll-area" + (reorderMode ? " dnd-container" : "")}>
        {filtered.map((b, i) => {
          const dndItem = reorderMode ? getDndItem(b.id) : {};
          return (
          <article key={b.id}
            {...dndItem}
            className={"m-card " + (!b.active ? "is-disabled " : "") + (reorderMode ? "m-card--reorder " : "") + (selected.has(b.id) ? "m-card--selected " : "") + (dndItem.className || "")}
            onClick={(e) => {
              if (reorderMode) return;
              if (selectMode) { toggleSelect(b.id); return; }
              if (e.target.closest(".m-card__switch") || e.target.closest(".m-card__check")) return;
              setDetailId(b.id);
            }}>
            {selectMode && (
              <div className="m-card__check" onClick={() => toggleSelect(b.id)}>
                <span className={"checkbox" + (selected.has(b.id) ? " checkbox--checked" : "")} />
              </div>
            )}
            {reorderMode && (
              <div className="m-card__grip" {...getDndHandle(b.id)}><Icon name="drag" size={20}/></div>
            )}
            <div className="m-card__main">
              <div className="m-card__header">
                <span className={"badge " + TYPES[b.type].badge}>{TYPES[b.type].label}</span>
                <span className="text-mono text-xs text-dimmed">#{String(i + 1).padStart(2, "0")}</span>
                {!b.active && !reorderMode && <span className="badge badge--light-gray">Off</span>}
              </div>
              <h3 className="m-card__title">{b.title}</h3>
              {!reorderMode && (
                <div className="m-card__meta">
                  <span className="text-mono">{b.tokens} tok</span>
                  <span>·</span>
                  <span>{b.updated}</span>
                  <span>·</span>
                  <span>{b.author}</span>
                </div>
              )}
            </div>
            {!selectMode && !reorderMode && (
              <label className="m-card__switch" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={b.active} onChange={() => toggleActive(b.id)} />
                <span className="switch__track"><span className="switch__thumb"/></span>
              </label>
            )}
          </article>
          );
        })}
        <div style={{ height: 80 }} />
      </div>

      {/* FAB */}
      {!selectMode && !reorderMode && (
        <button className="m-fab" aria-label="New block"><Icon name="plus" size={22}/></button>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="m-drawer__scrim" onClick={() => setDrawerOpen(false)} />
          <aside className="m-drawer" role="dialog" aria-label="Navigation">
            <button
              className="m-drawer__close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
            <div className="nav-brand" style={{ marginBottom: 4 }}>
              <div className="nav-brand__name">Natural Resource</div>
              <div className="nav-brand__role">Admin</div>
            </div>
            <button className="nav-link">Inbound Chats</button>
            <button className="nav-link">Prompt</button>
            <button className="nav-link">Settings</button>
            <div className="nav-section-label">Prompt Studio</div>
            <button className="nav-link">Composer</button>
            <button className="nav-link nav-link--active">Blocks</button>
            <button className="nav-link">History</button>
            <button className="nav-link">Assets</button>
            <button className="nav-link">Prompt</button>
            <div className="nav-user"><div className="nav-user__avatar">JT</div><div><div className="nav-user__name">Jeff Torres</div><div className="nav-user__email">jeff@naturalresource.co</div></div></div>
          </aside>
        </>
      )}

      {/* Detail sheet */}
      {current && (
        <>
          <div className="m-sheet__scrim" onClick={() => setDetailId(null)} />
          <div className="m-sheet m-sheet--detail">
            <div className="m-sheet__grabber"/>
            <div className="m-sheet__header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span className={"badge " + TYPES[current.type].badge}>{TYPES[current.type].label}</span>
                  <span className="text-xs text-dimmed">·</span>
                  <span className="text-xs text-dimmed">{current.tokens} tokens</span>
                </div>
                <div className="m-sheet__title">{current.title}</div>
                <div className="text-xs text-dimmed" style={{ marginTop: 4 }}>Updated {current.updated} by {current.author}</div>
              </div>
              <button className="m-iconbtn" onClick={() => setDetailId(null)}><Icon name="x" size={20}/></button>
            </div>
            <div className="m-sheet__body scroll-area">
              <div className="text-xs fw-600 text-dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Content</div>
              <div style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text)", whiteSpace: "pre-wrap" }}>{current.preview}</div>
            </div>
            <div className="m-sheet__footer">
              <label className="m-sheet__status">
                <label className="switch">
                  <input type="checkbox" checked={current.active} onChange={() => toggleActive(current.id)} />
                  <span className="switch__track"><span className="switch__thumb"/></span>
                </label>
                <span className="text-sm fw-500">{current.active ? "Active" : "Disabled"}</span>
              </label>
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                <button className="action-icon" aria-label="Duplicate"><Icon name="copy"/></button>
                <button className="action-icon action-icon--danger" aria-label="Delete"><Icon name="trash"/></button>
              </div>
              <button className="btn btn--filled btn--sm" style={{ marginLeft: 4 }}><Icon name="edit" size={12}/> Edit</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { MobileBlocks });
