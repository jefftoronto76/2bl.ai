# Handover — chat/composer changes

Grounded in `jefftoronto76/2bl.ai@main`. Covers everything touching the chat
widget itself (composer surface, chips, "new conversation"). Section rail and
Problem.tsx copy are page-level, not chat — see
`Composer-Copy-SectionRail-Update.md` for those.

Branch: continue on `feat/mypov-section-why` (or cut a new branch off it).

---

## 1. Composer restyle — off-white surface, dark navy text

**File:** `app/(jefflougheed)/globals.css` (CSS-only; no JSX changes to
`WidgetShellHero` in `components/shells/widget/WidgetShell.tsx`).

```diff
 .composer{
-  background:rgb(var(--color-surface));border:1px solid var(--color-border);border-radius:18px;
+  background:rgb(245 244 240);border:1px solid rgb(24 32 41 / 0.12);border-radius:18px;
   padding:14px 14px 10px;
   box-shadow:0 8px 32px rgba(0,0,0,.05);
   transition:border-color .15s ease, box-shadow .15s ease;
 }
 .composer textarea{
   flex:1;border:none;outline:none;resize:none;background:transparent;
-  font-family:var(--font-body);font-size:16px;line-height:1.5;color:var(--color-text-primary);
+  font-family:var(--font-body);font-size:16px;line-height:1.5;color:rgb(24 32 41);
   min-height:28px;max-height:140px;padding:6px 6px;
 }
-.composer textarea::placeholder{color:var(--color-text-dim)}
+.composer textarea::placeholder{color:rgb(24 32 41 / 0.42)}
 .composer .meta{
   display:flex;justify-content:space-between;align-items:center;
-  margin-top:8px;padding-top:8px;border-top:1px solid var(--color-border);
-  font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:var(--color-text-dim);
+  margin-top:8px;padding-top:8px;border-top:1px solid rgb(24 32 41 / 0.12);
+  font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:rgb(24 32 41);
 }
```

Notes:
- The hero composer previously sat on the theme's dark `--color-surface`
  (`42 56 69`). This hardcodes an off-white surface instead, so every color
  inside it (text, placeholder, meta, hairline) is fixed dark navy
  `rgb(24 32 41)` rather than the light-on-dark `--color-text-*` tokens.
- `ai-badge` (`SAGE·AI`) and `.composer .send` (icon color via
  `html[data-brand="jefflougheed"] .composer .send`) are unaffected — leave
  both rules as-is.

## 2. Remove the hero suggestion chips

**File:** `components/shells/widget/WidgetShell.tsx`, `WidgetShellHero` —
delete the `{!isEngaged && (<div className="chips">...)}` block (five
`.chip` buttons) and the now-unused `handleChipClick` function. Also delete
`.chips`/`.chip`/`.chip:hover`/`.chip .arr`/`.stage.engaged .chips` from
`globals.css`.

## 3. "New conversation" control (clears IndexedDB)

Adds the control to both surfaces sharing the single "sage" session — hero
composer meta row, and the overlay header — since either can be active when
the visitor wants to start over.

Confirmation: native `window.confirm()`. Scope: `reset()` (in-memory store)
**and** the actual IndexedDB thread — `clearSession` if persisted,
`clearDraft` if it never got a server session id — so a reload doesn't
rehydrate the old conversation.

### `components/shells/widget/WidgetShell.tsx`

```diff
 import { useMessageFeedback } from '@/services/chat/ui/v1/useMessageFeedback'
+import { clearSession, clearDraft } from '@/services/chat/ui/v1/persistence'
 import { ChatThread } from '@/components/chat/ChatThread'
```

Add `reset` to the existing `useChatSessionContext()` destructure in both
`WidgetShellChat` and `WidgetShellHero`, then add this handler in each
component body:

```tsx
const startNewConversation = () => {
  if (!window.confirm('Start a new conversation? This clears the current chat.')) return
  void (sessionId ? clearSession('sage', sessionId) : clearDraft('sage'))
  reset()
}
```

**A — `WidgetShellChat` overlay header:** add a pill button beside the close
X, when `messages.length > 0`:
```tsx
<button onClick={startNewConversation} className="new-convo-pill">
  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/></svg>
  New chat
</button>
```
Wrap this plus the existing close button in one `flex items-center gap-2`
div so `justify-between` on the header still splits brand vs. actions.

**B — `WidgetShellHero` meta row:** add the link when `isEngaged`
(`messages.length > 0 && conversationVisible`, already computed):
```tsx
<button type="button" className="new-convo-link" onClick={startNewConversation}>
  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/></svg>
  New conversation
</button>
```
Place before `.send-hint`. Hide `.new-convo-link` under the existing
`@media (max-width: 768px)` block (same as `.send-hint`) so the meta row
doesn't crowd on mobile.

### `app/(jefflougheed)/globals.css`

```css
.new-convo-link{
  display:inline-flex;align-items:center;gap:5px;
  background:none;border:none;cursor:pointer;
  font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;
  color:rgb(24 32 41 / 0.55);
  transition:color .15s ease;
}
.new-convo-link:hover{color:rgb(24 32 41)}

.new-convo-pill{
  display:inline-flex;align-items:center;gap:6px;
  font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-text-muted);
  border:1px solid var(--color-border);border-radius:999px;
  padding:7px 13px;background:transparent;cursor:pointer;
  transition:color .15s ease, border-color .15s ease;
}
.new-convo-pill:hover{color:var(--color-text-primary);border-color:var(--color-border-hover)}

@media (max-width: 768px) {
  .new-convo-link{ display:none; }
}
```
`.new-convo-link` uses the hardcoded navy tokens (not `--color-text-*`) since
it lives inside the off-white composer from part 1. `.new-convo-pill` sits in
the overlay header, outside the composer, so it keeps the theme tokens.

---

## Verify
1. `npx tsc --noEmit` clean.
2. Hero composer: typed text renders solid dark navy on off-white, not the
   theme's light-ink color; placeholder and meta row match.
3. Chips gone from hero; no dead `handleChipClick`/`.chips` CSS left.
4. Hero: send a message → "New conversation" appears in the meta row; before
   any message, absent.
5. Overlay: open via `#chat` CTA, send a message → "New chat" appears in the
   header; fresh session hides it.
6. Click either → `confirm()` fires; confirming clears the thread (messages
   disappear, composer resets to empty-state).
7. Reload after clearing — old conversation does **not** rehydrate (confirms
   IndexedDB thread, not just in-memory store, was cleared).
8. Hero and overlay share one session: trigger "New chat" from the overlay,
   close it — hero composer shows the empty/disengaged state too.
