# Patch: `components/admin/content/BlockRow.tsx`

**Status "Active" uses green; the design uses the brand accent (terracotta).** In the
design the toggle is the theme primary and the label is plain text — the branch hardcoded
green on both.

Status cell, two edits:

```diff
           <Switch
             checked={block.status === 'active'}
             onChange={e => handleStatusToggle(e.currentTarget.checked)}
-            color="green"
+            color="brand"
             disabled={isSaving}
             aria-label={`${
               block.status === 'active' ? 'Disable' : 'Enable'
             } ${block.title}`}
           />
           <Text
             aria-hidden
             variant={block.status === 'active' ? 'body' : 'muted'}
             style={{
               fontSize: 'var(--mantine-font-size-sm)',
-              color:
-                block.status === 'active'
-                  ? 'var(--mantine-color-green-7)'
-                  : undefined,
             }}
           >
             {block.status === 'active' ? 'Active' : 'Disabled'}
           </Text>
```

The switch now fills terracotta when Active (theme primary); the "Active" label reverts to
default text (matching the design — `variant="body"` for active, `"muted"` for disabled).
