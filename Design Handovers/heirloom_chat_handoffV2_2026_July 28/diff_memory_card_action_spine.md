# Diff — Memory card action footer

**File:** `chat-widget.jsx` · `MemoryCard`, `draft` state
**Why:** With type-specific actions added, the single wrapping row fragmented the action spine.
At the default drawer width the card content box is ~367px; total intrinsic button width was
400–480px, so `flexWrap` always triggered. On audio and video that pulled **Rewrite** up beside
the type action and left **Discard** alone on line 2 — where its `marginLeft: auto` made the
destructive action a full-width right-aligned row with more weight than the primary.

**Fix:** Split the footer into two rows. Type-specific extras get their own row above; the spine
(`Keep this · Rewrite · Discard`) stays on one line, always, in that order.

---

## Before

```jsx
<div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18, paddingTop: 15, borderTop: '1px solid var(--hl-border)' }}>
  <button onClick={() => onSave(storyId)} style={{ /* accent primary */ }}>
    <Icon n="bookmark" s={13} />Keep this
  </button>
  {K.extra.map(([ic, lbl]) => (
    <button key={lbl} onClick={onExtra} style={{ ...ghost, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon n={ic} s={13} />{lbl}
    </button>
  ))}
  <button onClick={onRewrite} style={ghost}>Rewrite</button>
  <button onClick={onDiscard} style={{ ...ghost, border: 'none', marginLeft: 'auto', color: 'var(--hl-faint)' }}>Discard</button>
</div>
```

## After

```jsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18, paddingTop: 15, borderTop: '1px solid var(--hl-border)' }}>

  {/* Row 1 — type-specific actions. Own row, smaller, allowed to wrap. */}
  {K.extra.length > 0 && (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {K.extra.map(([ic, lbl]) => (
        <button key={lbl} onClick={onExtra} style={{ ...ghost, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', fontSize: 12 }}>
          <Icon n={ic} s={13} />{lbl}
        </button>
      ))}
    </div>
  )}

  {/* Row 2 — the spine. Never wraps, never reorders. */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <button onClick={() => onSave(storyId)} style={{ /* accent primary */ whiteSpace: 'nowrap' }}>
      <Icon n="bookmark" s={13} />Keep this
    </button>
    <button onClick={onRewrite} style={{ ...ghost, whiteSpace: 'nowrap' }}>Rewrite</button>
    <button onClick={onDiscard} style={{ ...ghost, border: 'none', marginLeft: 'auto', color: 'var(--hl-faint)', whiteSpace: 'nowrap' }}>Discard</button>
  </div>
</div>
```

---

## The changes, itemised

| # | Change | Reason |
|---|---|---|
| 1 | Wrapper `flexWrap: 'wrap'` → `flexDirection: 'column'`, `gap: 8` → `gap: 11` | Footer becomes two deliberate rows instead of one reflowing row |
| 2 | Extras moved out of the spine into their own `flex-wrap` row, rendered only when `K.extra.length > 0` | Conversation cards keep a single-row footer; typed cards don't push the spine |
| 3 | Extras restyled: `padding: '7px 11px'`, `fontSize: 12` (from `8px 13px` / 12.5) | Reads as secondary to the spine, and buys horizontal room |
| 4 | `whiteSpace: 'nowrap'` on all three spine buttons | Labels can't break internally at narrow widths |
| 5 | `marginLeft: 'auto'` on Discard — **kept** | Now safe: Discard can never be the only item on a line |

## Measurements

| | Before | After |
|---|---|---|
| Content box (default drawer) | 367px | 367px |
| Spine intrinsic width | 400–480px → wrapped | ~263px → fits |
| Rows in footer, typed card | 2 (fragmented) | 2 (intentional) |
| Rows in footer, conversation card | 1 | 1 (unchanged) |

## Tailwind equivalent

```jsx
<div className="mt-[18px] flex flex-col gap-[11px] border-t border-border pt-[15px]">
  {extras.length > 0 && (
    <div className="flex flex-wrap gap-1.5">{/* px-[11px] py-[7px] text-xs */}</div>
  )}
  <div className="flex items-center gap-2">
    <button className="… whitespace-nowrap">Keep this</button>
    <button className="… whitespace-nowrap">Rewrite</button>
    <button className="ml-auto … whitespace-nowrap">Discard</button>
  </div>
</div>
```

## Rule this establishes

> **The action spine is fixed: `Keep this` first, `Rewrite` and `Discard` last, one line, always.**
> Anything a memory kind adds goes on the row above. A card must be learnable regardless of what
> it holds — a visitor who has kept a photo memory should recognise the footer of an audio one.

This also scales: a kind with three or four type-specific actions wraps within its own row and
never threatens the spine.
