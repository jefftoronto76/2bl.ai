# Handover — "New conversation" control (clears IndexedDB)

Grounded in `jefftoronto76/2bl.ai@main`. Adds the control to both surfaces
that share the single "sage" session — the hero composer's meta row, and the
full-screen overlay's header — since either can be the one the visitor is on
when they want to start over.

Branch: continue on `feat/mypov-section-why` (or cut a new branch off it).

Confirmation: native `window.confirm()`. Scope: `reset()` (clears the
in-memory store) **and** clears the actual IndexedDB thread (`clearSession`
for a persisted thread, `clearDraft` for one that never got a server session
id yet) — so a reload doesn't rehydrate the old conversation.

---

## 1. `components/shells/widget/WidgetShell.tsx`

### Import the persistence helpers

```diff
 import { useMessageFeedback } from '@/services/chat/ui/v1/useMessageFeedback'
+import { clearSession, clearDraft } from '@/services/chat/ui/v1/persistence'
 import { ChatThread } from '@/components/chat/ChatThread'
```

### Shared handler — add once, used by both surfaces

Both `WidgetShellChat` and `WidgetShellHero` already destructure `sessionId`
from `useChatSessionContext()`; add `reset` to that same destructure in each,
then add this local function in each component body:

```tsx
const startNewConversation = () => {
  if (!window.confirm('Start a new conversation? This clears the current chat.')) return
  void (sessionId ? clearSession('sage', sessionId) : clearDraft('sage'))
  reset()
}
```

```diff
- const { messages, sessionId, isStreaming, errorType, mode, send, retry, stop, regenerate, setActiveVersion, setMode } =
+ const { messages, sessionId, isStreaming, errorType, mode, send, retry, stop, regenerate, setActiveVersion, setMode, reset } =
     useChatSessionContext()
```
(same edit in `WidgetShellHero`'s destructure, minus `mode`/`setMode` which
it doesn't use.)

### A — `WidgetShellChat` overlay header: add a pill button beside the close X

```diff
             &lt;h1 className="font-display text-[22px] font-normal leading-none tracking-[-0.01em] text-[color:var(--color-text-primary)]"&gt;
               Sage
             &lt;/h1&gt;
           &lt;/div&gt;
+          &lt;div className="flex items-center gap-2"&gt;
+          {messages.length &gt; 0 &amp;&amp; (
+            &lt;button
+              onClick={startNewConversation}
+              className="new-convo-pill"
+            &gt;
+              &lt;svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden&gt;
+                &lt;path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/&gt;
+              &lt;/svg&gt;
+              New chat
+            &lt;/button&gt;
+          )}
           &lt;button
             onClick={collapse}
             aria-label="Close chat"
             className="relative flex h-11 w-11 items-center justify-center bg-transparent text-[color:var(--color-text-muted)] before:absolute before:inset-[-2px] before:content-['']"
           &gt;
             &lt;svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden&gt;
               &lt;path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/&gt;
             &lt;/svg&gt;
           &lt;/button&gt;
+          &lt;/div&gt;
```
(The existing close button was a direct sibling of the brand `div` inside the
`header` — wrap it plus the new pill in one `flex items-center gap-2` div so
`justify-between` on the header still splits brand vs. actions correctly.)

### B — `WidgetShellHero` composer meta row: add the link, replacing nothing

```diff
           &lt;div className="meta"&gt;
             &lt;span className="left"&gt;
               &lt;span className="ai-badge"&gt;
                 &lt;span className="dot"&gt;&lt;/span&gt;
                 SAGE·AI
               &lt;/span&gt;
               &lt;span&gt;{isStreaming ? 'Thinking…' : isEngaged ? 'Live conversation' : &lt;&gt;Trained on Jeff&amp;apos;s playbooks&lt;span className="reply-time"&gt; · Replies in ~5s&lt;/span&gt;&lt;/&gt;}&lt;/span&gt;
             &lt;/span&gt;
+            {isEngaged &amp;&amp; (
+              &lt;button type="button" className="new-convo-link" onClick={startNewConversation}&gt;
+                &lt;svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden&gt;
+                  &lt;path d="M3 10a7 7 0 1 1 2 5M3 10V5m0 5h5"/&gt;
+                &lt;/svg&gt;
+                New conversation
+              &lt;/button&gt;
+            )}
             &lt;span className="send-hint"&gt;↵ to send&lt;/span&gt;
           &lt;/div&gt;
```
Note `isEngaged` (`messages.length > 0 && conversationVisible`) is already
computed in `WidgetShellHero` — this reuses it so the link only appears once
there's an actual conversation to clear.

On mobile the `.send-hint` is hidden already (`.send-hint { display: none }`
under the existing `@media (max-width: 768px)` block) — do the same for
`.new-convo-link` there, or the meta row gets crowded on a small screen (see
CSS below).

---

## 2. `app/(jefflougheed)/globals.css`

```css
.new-convo-link{
  display:inline-flex;align-items:center;gap:5px;
  background:none;border:none;cursor:pointer;
  font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;
  color:var(--color-text-dim);
  transition:color .15s ease;
}
.new-convo-link:hover{color:var(--color-text-primary)}

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

(Composer text/border colors were switched to hardcoded dark-navy values in
the earlier composer-restyle handover — if that shipped first, `.new-convo-link`
should use the same hardcoded `rgb(24 32 41 / …)` values instead of the
`--color-text-*` tokens, to stay legible on the off-white composer surface.
The overlay header pill sits outside the composer, so it keeps the token-based
colors above as-is.)

---

## Verify
1. `npx tsc --noEmit` clean.
2. Hero: send one message, confirm "New conversation" appears in the meta
   row; before any message, it's absent.
3. Overlay: open it via the `#chat` CTA, send a message, confirm "New chat"
   appears in the header; on a fresh session it's hidden.
4. Click either — browser `confirm()` fires; confirming clears the
   thread (messages disappear, composer resets to the empty-state
   placeholder/greeting).
5. Reload the page after clearing — the old conversation does **not**
   rehydrate (confirms the IndexedDB thread, not just the in-memory store,
   was cleared).
6. Since Hero and overlay share one session: trigger "New chat" from the
   overlay, then close it — the hero composer should also show the
   empty/disengaged state, not the cleared thread's ghost.
