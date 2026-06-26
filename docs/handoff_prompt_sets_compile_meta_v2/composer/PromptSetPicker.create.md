# Composer — expand "New prompt set…" to capture Name + Type + Description

The Composer top-bar picker (`components/admin/prompt-builder/PromptSetPicker.tsx`,
driven by `app/admin/prompt-builder/page.tsx`) lets you spin up a set inline. Today
the inline create captures a **name only** and POSTs `{ label }`. This change makes it
capture **Name, Type, and a short Description** — the same fields the Settings editor
exposes — so a set is well-formed at birth.

---

## 1. `page.tsx` — widen `createPromptSet`, fetch prompt types

`createPromptSet` currently takes a label and POSTs `{ label }`. Widen the signature
and body (the POST already targets `/api/admin/prompt-sets`, which accepts
`prompt_type_id` + `description`; with the PATCH change in
`api/admin/prompt-sets/route.GET-PATCH.md`, a draft keeps its type):

```tsx
// BEFORE
async function createPromptSet(label: string) {
  const name = label.trim()
  if (!name) return
  /* …optimistic… */
  const res = await fetch('/api/admin/prompt-sets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: name }),
  })
  /* … */
}

// AFTER
async function createPromptSet(input: { label: string; promptTypeId: string | null; description: string }) {
  const name = input.label.trim()
  if (!name) return
  const optimistic: PromptSet = { id: 'new-' + Math.random().toString(36).slice(2, 8), label: name, version: 1, status: 'Draft' }
  setPromptSets(prev => [...prev, optimistic])
  setActivePromptSetId(optimistic.id)
  try {
    const res = await fetch('/api/admin/prompt-sets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: name,
        description: input.description.trim(),
        status: 'draft',                  // inline creates are always Draft v1
        prompt_type_id: input.promptTypeId,
      }),
    })
    if (!res.ok) return
    const saved: PromptSet = await res.json()
    setPromptSets(prev => prev.map(s => (s.id === optimistic.id ? saved : s)))
    setActivePromptSetId(saved.id)
  } catch (err) {
    console.error('[createPromptSet] failed:', err)
  }
}
```

Fetch the tenant's prompt types once (same endpoint Settings uses) and pass them to
the picker so the Type select is populated:

```tsx
const [promptTypes, setPromptTypes] = useState<{ id: string; name: string }[]>([])
useEffect(() => {
  fetch('/api/admin/prompt-types').then(r => (r.ok ? r.json() : [])).then(setPromptTypes).catch(() => {})
}, [])
```

```tsx
<PromptSetPicker
  sets={promptSets}
  activeId={activePromptSetId}
  promptTypes={promptTypes}      {/* NEW */}
  onSelect={setActivePromptSetId}
  onCreate={createPromptSet}     {/* now takes the 3-field object */}
/>
```

---

## 2. `PromptSetPicker.tsx` — replace the single input with a 3-field form

Update the props and the `creating` branch. Everything else in the component is
unchanged.

```tsx
interface PromptSetPickerProps {
  sets: PromptSet[]
  activeId: string
  promptTypes: { id: string; name: string }[]                       // NEW
  onSelect: (id: string) => void
  onCreate: (input: { label: string; promptTypeId: string | null; description: string }) => void  // CHANGED
}
```

```tsx
// state
const [name, setName] = useState('')
const [typeId, setTypeId] = useState('')      // NEW: '' = "No type yet"
const [desc, setDesc] = useState('')          // NEW

function resetCreate() { setCreating(false); setName(''); setTypeId(''); setDesc('') }

function create() {
  const label = name.trim()
  if (!label) return
  onCreate({ label, promptTypeId: typeId || null, description: desc })
  resetCreate(); setOpen(false)
}
```

```tsx
{/* the `creating ?` branch — replaces the old single .create row */}
{creating ? (
  <div className={styles.createForm}>
    <label className={styles.cfLabel}>Name</label>
    <input
      autoFocus
      className={styles.cfInput}
      value={name}
      placeholder="e.g. Sage Base"
      onChange={e => setName(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape') resetCreate() }}
    />

    <label className={styles.cfLabel}>Type</label>
    <select className={styles.cfSelect} value={typeId} onChange={e => setTypeId(e.target.value)}>
      <option value="">No type yet</option>
      {promptTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>

    <label className={styles.cfLabel}>Description</label>
    <textarea
      className={styles.cfTextarea}
      rows={2}
      value={desc}
      placeholder="What this set is for…"
      onChange={e => setDesc(e.target.value)}
    />

    <div className={styles.cfActions}>
      <button type="button" className={styles.cfCancel} onClick={resetCreate}>Cancel</button>
      <button type="button" className={styles.createGo} disabled={!name.trim()} onClick={create}>Create</button>
    </div>
  </div>
) : (
  <button type="button" className={styles.newItem} onClick={() => setCreating(true)}>
    <Plus /> New prompt set…
  </button>
)}
```

---

## 3. `PromptSetPicker.module.css` — add the form styles

```css
.createForm { display: flex; flex-direction: column; gap: 7px; padding: 6px 8px 8px; }
.cfLabel {
  font-family: var(--mantine-font-family-monospace);
  font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--mantine-color-gray-6, #868e96);
}
.cfInput, .cfSelect, .cfTextarea {
  width: 100%; border: 1px solid var(--mantine-color-gray-3, #dee2e6); border-radius: 8px;
  font-size: 13px; color: #1a1917; outline: none; font-family: inherit; background: #fff;
}
.cfInput, .cfSelect { height: 32px; padding: 0 10px; }
.cfTextarea { padding: 7px 10px; resize: vertical; min-height: 50px; line-height: 1.45; }
.cfInput:focus, .cfSelect:focus, .cfTextarea:focus { border-color: #4fa574; }
.cfActions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 1px; }
.cfCancel {
  height: 32px; padding: 0 12px; border: 1px solid var(--mantine-color-gray-3, #dee2e6);
  border-radius: 8px; background: #fff; color: rgba(26,25,23,0.62); font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.cfCancel:hover { background: var(--mantine-color-gray-0, #f8f9fa); }
```

The existing `.createGo` button style is reused for **Create**.
