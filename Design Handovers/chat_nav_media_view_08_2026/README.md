# Handover three \u2014 Media view from the chat nav

Source: `production-reference/chat-widget-canvas.jsx`. This is the **in-chat** Media entry point \u2014 distinct from the sidebar's global "Media" row, which opens the standalone top-level page (see the earlier Media handover package, stage 1).

## Where it lives
An icon button in the chat drawer's own header toolbar (~line 2178), immediately left of Share Heirloom, right after the "Memories from this chat" bookmark icon so the two sit side-by-side (explicit request from an earlier round):
```
<IconBtn n="image" s={16} label="Media from this chat" onClick={openMediaGallery} style={{ marginRight: 4 }} />
```

## What it opens
`openMediaGallery` (~line 2042):
```
const openMediaGallery = useCallback(() => { setMediaOpen(true); setOpenMemId(null); setSessionListOpen(false); }, []);
```
Sets `mediaOpen` true, and explicitly closes the memory panel (`openMemId`) and the session-memories select list (`sessionListOpen`) if either was open \u2014 this view is mutually exclusive with those. `panelOpen` (the flag that drives the chat drawer's third-pane width / mobile bottom-sheet visibility) is `!!openMemId || sessionListOpen || mediaOpen` \u2014 so opening this Media view expands the same panel slot the memory card uses.

A matching `useEffect` (search `if (openMemId || sessionListOpen) setMediaOpen(false)`) closes this view back down if the user opens a memory or the session list instead \u2014 keeps the exclusivity working in both directions.

## What renders there
`<MediaGallery sessionId={activeId} onClose={() => setMediaOpen(false)} ... />`, rendered at both the desktop third-pane call site and the mobile bottom-sheet call site (search `mediaOpen &&` \u2014 there are two, one per layout). Passing `sessionId={activeId}` is what scopes this view to **only the current chat's media** \u2014 this is the key difference from the sidebar's global Media page, which passes no `sessionId` and shows everything.

`MediaGallery` itself is a thin header (title + optional back-chevron, currently unused here + close) wrapping `MediaItemsList`, which does the actual filtering (`SEED_MEDIA_ITEMS.filter(it => it.sessionId === sessionId)`) and renders the same flex-wrap card grid, per-type tile treatment, and footer actions (add-to-memory / edit stub / delete+confirm) documented in the main Media handover package \u2014 not duplicated here.

## Known-knowns
- Deliberately scoped narrower than the standalone page: "this chat's media only," matching the icon's label.
- Shares 100% of its card rendering/actions code with the standalone page \u2014 only the `sessionId` prop and the surrounding chrome (header, panel-slot vs. full-screen) differ.

## Unknown-knowns
- No visual mobile confirmation yet for this specific entry point (same caveat as the rest of Media \u2014 see stage 4 of the main Media handover package).
- Whether a session with zero media items should hide this header icon entirely (vs. showing it and letting the empty state inside handle it, which is what happens today) hasn't been discussed.
