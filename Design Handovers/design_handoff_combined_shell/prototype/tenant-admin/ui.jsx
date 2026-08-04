/* Shared UI primitives for the tenant admin — faithful to Mantine + the
   admin theme. Exposed on window.TUI. Each screen file pulls what it needs. */
(function () {
  const { useState, useRef, useEffect } = React;
  const I = window.Icons;

  /* ── Toast host (Mantine Notifications, top-right) ── */
  let _tid = 0;
  function useToasts() {
    const [items, setItems] = useState([]);
    const show = ({ color = 'green', title, message }) => {
      const id = ++_tid;
      setItems((p) => [...p, { id, color, title, message }]);
      setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 3600);
    };
    const view = (
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.color}`}>
            <span className="bar" />
            <div>
              <div className="t-title">{t.title}</div>
              {t.message && <div className="t-msg">{t.message}</div>}
            </div>
          </div>
        ))}
      </div>
    );
    return { show, view };
  }

  /* ── Button ── */
  function Button({ children, variant = 'filled', color, leftSection, loading, disabled, onClick, size, fullWidth, className }) {
    let cls = 'btn ';
    if (size === 'sm') cls += 'btn-sm ';
    if (variant === 'filled') cls += color === 'red' ? 'btn-danger' : 'btn-filled';
    else if (variant === 'subtle') cls += 'btn-subtle' + (color === 'red' ? ' red' : '');
    else if (variant === 'default' || variant === 'white') cls += 'btn-white';
    else cls += 'btn-filled';
    if (fullWidth) cls += ' full';
    if (className) cls += ' ' + className;
    return (
      <button className={cls} onClick={onClick} disabled={disabled || loading} style={fullWidth ? { width: '100%', justifyContent: 'center' } : undefined}>
        {loading ? <span className="spin" /> : leftSection}
        {children}
      </button>
    );
  }

  /* ── ActionIcon ── */
  function ActionIcon({ children, onClick, color, disabled, ariaLabel, className }) {
    return (
      <button className={`actionicon ${className || ''}`} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
        style={color === 'red' ? { color: 'var(--red-6)' } : color === 'green' ? { color: 'var(--green-6)' } : undefined}>
        {children}
      </button>
    );
  }

  /* ── Select (Mantine look, lightweight) ── */
  function Select({ label, placeholder = 'Select…', description, data, value, onChange, size, disabled, required }) {
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
      <div className="field">
        {label && <label>{label}{required && <span className="req">*</span>}</label>}
        <div className="select" ref={ref}>
          <div className={`select-trigger ${open ? 'open' : ''}`} tabIndex={0}
            onClick={() => !disabled && setOpen((o) => !o)}
            style={disabled ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
            {selected ? <span className="val">{selected.label}</span> : <span className="ph">{placeholder}</span>}
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
        {description && <div className="desc">{description}</div>}
      </div>
    );
  }

  /* ── TextInput ── */
  function TextInput({ label, placeholder, description, value, onChange, required, maxLength, type, autoFocus }) {
    return (
      <div className="field">
        {label && <label>{label}{required && <span className="req">*</span>}</label>}
        <input className="input" placeholder={placeholder} value={value} maxLength={maxLength} type={type}
          autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
        {description && <div className="desc">{description}</div>}
      </div>
    );
  }

  /* ── Textarea ── */
  function Textarea({ label, value, onChange, placeholder, rows = 4, mono, description }) {
    return (
      <div className="field">
        {label && <label>{label}</label>}
        <textarea className="prompt-area" value={value} placeholder={placeholder} rows={rows}
          onChange={(e) => onChange(e.target.value)}
          style={mono ? undefined : { fontFamily: 'var(--font)' }} />
        {description && <div className="desc">{description}</div>}
      </div>
    );
  }

  /* ── NumberInput ── */
  function NumberInput({ label, description, value, onChange, min = 1, step = 1, disabled }) {
    return (
      <div className="numfield field">
        {label && <label>{label}</label>}
        <input className="input" type="number" value={value} min={min} step={step} disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        {description && <div className="desc">{description}</div>}
      </div>
    );
  }

  /* ── Switch ── */
  function Switch({ checked, onChange, label, description, disabled }) {
    return (
      <label className="switch" style={disabled ? { opacity: 0.6 } : undefined}>
        <span className={`switch-track ${checked ? 'on' : ''}`} onClick={() => !disabled && onChange(!checked)}>
          <span className="switch-thumb" />
        </span>
        {(label || description) && (
          <span className="switch-textwrap">
            {label && <span className="switch-label">{label}</span>}
            {description && <span className="switch-desc">{description}</span>}
          </span>
        )}
      </label>
    );
  }

  /* ── Light badge ── */
  function Lbadge({ text, bg, fg, sm }) {
    return <span className={`lbadge ${sm ? 'sm' : ''}`} style={{ background: bg, color: fg }}>{text}</span>;
  }
  function TypeBadge({ type, sm }) {
    const c = window.BLOCK_BADGE[window.BLOCK_TYPE_COLORS[type]];
    return <Lbadge text={window.formatTypeBadgeLabel(type)} bg={c.bg} fg={c.fg} sm={sm} />;
  }

  /* ── Skeleton ── */
  function Skeleton({ h = 14, w = '100%', radius = 4 }) {
    return <span className="sk" style={{ display: 'block', height: h, width: w, borderRadius: radius }} />;
  }

  /* ── Progress ── */
  function Progress({ value, color = 'green' }) {
    return <div className="progress"><span className={color} style={{ width: `${Math.min(value, 100)}%` }} /></div>;
  }

  /* ── Card (outlined) ── */
  function Card({ children, flat, style }) {
    return <div className={`ucard ${flat ? 'flat' : ''}`} style={style}>{children}</div>;
  }

  window.TUI = { useToasts, Button, ActionIcon, Select, TextInput, Textarea, NumberInput, Switch, Lbadge, TypeBadge, Skeleton, Progress, Card };
})();
