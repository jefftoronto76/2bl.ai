# Mobile — atomic handover

Scope: the mobile device-frame prototype and the mobile memory panel behavior in the chat widget. All changes below are shipped in the prototype; nothing here is a proposal.

## Files in this package
- `Heirloom Mobile Prototype.html` — iPhone-frame wrapper. Loads the real lander/widget in an iframe at phone width (402×874); not a separate mockup.
- `ios-frame.jsx` — the device bezel (`IOSDevice`, status bar, keyboard).
- `chat-widget-canvas.jsx` — chat widget; `isMobile` (`matchMedia(max-width:768px)`) drives all mobile branching.
- `story-canvas-panel.jsx` — `CardView`/`BlockCanvas`, shared by desktop panel and mobile sheet.

## Decisions made this session

**1. Device frame — status bar/dynamic island were covering app chrome.**
`IOSDevice` had the status bar `position: absolute` over the content column, so content started at `top: 0` and rendered underneath the bar/island. Fixed: status bar is now a normal-flow flex child above the content, so the app's own header always clears it. Dynamic island stays absolutely positioned on top, decorative only.

**2. OS keyboard now opens on real focus.**
`Heirloom Mobile Prototype.html` attaches `focusin`/`focusout` listeners to the embedded iframe's document (same-origin) and toggles `IOSDevice`'s `keyboard` prop live — tapping any text field/textarea/contenteditable in the real app slides up the iOS keyboard overlay; blurring closes it.

**3. Tapping a saved memory on mobile now opens the memory panel, not the story deck.**
`memOpen()` previously branched `isMobile` to `openCanvas()` (the full-screen story deck, slide-from-side). That was wrong — it now always sets `openMemId`, same as desktop, which drives the bottom-sheet panel.

**4. Memory panel is a full-screen overlay on mobile, not a partial sheet.**
Changed from `height: 88vh` with rounded top corners to `inset: 0` / `height: 100dvh`, edge-to-edge. Still slides in via `transform: translateY(100%) → translateY(0)`, `.45s cubic-bezier(.22,1,.36,1)`, both opening and closing (was previously only reachable via the wrong code path in #3, so it never actually played on open).
`CardView`'s existing header / scrollable canvas / footer (`Talk about this` · `Use as a base` · `Remove`) flex layout is unchanged and already gives the full-screen sheet a fixed header, a fixed bottom footer, and a scrollable canvas between them.
Stacking is above the mobile hamburger nav drawer (panel `z-index: 53` vs. nav's `18`/`19`) — opening the memory panel already covers the nav if it's open.

**5. Block-add "+" now matches the "add to story" "+".**
`BlockInserter`'s inline add-block button was a small outlined ghost circle (22px, bordered, muted). Changed to match the header's "add to story" button exactly: 30px filled circle, `var(--hl-accent)` background, `var(--hl-on-accent)` icon, no border.

## Known state, unchanged
- Reordering blocks and any block beyond the original passage/media are still visual-only (no `body_blocks` persistence) — see the main `Memory Canvas - Handover.md`.
- Desktop side-panel behavior (resize curtain, flex-basis layout) is untouched.
