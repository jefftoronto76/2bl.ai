/* Settings (app/admin/settings) — Accordion: Parameters, Chat Thresholds, Invite Gate */
(function () {
  const { useState } = React;
  const { Button, Select, TextInput, Textarea, NumberInput, Switch, Card } = window.TUI;
  const I = window.Icons;
  window.Screens = window.Screens || {};

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

  function WebsiteAppearance({ notify }) {
    const init = window.THEME_TOKENS;
    const [t, setT] = useState({ ...init });
    const [saving, setSaving] = useState(false);
    function set(patch) { setT((d) => ({ ...d, ...patch })); }
    function reset() { setT({ ...init }); }
    function save() { setSaving(true); setTimeout(() => { setSaving(false); notify && notify({ title: 'Appearance saved', message: 'Website theme updated.' }); }, 500); }

    const headFont = `"${t.font_primary}", serif`;
    const bodyFont = `"${t.font_secondary}", sans-serif`;
    const btnBg = t.accent_buttons ? t.accent : '#1a1917';

    return (
      <div className="theme-grid">
        <div className="stack-md">
          <Card>
            <div className="stack-sm">
              <span className="cell-label" style={{ fontWeight: 600 }}>Colors</span>
              <ColorRow label="Background" description="Page canvas behind all content." value={t.background} onChange={(v) => set({ background: v })} />
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
          </div>
        </div>
      </div>
    );
  }

  const ACC_ITEMS = [
    { value: 'parameters', title: 'Parameters', sub: 'Values Sage uses in conversation, such as booking links.', render: (notify) => <SageParameters notify={notify} /> },
    { value: 'thresholds', title: 'Chat Thresholds', sub: 'How long Sage waits before moving a session from In-progress → Active → Abandoned.', render: (notify) => <ChatThresholds notify={notify} /> },
    { value: 'invite-gate', title: 'Invite Gate', sub: 'Control whether this chat requires membership or an invite to access.', render: (notify) => <InviteGate notify={notify} /> },
    { value: 'appearance', title: 'Appearance', sub: 'Colors and fonts for your public chat website.', render: (notify) => <WebsiteAppearance notify={notify} /> },
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
