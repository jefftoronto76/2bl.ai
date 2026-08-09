# Stage 4 \u2014 Mobile

## What's confirmed
- Every Media-related element (standalone page overlay, in-chat panel, the add-to-memory slide-in panel) is a plain `position: fixed` layout in the shared `chat-widget-canvas.jsx` \u2014 none of it is gated behind a desktop-only / `!isMobile` check, so nothing excludes mobile by construction.
- The add-to-memory panel explicitly uses `width: min(400px, 100vw)`, so on a narrow viewport it goes full-width instead of staying pinned at 400px and clipping.
- The card grid is flex-wrap with a `minWidth: 180` per card (see stage 1) \u2014 on a phone-width viewport this should collapse to 1 column naturally, no separate mobile CSS needed.
- The in-chat Media panel already inherits the same desktop-resizable-column / mobile-bottom-sheet split the memory panel uses (`isMobile` branch built earlier this project) \u2014 it doesn't have its own separate mobile logic to get wrong.

## What's NOT confirmed \u2014 flagging explicitly, don't assume verified
- **No visual mobile screenshot exists for the Media page or the add-to-memory panel.** The project's device-frame mobile prototype (`Heirloom Mobile Prototype.html`) nests the real page inside an `<iframe>`, and the screenshot tooling used to check this can't capture through that iframe \u2014 attempts returned a blank device frame with no error, which is a tooling limitation, not proof of a bug.
- Recommended next step before calling mobile "done": open `Heirloom Mobile Prototype.html` directly (not via automated screenshot) and manually click through Media \u2192 Add to memory at phone width, or test `Heirloom Lander - Summer 2026 - Story Canvas.html` directly with the browser's device toolbar.
