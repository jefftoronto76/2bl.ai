/* Inbound Chats (app/admin/page.tsx + InboundChatsTable.tsx) */
(function () {
  const { useState } = React;
  const { Lbadge } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

  const IN_COST = 3, OUT_COST = 15; // $/1M tokens (claude-sonnet-4-6)
  function fmtDate(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function fmtTokens(i, o) { return ((i || 0) + (o || 0)).toLocaleString('en-US'); }
  function fmtCost(i, o) { return '$' + (((i || 0) * IN_COST + (o || 0) * OUT_COST) / 1e6).toFixed(4); }

  function StatusBadge({ status }) {
    const c = window.SESSION_STATUS_BADGE[status];
    return <Lbadge text={c.label} bg={c.bg} fg={c.fg} sm />;
  }

  function SessionDrawer({ session, onClose }) {
    if (!session) return null;
    const name = session.visitor_name ?? 'Anonymous';
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <aside className="drawer-right" role="dialog" aria-modal="true">
          <div className="detail-head">
            <div className="dh-meta">
              <div className="dh-name" style={{ fontStyle: session.visitor_name ? 'normal' : 'italic' }}>{name}</div>
              {session.email && <div className="dh-mail">{session.email}</div>}
            </div>
            <button className="modal-x" onClick={onClose} aria-label="Close"><I.X size={18} /></button>
          </div>
          <div className="drawer-body">
            <div>
              <div className="section-label">Session</div>
              <div className="def-grid">
                <div className="dk">Status</div><div className="dv"><StatusBadge status={session.status} /></div>
                <div className="dk">Messages</div><div className="dv mono-cell">{session.msgs}</div>
                <div className="dk">Tokens</div><div className="dv mono-cell">{fmtTokens(session.input_tokens, session.output_tokens)}</div>
                <div className="dk">Cost</div><div className="dv mono-cell">{fmtCost(session.input_tokens, session.output_tokens)}</div>
                <div className="dk">Last active</div><div className="dv mono-cell">{fmtDate(session.updated_at)}</div>
              </div>
            </div>
            <div className="future-note"><span className="fn-dot" />Full transcript opens here in the live admin.</div>
          </div>
        </aside>
      </>
    );
  }

  function InboundChats() {
    const [sel, setSel] = useState(null);
    const rows = window.INBOUND_CHATS;
    return (
      <div className="screen-pad" data-screen-label="Admin · Inbound Chats">
        <h1 className="h1-display">Inbound Chats</h1>
        <p className="sub-15">Sage conversation history.</p>

        <div className="table-wrap only-desktop">
          <table className="tenants">
            <thead><tr><th>Visitor</th><th>Messages</th><th>Tokens</th><th>Cost</th><th>Status</th><th>Last Active</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} onClick={() => setSel(s)}>
                  <td>
                    <div className="cell-label" style={{ fontStyle: s.visitor_name ? 'normal' : 'italic' }}>{s.visitor_name ?? 'Anonymous'}</div>
                    {s.email && <div className="cell-sub">{s.email}</div>}
                  </td>
                  <td className="mono-cell">{s.msgs}</td>
                  <td className="mono-cell">{fmtTokens(s.input_tokens, s.output_tokens)}</td>
                  <td className="mono-cell">{fmtCost(s.input_tokens, s.output_tokens)}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="mono-xs">{fmtDate(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="only-mobile">
          <div className="card-stack">
            {rows.map((s) => (
              <div key={s.id} className="m-card" onClick={() => setSel(s)}>
                <div className="mc-top">
                  <div className="mc-id">
                    <span className="m-name" style={{ fontStyle: s.visitor_name ? 'normal' : 'italic' }}>{s.visitor_name ?? 'Anonymous'}</span>
                    {s.email && <span className="m-mail">{s.email}</span>}
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mc-foot">
                  <span className="mono-cell">{s.msgs} messages</span>
                  <span className="mono-xs">{fmtDate(s.updated_at)}</span>
                </div>
                <div className="mc-foot" style={{ marginTop: 4, paddingTop: 0, borderTop: 'none' }}>
                  <span className="mono-xs">{fmtTokens(s.input_tokens, s.output_tokens)} tokens</span>
                  <span className="mono-xs">{fmtCost(s.input_tokens, s.output_tokens)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <SessionDrawer session={sel} onClose={() => setSel(null)} />
      </div>
    );
  }

  window.Screens.InboundChats = InboundChats;
})();
