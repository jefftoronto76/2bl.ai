# Drawer — `page.tsx` wiring guide

Exact changes to `app/admin/prompt-builder/page.tsx` to turn the drawer from
"renders, empty, inert" into a working history drawer. The chrome, state, and the
mount-time `GET /api/admin/conversations` fetch are **already on the branch** —
this guide closes the three gaps: **select (hydrate)**, **create-on-first-send +
append**, and the **`New` reset bug**. None of it touches the streaming engine.

> Backend prerequisite: the migration + service + routes in this package must be
> live first. Until then the page already degrades to an empty drawer.

---

## 1. Fix `startNewConversation` (bug — drops the active id)

Today `New` resets the chat but leaves `activeConversationId` pointing at the old
thread, so the next send would append to the wrong row.

```tsx
// before
function startNewConversation() {
  resetChat()
  setSidebarOpen(false)
}

// after
function startNewConversation() {
  resetChat()
  setActiveConversationId(null)   // ← start a genuinely fresh draft
  setSidebarOpen(false)
}
```

## 2. Add `handleSelectConversation` (replaces the `onSelect` no-op)

```tsx
async function handleSelectConversation(id: string) {
  if (id === activeConversationId) { setSidebarOpen(false); return }
  try {
    const res = await fetch(`/api/admin/conversations/${id}`)
    if (!res.ok) return
    const convo: {
      id: string
      messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[]
      promptSetId: string | null
    } = await res.json()

    resetChat()                              // clear drafts/upload/etc first
    setChatMessages(convo.messages ?? [])
    setActiveConversationId(convo.id)
    setSessionStartIndex(0)                  // count this thread's own exchanges (see decision §7.x)
    if (convo.promptSetId) setActivePromptSetId(convo.promptSetId)
    setSidebarOpen(false)
  } catch (err) {
    console.error('[conversations] hydrate failed:', err)
  }
}
```

Wire it on the sidebar:

```tsx
// before
<ConversationSidebar … onSelect={() => {}} … />
// after
<ConversationSidebar … onSelect={handleSelectConversation} … />
```

## 3. Persist on every completed turn (create-on-first-send + append)

Add one isolated helper. It **never throws into the stream** — persistence is
best-effort and must not regress chat.

```tsx
function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user')
  const t = (firstUser?.content ?? '').trim().replace(/\s+/g, ' ')
  return t ? (t.length > 48 ? t.slice(0, 48) + '…' : t) : 'New conversation'
}

async function persistConversation(finalMessages: ChatMessage[]) {
  if (finalMessages.length === 0) return
  const lastAssistant = [...finalMessages].reverse().find(m => m.role === 'assistant')
  const preview = (lastAssistant?.content ?? '').trim().slice(0, 140) || null
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const promptSetId = activePromptSetId && UUID_RE.test(activePromptSetId) ? activePromptSetId : null

  try {
    if (!activeConversationId) {
      // create-on-first-send
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: deriveTitle(finalMessages), preview, messages: finalMessages, promptSetId }),
      })
      if (!res.ok) return
      const row = await res.json()           // { id, title, preview, updatedAt }
      setActiveConversationId(row.id)
      setConversations(prev => [row, ...prev])
    } else {
      // append
      const id = activeConversationId
      const res = await fetch(`/api/admin/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview, messages: finalMessages }),
      })
      if (!res.ok) return
      const row = await res.json()
      setConversations(prev => [row, ...prev.filter(c => c.id !== id)])  // bump to top
    }
  } catch (err) {
    console.error('[conversations] persist failed:', err)   // swallow — chat already succeeded
  }
}
```

Call it at the **end of the success path** in `sendChatMessage`, right after the
final `setChatMessages(...)` / drafts handling — using the same `finalText`-derived
thread the function already built:

```tsx
      const finalThread: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: displayText, timestamp: placeholderMsg.timestamp },
      ]
      setChatMessages(finalThread)
      setClosingMessage(parsedClosing)
      // …existing drafts block…

      void persistConversation(finalThread)   // ← add, fire-and-forget
```

> Why here and not in `handleSend`: `sendChatMessage` is the single funnel for
> every turn — typed sends, the upload auto-trigger, and the opening pills all go
> through it. One call site covers them all.

## 4. (Optional) Top-bar title follows the loaded thread

Already handled: `topBarTitle` reads `activeConversation.title` when the active id
matches a non-draft row. Once `handleSelectConversation` sets `activeConversationId`
and the row is in `conversations`, the title updates for free.

## 5. Rename + Delete (per-row drawer actions)

The sidebar now renders a kebab → Rename (inline input) / Delete (inline confirm)
and calls two new callbacks. Add the handlers and pass them through.

```tsx
async function handleRenameConversation(id: string, title: string) {
  // optimistic
  setConversations(prev => prev.map(c => (c.id === id ? { ...c, title } : c)))
  try {
    await fetch(`/api/admin/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  } catch (err) {
    console.error('[conversations] rename failed:', err)   // optionally re-fetch to reconcile
  }
}

async function handleDeleteConversation(id: string) {
  setConversations(prev => prev.filter(c => c.id !== id))   // optimistic remove
  if (id === activeConversationId) startNewConversation()    // were we viewing it? reset
  try {
    await fetch(`/api/admin/conversations/${id}`, { method: 'DELETE' })
  } catch (err) {
    console.error('[conversations] delete failed:', err)
  }
}
```

Wire both on the sidebar (alongside the existing props):

```tsx
<ConversationSidebar
  …
  onSelect={handleSelectConversation}
  onRename={handleRenameConversation}
  onDelete={handleDeleteConversation}
/>
```

> Rename reuses the existing `PATCH /…/:id` (title only). Delete uses the new
> `DELETE /…/:id`. Both are optimistic; the confirm step lives in the sidebar, so
> the page just acts on the callback.

---

## State touched (all already declared on the branch)
`conversations`, `activeConversationId`, `activePromptSetId`, `sessionStartIndex`,
`chatMessages`. No new `useState` required.

## Engine NOT touched
`sendChatMessage` streaming, `parseAllDoneJson`, file upload + `pendingAutoTrigger`,
draft cards, safety check, `saveBlockToSupabase` (which already sends
`prompt_set_id`), topics, exchange counter, copy. The only addition is one
fire-and-forget `persistConversation` call.
