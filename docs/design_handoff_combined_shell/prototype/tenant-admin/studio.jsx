/* Prompt Studio: History, Assets, Prompt (preview) + System Prompt editor */
(function () {
  const { useState } = React;
  const { Lbadge, Progress } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

  function fmtDate(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /* ── History (prompt-studio/history) ── */
  function History() {
    const rows = window.COMPOSER_HISTORY;
    function Badge({ status }) { const c = window.HISTORY_STATUS_BADGE[status] || { label: status, bg: 'var(--gray-1)', fg: 'var(--gray-7)' }; return <Lbadge text={c.label} bg={c.bg} fg={c.fg} sm />; }
    return (
      <div className="screen" data-screen-label="Admin · History">
        <div className="screen-headbar"><div className="hb-titles"><h1 className="headbar-title">History</h1></div></div>
        <div className="screen-scroll">
          <div className="table-wrap only-desktop">
            <table className="tenants">
              <thead><tr><th>Block</th><th>Date</th><th>Exchanges</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} style={{ cursor: 'default' }}>
                    <td className="cell-label">{s.block}</td>
                    <td className="mono-xs">{fmtDate(s.created_at)}</td>
                    <td className="mono-cell">{s.exchanges}</td>
                    <td><Badge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="only-mobile"><div className="card-stack">
            {rows.map((s) => (
              <div key={s.id} className="m-card" style={{ cursor: 'default' }}>
                <div className="mc-top"><div className="mc-id"><span className="m-name">{s.block}</span></div><Badge status={s.status} /></div>
                <div className="mc-foot"><span className="mono-cell">{s.exchanges} exchanges</span><span className="mono-xs">{fmtDate(s.created_at)}</span></div>
              </div>
            ))}
          </div></div>
        </div>
      </div>
    );
  }

  /* ── Assets (prompt-studio/assets) ── */
  function fmtSize(len) { if (!len) return '—'; if (len < 1000) return `${len} chars`; return `${(len / 1000).toFixed(1)}k chars`; }
  function Assets() {
    const rows = window.ASSETS;
    function Badge({ stored }) { return <Lbadge text={stored ? 'Stored' : 'Text only'} bg={stored ? 'rgba(45,106,79,0.12)' : 'var(--gray-1)'} fg={stored ? '#2d6a4f' : 'var(--gray-7)'} sm />; }
    return (
      <div className="screen" data-screen-label="Admin · Assets">
        <div className="screen-headbar"><div className="hb-titles"><h1 className="headbar-title">Assets</h1></div></div>
        <div className="screen-scroll">
          <div className="table-wrap only-desktop">
            <table className="tenants">
              <thead><tr><th>File name</th><th>Date uploaded</th><th>Size</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} style={{ cursor: 'default' }}>
                    <td className="cell-label">{a.name}</td>
                    <td className="mono-xs">{fmtDate(a.created_at)}</td>
                    <td className="mono-cell">{fmtSize(a.raw_len)}</td>
                    <td><Badge stored={!!a.storage_path} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="only-mobile"><div className="card-stack">
            {rows.map((a) => (
              <div key={a.id} className="m-card" style={{ cursor: 'default' }}>
                <div className="mc-top"><div className="mc-id"><span className="m-name">{a.name}</span></div><Badge stored={!!a.storage_path} /></div>
                <div className="mc-foot"><span className="mono-cell">{fmtSize(a.raw_len)}</span><span className="mono-xs">{fmtDate(a.created_at)}</span></div>
              </div>
            ))}
          </div></div>
        </div>
      </div>
    );
  }

  /* ── Prompt (prompt-studio/prompt — read-only active prompt) ── */
  function PromptPreview() {
    const [copied, setCopied] = useState(false);
    const content = window.MASTER_PROMPT_CONTENT;
    const bodies = window.COMPOSER_EXISTING.map((b) => b.body);
    const tokens = window.tokensFor(bodies.join(''));
    const LIMIT = 8000, pct = Math.min((tokens / LIMIT) * 100, 100);
    const color = tokens > LIMIT ? 'red' : tokens >= 5000 ? 'yellow' : 'green';
    function copy() { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    return (
      <div className="screen" data-screen-label="Admin · Prompt">
        <div className="screen-headbar"><div className="hb-titles"><h1 className="headbar-title">Prompt</h1></div></div>
        <div className="screen-scroll">
          <div className="stack-md" style={{ maxWidth: 860 }}>
            <div className="alert-gray">This is your active prompt. To make changes, edit blocks in the Composer.</div>
            <div className="meter-wrap">
              <span className="meter-label">{tokens.toLocaleString()} / {LIMIT.toLocaleString()} tokens used</span>
              <Progress value={pct} color={color} />
            </div>
            <div className="group-between">
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span className="mono-xs">Version: {window.MASTER_PROMPT_VERSION}</span>
                <span className="mono-xs">Last updated: {fmtDate(window.MASTER_PROMPT_UPDATED_AT)}</span>
              </div>
              <button className="actionicon" onClick={copy} aria-label="Copy prompt" style={{ color: copied ? 'var(--green-6)' : 'var(--gray-6)' }}>
                {copied ? <I.Check size={16} /> : <I.Copy size={16} />}
              </button>
            </div>
            <textarea className="prompt-area" readOnly value={content} style={{ minHeight: 320 }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── System Prompt editor (app/admin/prompt — PromptEditor.tsx) ── */
  function SystemPrompt() {
    const [prompt, setPrompt] = useState(window.SYSTEM_PROMPT_CONTENT);
    const [status, setStatus] = useState('idle'); // idle | saving | saved
    const [version] = useState(window.SYSTEM_PROMPT_VERSION);
    const history = window.SYSTEM_PROMPT_HISTORY;
    const busy = status === 'saving';
    function save() {
      setStatus('saving');
      setTimeout(() => setStatus('saved'), 600);
    }
    return (
      <div className="screen-pad" data-screen-label="Admin · System Prompt" style={{ maxWidth: 800 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 className="h1-display" style={{ marginBottom: 8 }}>System Prompt</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>The instructions Sage follows in every conversation.</p>
            <span className="kicker-mono">v{version}</span>
          </div>
        </div>
        <textarea className="sp-textarea" value={prompt} disabled={busy}
          onChange={(e) => { setPrompt(e.target.value); if (status === 'saved') setStatus('idle'); }}
          style={{ background: busy ? '#f5f4f1' : '#fff', opacity: busy ? 0.7 : 1 }} />
        {status === 'saved' && (
          <p style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green-6)', letterSpacing: '0.05em' }}>✓ Saved. Version {version}.</p>
        )}
        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn-mono" onClick={save} disabled={busy || !prompt.trim()}>
            {status === 'saving' ? 'Saving…' : 'Check & Save'}
          </button>
        </div>
        {history.length > 0 && (
          <div style={{ marginTop: 64 }}>
            <p className="kicker-mono" style={{ marginBottom: 16 }}>Version History</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {history.map((e) => (
                <div key={e.id} className="vh-row">
                  <div className="vh-left">
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', minWidth: 32 }}>v{e.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gray-6)' }}>{fmtDate(e.saved_at)}</span>
                  </div>
                  <button className="vh-restore" onClick={() => setPrompt(e.content)}>Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  Object.assign(window.Screens, { History, Assets, PromptPreview, SystemPrompt });
})();
