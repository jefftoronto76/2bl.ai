// Mobile compile-and-publish sheet (full-screen)
function MobileCompileSheet({ blocks, budget, onClose }) {
  const active = blocks.filter(b => b.active).sort((a,b) => a.order - b.order);
  const used = active.reduce((s,b) => s + b.tokens, 0);
  const pct = Math.min(100, (used / budget) * 100);
  return (
    <>
      <div className="m-sheet__scrim" onClick={onClose}/>
      <div className="m-sheet m-sheet--compile m-sheet--full">
        <header className="m-appbar">
          <button className="m-iconbtn" onClick={onClose}><Icon name="x" size={20}/></button>
          <div className="m-appbar__title">Publish preview</div>
          <button className="btn btn--filled-green btn--sm"><Icon name="check" size={14}/> Publish</button>
        </header>
        <div className="m-sheet__body scroll-area" style={{ padding: "16px 16px 40px" }}>
          <div className="m-compile__section">
            <div className="m-compile__label">Token budget</div>
            <div className="m-meter__bar"><div className="m-meter__fill" style={{ width: pct + "%", background: "var(--mantine-color-blue-6)" }}/></div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <span className="text-mono fw-600">{used.toLocaleString()}</span>
              <span className="text-dimmed"> / {budget.toLocaleString()} tokens · {active.length} blocks active</span>
            </div>
          </div>

          <div className="m-compile__section">
            <div className="m-compile__label">Changes since last publish</div>
            {[
              { glyph: "+", c: "var(--mantine-color-green-7)", k: "added",     t: "Pricing Philosophy & Packaging" },
              { glyph: "~", c: "var(--mantine-color-blue-7)",  k: "edited",    t: "Sage's Voice — How to Sound Like Jeff" },
              { glyph: "↕", c: "var(--mantine-color-yellow-7)",k: "reordered", t: "Jeff's Differentiators" },
              { glyph: "−", c: "var(--mantine-color-gray-6)",  k: "disabled",  t: "Tone When Declining a Fit" },
            ].map((c,i)=>(
              <div key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                <span className="text-mono fw-700" style={{ width:16, textAlign:"center", color:c.c }}>{c.glyph}</span>
                <span style={{ flex:1, fontSize:13 }}>{c.t}</span>
                <span className="text-xs text-dimmed" style={{ textTransform:"capitalize" }}>{c.k}</span>
              </div>
            ))}
          </div>

          <div className="m-compile__section">
            <div className="m-compile__label">Compiled system prompt ({active.length} blocks)</div>
            <pre>{active.map((b,i) => `# ${String(i+1).padStart(2,"0")} — ${b.title}\n${b.preview}\n`).join("\n")}</pre>
          </div>
        </div>
      </div>
    </>
  );
}
Object.assign(window, { MobileCompileSheet });
