// Variation A — enhanced table. Inline-expand preview, drag handles, per-row token bar, bulk toolbar.
const { useState: useStateA, useMemo: useMemoA } = React;

function VariationA({ onCompile, onMenu, density = "desktop" }) {
  const isTablet = density === "tablet";
  const [blocks, setBlocks] = useStateA(BLOCKS);
  const [query, setQuery] = useStateA("");
  const [typeFilter, setTypeFilter] = useStateA("all");
  const [statusFilter, setStatusFilter] = useStateA("all");
  const [selected, setSelected] = useStateA(new Set());
  const [expanded, setExpanded] = useStateA(new Set());

  const filtered = useMemoA(() => {
    return blocks
      .filter(b => !query || b.title.toLowerCase().includes(query.toLowerCase()) || b.preview.toLowerCase().includes(query.toLowerCase()))
      .filter(b => typeFilter === "all" || b.type === typeFilter)
      .filter(b => statusFilter === "all" || (statusFilter === "active" ? b.active : !b.active))
      .sort((a, b) => a.order - b.order);
  }, [blocks, query, typeFilter, statusFilter]);

  // Pointer-based reorder (mouse + touch). Production should use @dnd-kit/sortable.
  const { getItemProps, getHandleProps } = useSortable({
    ids: filtered.map(b => b.id),
    onReorder: (newIds) => {
      const byId = new Map(blocks.map(b => [b.id, b]));
      const reordered = newIds.map((id, i) => ({ ...byId.get(id), order: i }));
      // Keep anything filtered out at the end with their relative order preserved
      const tail = blocks.filter(b => !newIds.includes(b.id));
      setBlocks([...reordered, ...tail]);
    },
  });

  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(b => b.id)));
  const toggleExpand = (id) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };
  const toggleActive = (id) => setBlocks(blocks.map(b => b.id === id ? { ...b, active: !b.active } : b));
  const bulkActive = (v) => setBlocks(blocks.map(b => selected.has(b.id) ? { ...b, active: v } : b));
  const bulkDelete = () => { setBlocks(blocks.filter(b => !selected.has(b.id))); setSelected(new Set()); };

  const maxTokens = Math.max(...blocks.map(b => b.tokens));
  const someSelected = selected.size > 0;
  const allSelected = selected.size === filtered.length && filtered.length > 0;

  return (
    <>
      <PageHeader onCompile={onCompile} onMenu={onMenu} />
      <div style={{ padding: "var(--mantine-spacing-lg) var(--mantine-spacing-xl)", display: "flex", flexDirection: "column", gap: "var(--mantine-spacing-md)" }}>
        {/* Token meter card */}
        <div className="paper" style={{ padding: "var(--mantine-spacing-md) var(--mantine-spacing-lg)" }}>
          <TokenMeter blocks={blocks} budget={TOKEN_BUDGET} />
        </div>

        {/* Toolbar */}
        <div className="va-toolbar" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: isTablet ? "wrap" : "nowrap" }}>
          <div className="text-input text-input--with-icon" style={{ flex: isTablet ? "1 1 220px" : "0 0 320px" }}>
            <span className="text-input__icon"><Icon name="search" /></span>
            <input className="text-input__input" placeholder={isTablet ? "Search blocks…" : "Search blocks by title or content…"} value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <SegmentedControl value={typeFilter} onChange={setTypeFilter}
            options={isTablet
              ? [{ v: "all", l: "All" }, { v: "process", l: "Process" }, { v: "knowledge", l: "Knowledge" }, { v: "identity", l: "Identity" }]
              : [{ v: "all", l: "All types" }, { v: "process", l: "Process" }, { v: "knowledge", l: "Knowledge" }, { v: "identity", l: "Identity" }]
            } />
          {!isTablet && (
            <SegmentedControl value={statusFilter} onChange={setStatusFilter}
              options={[{ v: "all", l: "All" }, { v: "active", l: "Active" }, { v: "disabled", l: "Disabled" }]} />
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn--default btn--sm"
              onClick={() => setExpanded(expanded.size === filtered.length ? new Set() : new Set(filtered.map(b => b.id)))}
              title={expanded.size === filtered.length ? "Collapse all previews" : "Expand all previews"}
            >
              <Icon name="chevronRight" size={12} />
              {isTablet ? (expanded.size === filtered.length ? "Collapse" : "Expand") : (expanded.size === filtered.length ? "Collapse all" : "Expand all")}
            </button>
            <span className="text-xs text-dimmed">{filtered.length} of {blocks.length}</span>
            {!isTablet && <>
              <span className="text-xs text-dimmed">·</span>
              <span className="text-xs text-dimmed">Drag <Icon name="drag" size={11} /> to reorder</span>
            </>}
          </div>
        </div>

        {/* Bulk action bar — appears when something is selected */}
        {someSelected && (
          <div className="paper" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, background: "var(--primary-light)", borderColor: "var(--mantine-color-blue-2)" }}>
            <span className="text-sm fw-500" style={{ color: "var(--mantine-color-blue-8)" }}>{selected.size} selected</span>
            <div style={{ width: 1, height: 18, background: "var(--mantine-color-blue-2)", margin: "0 4px" }} />
            <button className="btn btn--subtle btn--sm" onClick={() => bulkActive(true)}><Icon name="check" size={12} /> Enable</button>
            <button className="btn btn--subtle btn--sm" onClick={() => bulkActive(false)}><Icon name="x" size={12} /> Disable</button>
            <button className="btn btn--subtle btn--sm"><Icon name="copy" size={12} /> Duplicate</button>
            <button className="btn btn--danger-subtle btn--sm" onClick={bulkDelete}><Icon name="trash" size={12} /> Delete</button>
            <button className="btn btn--subtle btn--sm" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="paper" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {!isTablet && <col style={{ width: 28 }} />}
              <col style={{ width: 40 }} />
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: isTablet ? 100 : 120 }} />
              <col style={{ width: isTablet ? 90 : 170 }} />
              <col style={{ width: isTablet ? 64 : 110 }} />
              {!isTablet && <col style={{ width: 110 }} />}
            </colgroup>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                {!isTablet && <th style={th}></th>}
                <th style={th}>
                  <span className={"checkbox" + (allSelected ? " checkbox--checked" : someSelected ? " checkbox--indeterminate" : "")} onClick={toggleAll} />
                </th>
                <th style={th}></th>
                <th style={{ ...th, textAlign: "left" }}>Title</th>
                <th style={{ ...th, textAlign: "left" }}>Type</th>
                <th style={{ ...th, textAlign: "left" }}>Tokens</th>
                <th style={{ ...th, textAlign: isTablet ? "center" : "left" }}>{isTablet ? "On" : "Status"}</th>
                {!isTablet && <th style={{ ...th, textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody className="dnd-container">
              {filtered.map((b, i) => {
                const isOpen = expanded.has(b.id);
                const isSelected = selected.has(b.id);
                const itemProps = getItemProps(b.id);
                return (
                  <React.Fragment key={b.id}>
                    <tr
                      {...itemProps}
                      className={(!b.active ? "is-disabled " : "") + (itemProps.className || "")}
                      style={{
                        borderTop: "1px solid var(--border)",
                        background: isSelected ? "var(--primary-light)" : "transparent",
                      }}
                    >
                      {!isTablet && (
                        <td style={td}>
                          <span
                            className="drag-handle"
                            {...getHandleProps(b.id)}
                            title="Drag to reorder (works on touch)"
                          ><Icon name="drag" /></span>
                        </td>
                      )}
                      <td style={td}>
                        <span className={"checkbox" + (isSelected ? " checkbox--checked" : "")} onClick={() => toggleSelect(b.id)} />
                      </td>
                      <td style={td}>
                        <button className="action-icon action-icon--sm" onClick={() => toggleExpand(b.id)} title="Preview">
                          <span style={{ transition: "transform 120ms", transform: isOpen ? "rotate(90deg)" : "none", display: "grid", placeItems: "center" }}>
                            <Icon name="chevronRight" size={14} />
                          </span>
                        </button>
                      </td>
                      <td style={{ ...td, paddingLeft: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="text-mono text-xs text-dimmed" style={{ width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="fw-500" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                            <div className="text-xs text-dimmed" style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              Updated {b.updated} by {b.author}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={td}>
                        <span className={"badge " + TYPES[b.type].badge}>{TYPES[b.type].label}</span>
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="text-mono text-xs fw-500" style={{ minWidth: isTablet ? 32 : 38 }}>{b.tokens}</span>
                          {!isTablet && (
                            <div style={{ flex: 1, height: 4, background: "var(--mantine-color-gray-2)", borderRadius: 999, overflow: "hidden" }}>
                              <div style={{ width: `${(b.tokens / maxTokens) * 100}%`, height: "100%", background: b.active ? "var(--mantine-color-blue-5)" : "var(--mantine-color-gray-4)", borderRadius: 999 }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: isTablet ? "center" : "left" }}>
                        <label className="switch" style={{ marginRight: isTablet ? 0 : 8 }}>
                          <input type="checkbox" checked={b.active} onChange={() => toggleActive(b.id)} />
                          <span className="switch__track"><span className="switch__thumb" /></span>
                        </label>
                        {!isTablet && <span className="text-xs text-dimmed">{b.active ? "Active" : "Disabled"}</span>}
                      </td>
                      {!isTablet && (
                        <td style={{ ...td, textAlign: "right" }}>
                          <button className="action-icon action-icon--sm" title="Edit"><Icon name="edit" /></button>
                          <button className="action-icon action-icon--sm" title="Duplicate"><Icon name="copy" /></button>
                          <button className="action-icon action-icon--sm action-icon--danger" title="Delete"><Icon name="trash" /></button>
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={isTablet ? 6 : 8} style={{ padding: 0, background: "var(--surface-subtle)", borderTop: "1px solid var(--border)" }}>
                          <div style={{ padding: isTablet ? "14px 16px 16px" : "16px 20px 18px 106px", display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 220px", gap: isTablet ? 14 : 24 }}>
                            <div>
                              <div className="text-xs fw-600 text-dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Block content</div>
                              <div className="text-mono" style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>{b.preview}</div>
                              {isTablet && (
                                <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 12, flexWrap: "wrap" }}>
                                  <span className="text-dimmed">Tokens <span className="text-mono fw-500" style={{ color: "var(--text)" }}>{b.tokens}</span></span>
                                  <span className="text-dimmed">Author <span style={{ color: "var(--text)" }}>{b.author}</span></span>
                                  <span className="text-dimmed">Updated <span style={{ color: "var(--text)" }}>{b.updated}</span></span>
                                  <span className="text-dimmed">Order <span className="text-mono" style={{ color: "var(--text)" }}>{String(i + 1).padStart(2, "0")}</span></span>
                                </div>
                              )}
                              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button className="btn btn--default btn--sm"><Icon name="edit" size={12} /> Edit</button>
                                <button className="btn btn--subtle btn--sm"><Icon name="code" size={12} /> View raw</button>
                                {isTablet && <>
                                  <button className="btn btn--subtle btn--sm"><Icon name="copy" size={12} /> Duplicate</button>
                                  <button className="btn btn--danger-subtle btn--sm" style={{ marginLeft: "auto" }}><Icon name="trash" size={12} /> Delete</button>
                                </>}
                              </div>
                            </div>
                            {!isTablet && (
                              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20 }}>
                                <MetaRow label="Tokens" value={<span className="text-mono fw-500">{b.tokens}</span>} />
                                <MetaRow label="Author" value={b.author} />
                                <MetaRow label="Updated" value={b.updated} />
                                <MetaRow label="Order" value={<span className="text-mono">{String(i + 1).padStart(2, "0")}</span>} />
                                <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                                  <button className="btn btn--default btn--sm"><Icon name="edit" size={12} /> Edit</button>
                                  <button className="btn btn--subtle btn--sm"><Icon name="code" size={12} /> View raw</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
      <span className="text-dimmed">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--mantine-radius-sm)", padding: 2, height: 34 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className="text-xs fw-500"
          style={{
            border: "none",
            padding: "0 12px",
            height: "100%",
            borderRadius: 3,
            background: value === o.v ? "var(--mantine-color-blue-0)" : "transparent",
            color: value === o.v ? "var(--mantine-color-blue-8)" : "var(--text-muted)",
            cursor: "pointer",
          }}>{o.l}</button>
      ))}
    </div>
  );
}

const th = { padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textAlign: "center" };
const td = { padding: "10px 12px", verticalAlign: "middle", fontSize: 14 };

Object.assign(window, { VariationA, SegmentedControl });
