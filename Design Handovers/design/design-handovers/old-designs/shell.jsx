// Shared shell: sidebar navigation + page top bar + compile-preview modal
const { useState, useMemo } = React;

function AppShell({ children, variation, onVariationChange, density, onDensityChange, scheme, onSchemeChange }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-shell__main">
        {children}
      </main>
    </div>
  );
}

function Sidebar() {
  const items1 = [
    { label: "Inbound Chats", active: false },
    { label: "Prompt", active: false },
    { label: "Settings", active: false },
  ];
  const items2 = [
    { label: "Composer", active: false },
    { label: "Blocks", active: true },
    { label: "History", active: false },
    { label: "Assets", active: false },
    { label: "Prompt", active: false },
  ];
  return (
    <nav className="app-shell__nav">
      <div className="nav-brand">
        <div className="nav-brand__name">Natural Resource</div>
        <div className="nav-brand__role">Admin</div>
      </div>
      {items1.map(it => (
        <button key={it.label} className={"nav-link" + (it.active ? " nav-link--active" : "")}>{it.label}</button>
      ))}
      <div className="nav-section-label">Prompt Studio</div>
      {items2.map(it => (
        <button key={it.label} className={"nav-link" + (it.active ? " nav-link--active" : "")}>{it.label}</button>
      ))}
      <div className="nav-user">
        <div className="nav-user__avatar">JT</div>
        <div>
          <div className="nav-user__name">Jeff Torres</div>
          <div className="nav-user__email">jeff@naturalresource.co</div>
        </div>
      </div>
    </nav>
  );
}

// Token meter — segmented by block Type
function TokenMeter({ blocks, budget, size = "md", layout = "row" }) {
  const active = blocks.filter(b => b.active);
  const used = active.reduce((s, b) => s + b.tokens, 0);
  const pct = Math.min(100, (used / budget) * 100);
  const byType = ["process", "knowledge", "identity"].map(t => {
    const sum = active.filter(b => b.type === t).reduce((s, b) => s + b.tokens, 0);
    return { type: t, sum, pct: (sum / budget) * 100 };
  });
  const color = {
    process: "var(--mantine-color-orange-6)",
    knowledge: "var(--mantine-color-teal-6)",
    identity: "var(--mantine-color-violet-6)",
  };
  const over = used > budget;
  const warn = pct > 80;
  const stacked = layout === "stacked";

  const summary = (
    <div className="text-xs text-dimmed" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span>
        <span className="text-mono fw-600" style={{ color: over ? "var(--danger)" : warn ? "var(--mantine-color-yellow-7)" : "var(--text)" }}>{used.toLocaleString()}</span>
        <span> / {budget.toLocaleString()} tokens</span>
      </span>
      <span className="text-dimmed">·</span>
      <span>{active.length} of {blocks.length} active</span>
    </div>
  );

  const legend = (
    <div style={{ display: "flex", gap: stacked ? 10 : 12, flexWrap: "wrap" }} className="text-xs">
      {byType.map(b => (
        <span key={b.type} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color[b.type] }} />
          <span className="text-dimmed" style={{ textTransform: "capitalize" }}>{b.type}</span>
          <span className="text-mono fw-500">{b.sum.toLocaleString()}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: stacked ? 8 : 6 }}>
      {stacked ? (
        <>
          {summary}
          <div className="progress progress--segments" style={{ height: size === "sm" ? 4 : 6 }}>
            {byType.map(b => (
              <div key={b.type} className="progress__seg" style={{ width: b.pct + "%", background: color[b.type] }} />
            ))}
            <div className="progress__seg" style={{ flex: 1, background: "var(--mantine-color-gray-2)" }} />
          </div>
          {legend}
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            {summary}
            {legend}
          </div>
          <div className="progress progress--segments" style={{ height: size === "sm" ? 4 : 6 }}>
            {byType.map(b => (
              <div key={b.type} className="progress__seg" style={{ width: b.pct + "%", background: color[b.type] }} />
            ))}
            <div className="progress__seg" style={{ flex: 1, background: "var(--mantine-color-gray-2)" }} />
          </div>
        </>
      )}
    </div>
  );
}

