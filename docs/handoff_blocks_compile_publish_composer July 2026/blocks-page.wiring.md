# Wiring `CompilePublishModal` into `blocks-page.tsx`

Five small, contained edits to `app/admin/prompt-studio/blocks/page.tsx`. Everything else
in the file is unchanged.

---

### 1 · Import the new component + helper

```tsx
import { CompilePublishModal, compilePrompt } from '@/components/admin/prompt-studio/CompilePublishModal'
```

(Place next to the other component imports. `MASTER_PROMPT_VERSION` is already imported
from `lib/fixtures`.)

---

### 2 · `Overview` — rename the button's handler prop `onPublish` → `onCompile`

The button label is unchanged; only what it triggers changes (compile-then-review instead
of publish-immediately).

```diff
-function Overview({ blocks, promptSet, onPublish }: { blocks: Block[]; promptSet: string; onPublish: () => void }) {
+function Overview({ blocks, promptSet, onCompile }: { blocks: Block[]; promptSet: string; onCompile: () => void }) {
```

```diff
-            <Button onClick={onPublish}>Compile &amp; Publish</Button>
+            <Button onClick={onCompile}>Compile &amp; Publish</Button>
```

---

### 3 · Add compile state (next to the other `useState` in the page component)

```tsx
const [compileOpen, setCompileOpen] = useState(false)
const [compiling, setCompiling] = useState(false)
const [compiledText, setCompiledText] = useState('')
const nextVersion = MASTER_PROMPT_VERSION + 1
```

---

### 4 · Replace the one-shot `onPublish` with `onCompile` + a real `onPublish`

```diff
-  const onPublish = () => notify({ color: 'green', title: 'Prompt published', message: `Version ${MASTER_PROMPT_VERSION + 1}` })
+  const onCompile = () => {
+    // Client-side preview compile. Swap for your server compile endpoint if it is
+    // authoritative — set compiledText from its response and drive `compiling` off the
+    // request's pending state. See CompilePublishModal.tsx header.
+    setCompiledText(compilePrompt(activeBlocks))
+    setCompiling(true)
+    setCompileOpen(true)
+    setTimeout(() => setCompiling(false), 800)
+  }
+  const onPublish = () => {
+    setCompileOpen(false)
+    // TODO: POST the compiled prompt to your publish endpoint here.
+    notify({ color: 'green', title: 'Prompt published', message: `Version ${nextVersion}` })
+  }
```

`activeBlocks` is already derived in the component (the set's `status === 'active'` blocks),
so `compilePrompt` gets exactly what will ship.

---

### 5 · Pass `onCompile` to `Overview`, and mount the modal

```diff
-            <Overview blocks={activeBlocks} promptSet={promptSet} onPublish={onPublish} />
+            <Overview blocks={activeBlocks} promptSet={promptSet} onCompile={onCompile} />
```

Add the modal once, near the end of the returned tree (e.g. after the summary/table stack,
before the closing `</Box>`):

```tsx
<CompilePublishModal
  opened={compileOpen}
  onClose={() => setCompileOpen(false)}
  compiling={compiling}
  text={compiledText}
  set={summarySet}          {/* the COMPOSER_PROMPT_SETS row for the selected set */}
  version={nextVersion}
  onPublish={onPublish}
/>
```

`summarySet` already exists in the component
(`COMPOSER_PROMPT_SETS.find((s) => s.value === promptSet) ?? COMPOSER_PROMPT_SETS[0]`).

---

## Backend hook points
- **Compile** (`onCompile`) — currently compiles client-side via `compilePrompt()` for an
  instant, exact preview. If your compile is server-authoritative, `POST` to it on open and
  render the returned text; the modal props don't change.
- **Publish** (`onPublish`) — wire the actual version bump / write here. The modal is the
  confirmation gate; publishing only happens on the modal's **Publish** button.
- **Download** filename is `{set.value}-v{version}.txt` — adjust in the modal if you have a
  naming convention.
