/* Settings (app/admin/settings) — Accordion: Parameters, Chat Thresholds, Invite Gate */
(function () {
  const { useState } = React;
  const { Button, Select, TextInput, Textarea, NumberInput, Switch, Card } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

  /* ── Paper-stack derivation (decouples the layered "paper" look from a single background) ──
     The storefront's warm-paper effect is a RELATIONSHIP between surfaces, not a texture.
     We derive the raised/sunken surfaces + hairline from one `background` so the effect holds
     no matter what base a tenant picks. When the effect is off, surfaces collapse to the
     background (flat) with a faint neutral hairline. Mirrors derivePaperStack.ts in handoff. */
  function hx2rgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h || '000000', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb2hx(r, g, b) { const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
  function mixHex(a, b, amt) { const A = hx2rgb(a), B = hx2rgb(b); return rgb2hx(A[0] + (B[0] - A[0]) * amt, A[1] + (B[1] - A[1]) * amt, A[2] + (B[2] - A[2]) * amt); }
  const PAPER_WARM = '#c8a87e';
  function paperStack(bg, effect, ink) {
    if (!effect) return { surface: bg, sunken: bg, line: mixHex(bg, ink || '#1a1917', 0.10) };
    return { surface: mixHex(bg, PAPER_WARM, 0.10), sunken: mixHex(bg, PAPER_WARM, 0.20), line: mixHex(bg, PAPER_WARM, 0.42) };
  }

  /* ── SageParameters ── */
  function FieldRow({ label, value, mono }) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="mono-xs" style={{ minWidth: 72, fontFamily: 'var(--font)' }}>{label}</span>
        <span style={{ fontSize: 14, color: 'var(--text)', wordBreak: 'break-all', flex: 1, fontFamily: mono ? 'var(--mono)' : 'var(--font)' }}>{value && value.length ? value : '—'}</span>
      </div>
    );
  }

  function ParamEditCard({ draft, set, onSave, onCancel, isNew }) {
    return (
      <Card>
        <div className="stack-sm">
          <span className="cell-label" style={{ fontWeight: 600 }}>{isNew ? 'New parameter' : 'Edit parameter'}</span>
          <TextInput label="Label" value={draft.label} onChange={(v) => set({ label: v })} placeholder="e.g. Booking link" required />
          <TextInput label="Description" value={draft.description} onChange={(v) => set({ description: v.slice(0, 60) })} placeholder="Short subtitle shown on the card" description={`${draft.description.length}/60`} />
          <TextInput label="CTA label" value={draft.cta_label} onChange={(v) => set({ cta_label: v.slice(0, 20) })} placeholder="e.g. Book a call" description={`${draft.cta_label.length}/20`} />
          <TextInput label="URL" value={draft.url} onChange={(v) => set({ url: v })} placeholder="https://cal.com/your-handle" />
          <Select label="Open behavior" data={window.OPEN_AS_OPTIONS} value={draft.open_as} onChange={(v) => set({ open_as: v })} />
          {draft.open_as === 'popup' && (
            <Textarea label="Embed Code" value={draft.embed_code || ''} onChange={(v) => set({ embed_code: v })} placeholder="Paste your booking tool's popup snippet here" rows={3} mono />
          )}
          <div className="group-end">
            <Button variant="subtle" color="gray" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={onSave} disabled={!draft.label.trim()}>Save</Button>
          </div>
        </div>
      </Card>
    );
  }

  function SageParameters({ notify }) {
    const [params, setParams] = useState(window.SAGE_PARAMETERS);
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [showNew, setShowNew] = useState(false);

    function startEdit(p) { setEditingId(p.id); setDraft({ ...p }); }
    function startNew() { setShowNew(true); setDraft({ label: '', description: '', cta_label: '', url: '', open_as: 'new_tab', embed_code: '' }); }
    function set(patch) { setDraft((d) => ({ ...d, ...patch })); }
    function saveEdit() { setParams((ps) => ps.map((p) => (p.id === editingId ? { ...draft } : p))); setEditingId(null); notify && notify({ title: 'Parameter saved', message: draft.label }); }
    function saveNew() { setParams((ps) => [{ ...draft, id: 'p' + Date.now(), key: draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') }, ...ps]); setShowNew(false); notify && notify({ title: 'Parameter added', message: draft.label }); }
    function del(p) { setParams((ps) => ps.filter((x) => x.id !== p.id)); notify && notify({ title: 'Parameter deleted', message: p.label }); }

    return (
      <div className="stack-md">
        <div className="row-end"><Button size="sm" leftSection={<I.Plus size={14} />} onClick={startNew} disabled={showNew}>Add New</Button></div>
        <div className="stack-sm">
          {showNew && <ParamEditCard draft={draft} set={set} onSave={saveNew} onCancel={() => setShowNew(false)} isNew />}
          {params.map((p) => editingId === p.id ? (
            <ParamEditCard key={p.id} draft={draft} set={set} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          ) : (
            <Card key={p.id}>
              <div className="stack-sm">
                <div className="group-between" style={{ alignItems: 'flex-start' }}>
                  <div className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <span className="cell-label" style={{ fontSize: 16 }}>{p.label || p.key}</span>
                    {p.description && <span style={{ fontSize: 14, color: 'var(--muted)' }}>{p.description}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="actionicon" onClick={() => startEdit(p)} aria-label="Edit"><I.Pencil size={16} /></button>
                    <button className="actionicon" onClick={() => del(p)} aria-label="Delete" style={{ color: 'var(--red-6)' }}><I.Trash size={16} /></button>
                  </div>
                </div>
                <div className="stack-xs" style={{ gap: 4 }}>
                  <FieldRow label="CTA label" value={p.cta_label} />
                  <FieldRow label="URL" value={p.url} mono />
                  <FieldRow label="Open as" value={p.open_as === 'popup' ? 'Inline' : 'New Tab'} />
                  {p.open_as === 'popup' && <FieldRow label="Embed code" value={p.embed_code ? 'Set' : 'Not set'} />}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  /* ── ChatThresholds ── */
  function ChatThresholds({ notify }) {
    const [inProgress, setInProgress] = useState(window.CHAT_THRESHOLDS.in_progress);
    const [active, setActive] = useState(window.CHAT_THRESHOLDS.active);
    const [saving, setSaving] = useState(false);
    const valid = inProgress > 0 && active > 0 && inProgress < active;
    function save() { setSaving(true); setTimeout(() => { setSaving(false); notify && notify({ title: 'Thresholds saved', message: 'Chat threshold settings updated.' }); }, 500); }
    function reset() { setInProgress(300); setActive(86400); }
    return (
      <div className="stack-md">
        <Card>
          <div className="stack-sm">
            <NumberInput label="In-progress idle threshold" description="Seconds idle before a chat moves from In-progress to Active. Default: 300 (5 min)." value={inProgress} onChange={setInProgress} min={1} step={60} disabled={saving} />
            <NumberInput label="Active idle threshold" description="Seconds idle before a chat moves from Active to Abandoned. Default: 86400 (24 hr)." value={active} onChange={setActive} min={1} step={3600} disabled={saving} />
            <div className="group-end">
              <Button variant="subtle" color="gray" size="sm" onClick={reset} disabled={saving}>Reset to defaults</Button>
              <Button size="sm" onClick={save} loading={saving} disabled={!valid}>Save</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ── InviteGate ── */
  function InviteGate({ notify }) {
    const [enabled, setEnabled] = useState(window.INVITE_GATE_ENABLED);
    const [saving, setSaving] = useState(false);
    function save() { setSaving(true); setTimeout(() => { setSaving(false); notify && notify({ title: 'Gate setting saved', message: `Invite gate is now ${enabled ? 'on' : 'off'}.` }); }, 500); }
    return (
      <Card>
        <div className="stack-sm">
          <Switch checked={enabled} onChange={setEnabled} label="Require an invite to access this chat" description="When enabled, visitors must present an invite link or be an active member to open the chat." disabled={saving} />
          <div className="group-end"><Button size="sm" onClick={save} loading={saving}>Save</Button></div>
        </div>
      </Card>
    );
  }

  /* ── Appearance change log ── */
  function fmtHistDate(iso) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function DiffValue({ kind, value }) {
    if (kind === 'color') {
      return (
        <span className="hist-val">
          <span className="hist-sw" style={{ background: value }} />
          <span className="hist-mono">{value}</span>
        </span>
      );
    }
    return <span className="hist-val"><span className={kind === 'font' ? 'hist-mono' : undefined}>{value}</span></span>;
  }

  function AppearanceHistory({ rows }) {
    rows = rows || window.APPEARANCE_HISTORY || [];
    return (
      <Card>
        <div className="stack-sm">
          <div className="group-between" style={{ alignItems: 'baseline' }}>
            <span className="cell-label" style={{ fontWeight: 600 }}>Change history</span>
            <span className="mono-xs" style={{ fontFamily: 'var(--mono)', color: 'var(--gray-6)' }}>{rows.length} {rows.length === 1 ? 'change' : 'changes'}</span>
          </div>
          {rows.length === 0 ? (
            <div className="desc">No changes recorded yet.</div>
          ) : (
            <div className="hist-list">
              {rows.map((h) => {
                const c = window.avatarColor(h.actor);
                return (
                  <div key={h.id} className="hist-row">
                    <span className="hist-av" style={{ background: c.bg, color: c.fg }}>{window.initials(h.actor)}</span>
                    <div className="hist-body">
                      <div className="hist-line">
                        <strong>{h.actor}</strong> changed <strong>{h.field}</strong>
                      </div>
                      <div className="hist-diff">
                        <DiffValue kind={h.kind} value={h.from} />
                        <I.ChevronRight size={13} aria-hidden />
                        <DiffValue kind={h.kind} value={h.to} />
                      </div>
                    </div>
                    <span className="hist-when mono-xs" title={h.email}>{fmtHistDate(h.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    );
  }

  /* ── WebsiteAppearance ── */
  function ColorRow({ label, description, value, onChange, disabled }) {
    return (
      <div className="field" style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
        <label>{label}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="swatch" style={{ background: value }}>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} color`} />
          </label>
          <input
            className="input"
            value={value}
            onChange={(e) => { let v = e.target.value; if (v && v[0] !== '#') v = '#' + v; onChange(v); }}
            spellCheck={false}
            style={{ fontFamily: 'var(--mono)', textTransform: 'lowercase', maxWidth: 140 }}
          />
        </div>
        {description && <div className="desc">{description}</div>}
      </div>
    );
  }

  /* ── Branding sync status (read-only; written by the nightly defaults sync) ── */
  function fmtSyncDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function SyncStatus({ sync }) {
    const synced = fmtSyncDate(sync && sync.defaults_synced_at);
    const warnings = (sync && sync.branding_warnings) || null;
    const hasWarnings = Array.isArray(warnings) && warnings.length > 0;
    return (
      <Card>
        <div className="stack-sm">
          <div className="group-between" style={{ alignItems: 'baseline' }}>
            <span className="cell-label" style={{ fontWeight: 600 }}>Sync status</span>
            <span className="mono-xs" style={{ fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: 'var(--gray-6)' }}>Read-only</span>
          </div>
          <div className="sync-grid">
            <div className="sk">Last synced</div>
            <div className="sv">
              {synced
                ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{synced}</span>
                : <span className="sync-never"><span className="sync-dot" aria-hidden />Never synced</span>}
            </div>
            <div className="sk sk-top">Warnings</div>
            <div className="sv">
              {hasWarnings ? (
                <ul className="sync-warn-list">
                  {warnings.map((w, i) => {
                    const tok = typeof w === 'string' ? w : w.token;
                    const msg = typeof w === 'string' ? null : w.message;
                    return (
                      <li key={i} className="sync-warn-item">
                        <span className="sw-ico" aria-hidden><I.Alert size={13} /></span>
                        <span className="sw-text"><code className="sync-tok">{tok}</code>{msg && <span className="sw-msg">{msg}</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="sync-ok"><I.Check size={13} aria-hidden />No warnings</span>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  /* ── ThemeEditor — shared editor used by both the Storefront and Admin targets ── */
  function ThemeEditor({ init, preview, history, sync, notify, savedMsg }) {
    const [t, setT] = useState({ ...init });
    const [saving, setSaving] = useState(false);
    function set(patch) { setT((d) => ({ ...d, ...patch })); }
    function reset() { setT({ ...init }); }
    function save() { setSaving(true); setTimeout(() => { setSaving(false); notify && notify({ title: 'Appearance saved', message: savedMsg }); }, 500); }

    return (
      <div className="stack-md">
      <div className="theme-grid">
        <div className="stack-md">
          <Card>
            <div className="stack-sm">
              <span className="cell-label" style={{ fontWeight: 600 }}>Colors</span>
              <ColorRow label="Background" description="Page canvas behind all content." value={t.background} onChange={(v) => set({ background: v })} />
              <Switch checked={t.paper_effect} onChange={(v) => set({ paper_effect: v })} label="Paper effect" description="Layer surfaces and borders into a warm “paper” depth, derived from your background. Off = flat, single-tone." disabled={saving} />
              <div className="field">
                <label>Accent</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="swatch" style={{ background: t.accent }}>
                    <input type="color" value={t.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Accent color" />
                  </label>
                  <input className="input" value={t.accent} onChange={(e) => { let v = e.target.value; if (v && v[0] !== '#') v = '#' + v; set({ accent: v }); }} spellCheck={false} style={{ fontFamily: 'var(--mono)', textTransform: 'lowercase', maxWidth: 140 }} />
                </div>
                <div className="desc">Links and highlights use this color.</div>
              </div>
              <Switch checked={t.accent_buttons} onChange={(v) => set({ accent_buttons: v })} label="Apply accent to buttons" description="When off, primary buttons stay neutral (ink)." disabled={saving} />
              <ColorRow label="Lede" description="Intro / subtitle text under headings." value={t.lede} onChange={(v) => set({ lede: v })} />
              <ColorRow label="Heading (H1)" description="Top-level page titles." value={t.heading} onChange={(v) => set({ heading: v })} />
              <ColorRow label="Body copy" description="Default paragraph text." value={t.body} onChange={(v) => set({ body: v })} />
            </div>
          </Card>
          <Card>
            <div className="stack-sm">
              <span className="cell-label" style={{ fontWeight: 600 }}>Typography</span>
              <Select label="Primary font" description="Used for headings." data={window.THEME_FONT_OPTIONS} value={t.font_primary} onChange={(v) => set({ font_primary: v })} />
              <Select label="Secondary font" description="Used for lede and body copy." data={window.THEME_FONT_OPTIONS} value={t.font_secondary} onChange={(v) => set({ font_secondary: v })} />
            </div>
          </Card>
          <div className="group-end">
            <Button variant="subtle" color="gray" size="sm" onClick={reset} disabled={saving}>Reset</Button>
            <Button size="sm" onClick={save} loading={saving}>Save</Button>
          </div>
        </div>

        {preview(t)}
      </div>
      <SyncStatus sync={sync} />
      <AppearanceHistory rows={history} />
      </div>
    );
  }

  /* ── Storefront preview (public chat website) ── */
  function StorefrontPreview({ t }) {
    const [showSurfaceNote, setShowSurfaceNote] = useState(false);
    const headFont = `"${t.font_primary}", serif`;
    const bodyFont = `"${t.font_secondary}", sans-serif`;
    const btnBg = t.accent_buttons ? t.accent : '#1a1917';
    const ps = paperStack(t.background, t.paper_effect, t.heading);
    return (
        <div className="theme-preview-wrap">
          <span className="mono-xs" style={{ fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: 'var(--gray-6)' }}>Live preview</span>
          <div className="theme-preview" style={{ background: t.background, fontFamily: bodyFont }}>
            <h1 style={{ fontFamily: headFont, color: t.heading, fontSize: 30, lineHeight: 1.12, margin: 0, fontWeight: 500 }}>Build a second brain that talks.</h1>
            <p style={{ color: t.lede, fontSize: 16, margin: '14px 0 0', lineHeight: 1.5 }}>Sage answers your visitors in your voice, around the clock — and books the ones who are ready.</p>
            <p style={{ color: t.body, fontSize: 14, margin: '14px 0 0', lineHeight: 1.6 }}>Every conversation is grounded in the notes, prompts, and parameters you control here. No hallucinated facts, no off-brand tone — just your knowledge, working while you sleep. <a href="#" onClick={(e) => e.preventDefault()} style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>See how it works</a>.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 18px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: bodyFont }}>Start a chat</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 18px', borderRadius: 6, background: 'transparent', color: t.accent, border: `1px solid ${t.accent}`, fontSize: 14, fontWeight: 600, fontFamily: bodyFont }}>Learn more</span>
            </div>
            <div style={{ marginTop: 22, paddingTop: 12, borderTop: `1px dashed ${mixHex(t.background, t.heading, 0.18)}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: mixHex(t.background, t.heading, 0.5) }}>Surface sample</span>
                <button type="button" onClick={() => setShowSurfaceNote((v) => !v)} aria-expanded={showSurfaceNote} style={{ appearance: 'none', border: 0, background: 'transparent', padding: 0, font: 'inherit', fontSize: 11.5, color: t.accent, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>{showSurfaceNote ? 'Hide' : 'What’s this?'}</button>
              </div>
              {showSurfaceNote && (
                <p style={{ fontSize: 12, lineHeight: 1.55, margin: '8px 0 0', color: mixHex(t.background, t.heading, 0.62), fontFamily: bodyFont }}>A demo surface — not real content. It shows how cards, chips, and borders take their tone from your <strong>Background</strong>. Toggle <strong>Paper effect</strong> above to watch them gain or lose depth.</p>
              )}
              <div style={{ marginTop: 12, background: ps.surface, border: `1px solid ${ps.line}`, borderRadius: 12, padding: 16, transition: 'background 160ms ease, border-color 160ms ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: ps.sunken, display: 'grid', placeItems: 'center', color: t.body, fontSize: 11.5, fontWeight: 700, fontFamily: bodyFont, flex: '0 0 auto' }}>SC</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Sarah Chen</div>
                  <div style={{ color: t.lede, fontSize: 12 }}>Summit Realty</div>
                </div>
              </div>
              <p style={{ color: t.body, fontSize: 13.5, margin: '11px 0 0', lineHeight: 1.55 }}>“Sage books the right people while I sleep — and sounds like me doing it.”</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <span style={{ background: ps.sunken, border: `1px solid ${ps.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: t.body, fontFamily: bodyFont }}>Active</span>
                <span style={{ background: ps.sunken, border: `1px solid ${ps.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: t.body, fontFamily: bodyFont }}>Pro plan</span>
              </div>
              </div>
            </div>
          </div>
        </div>
    );
  }

  /* ── Admin preview (this admin console — sidebar, nav, content chrome) ── */
  function AdminPreview({ t }) {
    const headFont = `"${t.font_primary}", sans-serif`;
    const bodyFont = `"${t.font_secondary}", sans-serif`;
    const btnBg = t.accent_buttons ? t.accent : '#1a1917';
    const ps = paperStack(t.background, t.paper_effect, t.heading);
    const sidebar = '#101113';
    const navText = 'rgba(255,255,255,0.6)';
    const navItems = ['Inbound', 'Members', 'Composer', 'Settings'];
    return (
      <div className="theme-preview-wrap">
        <span className="mono-xs" style={{ fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: 'var(--gray-6)' }}>Live preview</span>
        <div className="theme-preview" style={{ padding: 0, overflow: 'hidden', background: t.background, fontFamily: bodyFont }}>
          <div style={{ display: 'flex', minHeight: 344 }}>
            <div style={{ width: 140, flex: '0 0 140px', background: sidebar, padding: '15px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ marginBottom: 13, padding: '0 5px' }}>
                <div style={{ fontFamily: headFont, color: '#fff', fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>Second Brain</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.accent, marginTop: 3 }}>Admin</div>
              </div>
              {navItems.map((n, i) => (
                <span key={n} style={{ display: 'block', padding: '7px 10px', borderRadius: 6, fontSize: 12.5, fontFamily: bodyFont, fontWeight: i === 1 ? 500 : 400, color: i === 1 ? '#fff' : navText, background: i === 1 ? t.accent : 'transparent' }}>{n}</span>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: '18px 18px 20px' }}>
              <h1 style={{ fontFamily: headFont, color: t.heading, fontSize: 21, lineHeight: 1.15, margin: 0, fontWeight: 600 }}>Members</h1>
              <p style={{ color: t.lede, fontSize: 12.5, margin: '5px 0 0', lineHeight: 1.5 }}>Manage who can access this workspace.</p>
              <div style={{ marginTop: 14, background: ps.surface, border: `1px solid ${ps.line}`, borderRadius: 12, padding: 14, transition: 'background 160ms ease, border-color 160ms ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: t.accent, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, fontFamily: bodyFont, flex: '0 0 auto' }}>JL</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Jeff Lougheed</div>
                    <div style={{ color: t.lede, fontSize: 12 }}>jeff@naturalresource.co</div>
                  </div>
                  <span style={{ background: mixHex(t.background, t.accent, 0.12), color: t.accent, border: `1px solid ${mixHex(t.background, t.accent, 0.3)}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600, fontFamily: bodyFont }}>Owner</span>
                </div>
                <p style={{ color: t.body, fontSize: 13, margin: '11px 0 0', lineHeight: 1.55 }}>Owners can edit branding, prompts, and billing for this workspace.</p>
              </div>
              <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: bodyFont }}>Invite member</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: 'transparent', color: t.body, border: `1px solid ${mixHex(t.background, t.heading, 0.2)}`, fontSize: 13, fontWeight: 600, fontFamily: bodyFont }}>Export</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── WebsiteAppearance — nests two branding targets: Storefront + Admin ── */
  function WebsiteAppearance({ notify }) {
    const [target, setTarget] = useState('storefront');
    const isStore = target === 'storefront';
    return (
      <div className="stack-md">
        <div className="appr-switch">
          <div className="segmented appr-seg" role="tablist" aria-label="Branding target">
            <button type="button" role="tab" aria-selected={isStore} className={isStore ? 'on' : ''} onClick={() => setTarget('storefront')}>Storefront</button>
            <button type="button" role="tab" aria-selected={!isStore} className={!isStore ? 'on' : ''} onClick={() => setTarget('admin')}>Admin</button>
          </div>
          <p className="desc appr-switch-note">{isStore
            ? 'Branding for your public chat website — what visitors see.'
            : 'Branding for this admin console — the sidebar, navigation, and buttons your team sees.'}</p>
        </div>
        {isStore ? (
          <ThemeEditor key="storefront" init={window.THEME_TOKENS} preview={(t) => <StorefrontPreview t={t} />} history={window.APPEARANCE_HISTORY} sync={window.STOREFRONT_SYNC} notify={notify} savedMsg="Public website theme updated." />
        ) : (
          <ThemeEditor key="admin" init={window.ADMIN_THEME_TOKENS} preview={(t) => <AdminPreview t={t} />} history={window.ADMIN_APPEARANCE_HISTORY} sync={window.ADMIN_SYNC} notify={notify} savedMsg="Admin console theme updated." />
        )}
      </div>
    );
  }

  /* ── PromptSets — the tenant's prompt sets (label / status / usage), matching
     the SageParameters card idiom. Editable: label, description, status, and —
     when live — the usage type (where it's wired in). version is read-only
     (auto-increments on compile); is_master is a read-only badge set by the
     platform admin; id / tenant_id / created_at / updated_at are calculated. ── */
  function psUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function psNowIso() { return new Date().toISOString().slice(0, 19); }
  function psFmtDate(iso) { return iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }

  function PSBadges({ set }) {
    const st = window.PS_STATUS_BADGE[set.status];
    const u = set.status === 'live' && set.usage_type ? window.usageBadge(set.usage_type) : null;
    return (
      <span className="pset-badges">
        <span className="badge" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
        {set.is_master && <span className="badge pset-master-badge">Master</span>}
        {u && <span className="badge" style={{ background: u.bg, color: u.fg }}>{set.usage_type}</span>}
      </span>
    );
  }

  function PromptSetMeta({ set, isNew }) {
    const rows = [
      ['Version', <span><span className="pset-ver">v{set.version}</span><span className="dim"> · auto-increments on compile</span></span>],
      ['Master', set.is_master ? <span className="badge pset-master-badge">Master</span> : <span className="dim">—</span>],
      ['ID', isNew ? <span className="dim">generated on save</span> : <span className="mono-xs">{set.id}</span>],
      ['Tenant ID', <span className="mono-xs">{set.tenant_id}</span>],
      ['Created', isNew ? <span className="dim">on save</span> : psFmtDate(set.created_at)],
      ['Updated', isNew ? <span className="dim">on save</span> : psFmtDate(set.updated_at)],
    ];
    return (
      <div className="pset-meta">
        {rows.map(([k, v], i) => (
          <div key={i} className="pset-meta-item"><span className="pset-meta-k">{k}</span><span className="pset-meta-v">{v}</span></div>
        ))}
      </div>
    );
  }

  function PromptSetEditCard({ draft, update, onSave, onCancel, isNew }) {
    const [creatingType, setCreatingType] = useState(false);
    const isLive = draft.status === 'live';
    const usageData = [
      ...window.PROMPT_SET_USAGE_TYPES,
      ...(draft.usage_type && !window.PROMPT_SET_USAGE_TYPES.some((u) => u.value === draft.usage_type) ? [{ value: draft.usage_type, label: draft.usage_type }] : []),
      { value: '__new__', label: '＋ New type…' },
    ];
    function onUsage(v) {
      if (v === '__new__') { setCreatingType(true); update({ usage_type: '' }); }
      else { setCreatingType(false); update({ usage_type: v }); }
    }
    const saveDisabled = !draft.label.trim() || (isLive && !(draft.usage_type || '').trim());
    return (
      <Card>
        <div className="stack-sm">
          <span className="cell-label" style={{ fontWeight: 600 }}>{isNew ? 'New prompt set' : 'Edit prompt set'}</span>
          <TextInput label="Label" value={draft.label} onChange={(v) => update({ label: v })} placeholder="e.g. Sage Base" required />
          <Textarea label="Description" value={draft.description} onChange={(v) => update({ description: v })} placeholder="What this set is for…" rows={3} />
          <Select label="Status" data={[{ value: 'live', label: 'Live' }, { value: 'draft', label: 'Draft' }]} value={draft.status} onChange={(v) => update({ status: v })} description="Set by the admin. Multiple sets can be live." />
          {isLive && (creatingType ? (
            <div className="field">
              <label>New usage type<span className="req">*</span></label>
              <div className="pset-newtype">
                <input className="input" placeholder="e.g. trial" value={draft.usage_type || ''} autoFocus onChange={(e) => update({ usage_type: e.target.value })} />
                <Button variant="subtle" color="gray" size="sm" onClick={() => { setCreatingType(false); update({ usage_type: null }); }}>Cancel</Button>
              </div>
              <div className="desc">Where this live set is wired in.</div>
            </div>
          ) : (
            <Select label="Used as" placeholder="Select a usage type" data={usageData} value={draft.usage_type} onChange={onUsage} description="Where this live set is wired in." />
          ))}
          <PromptSetMeta set={draft} isNew={isNew} />
          <div className="group-end">
            <Button variant="subtle" color="gray" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={onSave} disabled={saveDisabled}>{isNew ? 'Create set' : 'Save'}</Button>
          </div>
        </div>
      </Card>
    );
  }

  function PromptSets({ notify }) {
    const CURRENT_TENANT_ID = 'sbl';
    const [sets, setSets] = useState(() => window.PROMPT_SETS.filter((s) => s.tenant_id === CURRENT_TENANT_ID));
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [showNew, setShowNew] = useState(false);

    function update(patch) { setDraft((d) => ({ ...d, ...patch })); }
    function startEdit(s) { setShowNew(false); setEditingId(s.id); setDraft({ ...s }); }
    function startNew() {
      setEditingId(null); setShowNew(true);
      setDraft({ id: psUuid(), tenant_id: CURRENT_TENANT_ID, label: '', description: '', status: 'draft', is_master: false, usage_type: null, version: 1, created_at: psNowIso(), updated_at: psNowIso() });
    }
    function normalize(d) {
      const out = { ...d };
      if (out.status !== 'live') out.usage_type = null;
      else out.usage_type = (out.usage_type || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      out.label = out.label.trim();
      out.description = (out.description || '').trim();
      out.updated_at = psNowIso();
      return out;
    }
    function saveEdit() { const d = normalize(draft); setSets((ss) => ss.map((s) => (s.id === editingId ? d : s))); setEditingId(null); notify && notify({ title: 'Prompt set saved', message: d.label }); }
    function saveNew() { const d = normalize(draft); setSets((ss) => [d, ...ss]); setShowNew(false); notify && notify({ title: 'Prompt set added', message: d.label }); }
    function del(s) { setSets((ss) => ss.filter((x) => x.id !== s.id)); notify && notify({ title: 'Prompt set deleted', message: s.label }); }

    return (
      <div className="stack-md">
        <div className="row-end"><Button size="sm" leftSection={<I.Plus size={14} />} onClick={startNew} disabled={showNew}>Add New</Button></div>
        <div className="stack-sm">
          {showNew && <PromptSetEditCard draft={draft} update={update} onSave={saveNew} onCancel={() => setShowNew(false)} isNew />}
          {sets.length === 0 && !showNew && <div className="desc">No prompt sets yet. Add one to get started.</div>}
          {sets.map((s) => editingId === s.id ? (
            <PromptSetEditCard key={s.id} draft={draft} update={update} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          ) : (
            <Card key={s.id}>
              <div className="stack-sm">
                <div className="group-between" style={{ alignItems: 'flex-start' }}>
                  <div className="pset-head">
                    <span className="pset-title">{s.label}</span>
                    <span className="pset-ver">v{s.version}</span>
                    <PSBadges set={s} />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="actionicon" onClick={() => startEdit(s)} aria-label="Edit"><I.Pencil size={16} /></button>
                    <button className="actionicon" onClick={() => del(s)} aria-label="Delete" style={{ color: 'var(--red-6)' }}><I.Trash size={16} /></button>
                  </div>
                </div>
                {s.description && <span style={{ fontSize: 14, color: 'var(--muted)' }}>{s.description}</span>}
                <PromptSetMeta set={s} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const ACC_ITEMS = [
    { value: 'parameters', title: 'Parameters', sub: 'Values Sage uses in conversation, such as booking links.', render: (notify) => <SageParameters notify={notify} /> },
    { value: 'prompt-sets', title: 'Prompt Sets', sub: 'The prompt sets this tenant runs — label, status, and where each live set is used.', render: (notify) => <PromptSets notify={notify} /> },
    { value: 'thresholds', title: 'Chat Thresholds', sub: 'How long Sage waits before moving a session from In-progress → Active → Abandoned.', render: (notify) => <ChatThresholds notify={notify} /> },
    { value: 'invite-gate', title: 'Invite Gate', sub: 'Control whether this chat requires membership or an invite to access.', render: (notify) => <InviteGate notify={notify} /> },
    { value: 'appearance', title: 'Appearance', sub: 'Branding for your public storefront and this admin console.', render: (notify) => <WebsiteAppearance notify={notify} /> },
  ];

  function Settings({ notify }) {
    const [open, setOpen] = useState(new Set());
    function toggle(v) { setOpen((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; }); }
    return (
      <div className="screen" data-screen-label="Admin · Settings">
        <div className="screen-headbar"><div className="hb-titles"><h1 className="headbar-title">Settings</h1></div></div>
        <div className="screen-scroll">
          <div className="accordion">
            {ACC_ITEMS.map((it) => {
              const isOpen = open.has(it.value);
              return (
                <div key={it.value} className={`acc-item ${isOpen ? 'open' : ''}`}>
                  <button className="acc-control" onClick={() => toggle(it.value)} aria-expanded={isOpen}>
                    <span className="acc-titles"><span className="acc-t">{it.title}</span><span className="acc-s">{it.sub}</span></span>
                    <span className="acc-chev"><I.ChevronRight size={18} /></span>
                  </button>
                  {isOpen && <div className="acc-panel">{it.render(notify)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  window.Screens.Settings = Settings;
})();