function CompileModal({ blocks, budget, onClose }) {
  const active = blocks.filter(b => b.active).sort((a, b) => a.order - b.order);
  const disabled = blocks.filter(b => !b.active);
  const used = active.reduce((s, b) => s + b.tokens, 0);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 1000 }}>
        <div className="modal__header">
          <div>
            <div className="modal__title">Compile & Publish preview</div>
            <div className="text-xs text-dimmed" style={{ marginTop: 2 }}>
              Review the compiled system prompt before publishing to production.
            </div>
          </div>
          <button className="action-icon" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal__body scroll-area" style={{ padding: 0, display: "grid", gridTemplateColumns: "320px 1fr", gap: 0 }}>
          <aside style={{ borderRight: "1px solid var(--border)", padding: "var(--mantine-spacing-md)" }}>
            <div style={{ marginBottom: "var(--mantine-spacing-md)" }}>
              <TokenMeter blocks={blocks} budget={budget} layout="stacked" />
            </div>
            <div className="text-xs fw-600 text-dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Changes since last publish</div>
            <DiffSummary />
            <div className="text-xs fw-600 text-dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.08em", margin: "20px 0 8px" }}>Active blocks ({active.length})</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {active.map((b, i) => (
                <li key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4 }}>
                  <span className="text-mono text-xs text-dimmed" style={{ width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-xs" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                  <span className="text-mono text-xs text-dimmed">{b.tokens}</span>
                </li>
              ))}
            </ul>
          </aside>
          <section style={{ padding: "var(--mantine-spacing-lg)", maxHeight: "62vh", overflow: "auto" }} className="scroll-area">
            <div className="text-xs fw-600 text-dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Compiled system prompt</div>
            <pre style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, color: "var(--text-muted)" }}>
{active.map((b, i) => `# ${String(i + 1).padStart(2, "0")} — ${b.title}\n${b.preview}\n`).join("\n")}
            </pre>
          </section>
        </div>
        <div className="modal__footer">
          <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }} className="text-xs text-dimmed">
            <Icon name="warn" size={14} />
            <span>{disabled.length} disabled blocks are excluded. Last published 3h ago.</span>
          </div>
          <button className="btn btn--default" onClick={onClose}>Cancel</button>
          <button className="btn btn--default"><Icon name="download" size={14} /> Export as JSON</button>
          <button className="btn btn--filled-green" onClick={onClose}><Icon name="check" size={14} /> Publish to production</button>
        </div>
      </div>
    </div>
  );
}

function DiffSummary() {
  const changes = [
    { kind: "added", text: "Pricing Philosophy & Packaging" },
    { kind: "edited", text: "Sage's Voice — How to Sound Like Jeff" },
    { kind: "reordered", text: "Jeff's Differentiators" },
    { kind: "disabled", text: "Tone When Declining a Fit" },
  ];
  const colorMap = {
    added: "var(--mantine-color-green-7)",
    edited: "var(--mantine-color-blue-7)",
    reordered: "var(--mantine-color-yellow-7)",
    disabled: "var(--mantine-color-gray-6)",
  };
  const glyph = { added: "+", edited: "~", reordered: "↕", disabled: "−" };
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      {changes.map((c, i) => (
        <li key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="text-mono fw-700" style={{ width: 16, textAlign: "center", color: colorMap[c.kind] }}>{glyph[c.kind]}</span>
          <span className="text-xs" style={{ flex: 1 }}>{c.text}</span>
          <span className="text-xs text-dimmed" style={{ textTransform: "capitalize" }}>{c.kind}</span>
        </li>
      ))}
    </ul>
  );
}

function PageHeader({ onCompile, onMenu }) {
  return (
    <header className="page-header">
      {onMenu && (
        <button className="page-header__menu action-icon" onClick={onMenu} aria-label="Open navigation">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      )}
      <div>
        <h1 className="page-header__title">Blocks</h1>
        <div className="page-header__subtitle">Reusable prompt chunks — compiled into Sage's system prompt.</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
        <button className="btn btn--default"><Icon name="plus" size={14} /> New block</button>
        <button className="btn btn--filled-green" onClick={onCompile}><Icon name="sparkles" size={14} /> Compile & Publish</button>
      </div>
    </header>
  );
}

Object.assign(window, { AppShell, Sidebar, TokenMeter, CompileModal, PageHeader });
