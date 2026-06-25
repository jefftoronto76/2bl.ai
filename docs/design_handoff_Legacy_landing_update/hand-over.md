# Hand-over — Heirloom Landing Page Update

**Target:** `heirloom.2bl.ai` → `app/heirloom/`
**Repo:** `jefftoronto76/2bl.ai` (branch `main`)
**Status:** High-fidelity prototype, ready to implement.

> ⚠️ **`.jsx` here is the prototype, not the deliverable.** The files in this bundle are `.jsx` because the prototype runs in a browser via React 18 + inline Babel (which transpiles `.jsx`, not `.tsx`). **Production is TypeScript — implement in the existing `.tsx` components** under `app/heirloom/components/landing/` using the codebase's Tailwind tokens, `next/font`, and `lucide-react`. Do not copy the `.jsx`/inline-style code into the repo verbatim.
**Supersedes:** `design_handoff_landing_redesign/README.md` (earlier pass — read this file for the current shipping intent; the older README is retained only for the token reference table, which still applies).

---

## TL;DR — what changed in this update

This update takes the redesign that's already documented and moves it forward on five fronts:

0. **Brand rename: Heirloom → Legacy.** Every user-facing instance of "Heirloom" in the prototype is now **"Legacy"** — nav wordmark, all hero layouts, the book-cover mock, every differentiator card, page `<title>`, splash, and the chat widget's share copy. **Preserved on purpose** (do not blanket find/replace these in the codebase): the `#what-is-heirloom` section anchor + the nav link that targets it, the `heirloom.life` share domain, the `hl.*` localStorage keys, the live tenant domain `heirloom.2bl.ai`, and the `app/heirloom/` route path. Confirm with the stakeholder whether the rename is final and whether the route/domain should follow.
1. **Flat base ships — not the paper treatment.** Drop the warm radial "paper" glow **and** the grain. Ship the **flat egg-shell base** (prototype `base: "plain"`): solid `#FAF6EE` page, pure-white `#FFFFFF` surfaces, no texture. The paper and ink bases remain in the prototype as exploration only.
2. **Nav gained real navigation + a mobile menu.** Center links (The Best Part / Pricing / About), a ghost **Sign Up**, the solid **Start Your Story**, and a **hamburger dropdown** below 768px.
3. **"The Legacy" section was restructured** so **The Book is the centerpiece** (a large feature card with a CSS book cover), and the other formats drop to a secondary "Other ways to share it" row.
4. **Differentiators finalized** — the **Secure & responsible** card is now a normal grid card that links out, alongside the **"A live editor"** coming-soon teaser with a persisted vote.

Everything else (one-accent system, terracotta `#C8542E`, typography) is unchanged from the prior handoff.

> **Note on the rename in this doc:** headings below still say "The Legacy" for the *section* and reference `app/heirloom/` paths — those are file/route/section identifiers, not the brand wordmark, and are intentionally left as-is.

---

## The one decision that matters: flat base

> Ship the **flat** base. No paper glow, no grain.

| | Value (flat / "plain") |
|---|---|
| Page background | `#FAF6EE` |
| Surface / card | `#FFFFFF` |
| Surface (alt) | `#F4EFE5` |
| Border | `#E6DCC8` → when accent-borders ON: `color-mix(in srgb, #C8542E 28%, transparent)` |
| Radial hero/CTA glow | **removed** (collapses to flat `#FAF6EE`) |
| Paper grain overlay | **removed** |

Implementation in the codebase:
- In `app/heirloom/globals.css`, the `.bg-hero-glow` / `.bg-contributor-glow` / `.bg-pricing-glow` / `.bg-cta-glow` utilities currently paint radial gradients. For the flat ship, set each to the flat page colour (`background: rgb(var(--hl-bg));`) or remove the class from the sections. Do **not** keep the gradient stops.
- There is no grain in the live codebase today, so nothing to remove there — just don't add the prototype's `.paper-grain` overlay.
- Accent stays terracotta: `--color-accent: 200 84 46;` (`#C8542E`), `--hl-accent-hover: #A93F1D;`.

---

## Files in this bundle (functional)

Open `Heirloom_New Lander.html` — it runs the whole prototype standalone (React 18 + inline Babel).

| File | Role | Ship? |
|---|---|---|
| `Heirloom_New Lander.html` | Entry point. `:root` token fallback + footer CSS (`.hl-foot*`) + responsive `@media` rules. | Reference |
| `landing.jsx` | **Primary visual reference.** All landing sections: Nav (+ mobile menu), Hero (4 layouts), What Is Heirloom, The Best Parts (differentiators), The Legacy (book centerpiece), closing CTA, footer. | **Yes** |
| `main-v2.jsx` | Theme math (`MOODS`, `buildTheme`, accent derivation), Tweaks wiring, mobile-preview bezel. **Default base is now `plain` (flat).** Reference for token math only. | Reference |
| `icons.jsx` | Standalone lucide path subset. In the app use `lucide-react` directly. | Reference |
| `tweaks-panel.jsx` | Prototype Tweaks shell — exploration only. | No |
| `chat-v2.jsx` | The sliding chat widget. Included **only so the prototype runs** (the root imports it). **Chat is out of scope for this update** — do not re-implement from here. | No |

> These are design references in HTML/JSX, **not** drop-in production code. Re-implement in the Next.js codebase using its Tailwind semantic tokens (`bg-surface`, `text-text-primary`, `bg-accent`, `border-accent/50`, `text-background`, `font-display/-body/-mono`), `next/font`, and `lucide-react`. Do not port inline-style JSX verbatim.

---

## Section-by-section spec & codebase mapping

The prototype's landing order is: **Nav → Hero → What Is Heirloom → The Best Parts → The Legacy → Closing CTA → Footer.** The live page (`LandingPage.tsx`) currently renders more sections (Features, HowItWorks, ContributorModel, Testimonials, BuyerPersonas, Pricing, AddOns). Decide with the stakeholder which live sections to keep; the prototype reflects the intended marketing spine. Mapping below.

### 1. Nav → `LandingNav.tsx`
- Wordmark (feather chip + "Heirloom") left.
- **Center links** (desktop only, hidden ≤768px): **The Best Part** (→ `#the-best-part`), **Pricing** (no target yet — wire to `#pricing` or a route), **About** (→ `#what-is-heirloom`).
- Right: ghost **Sign Up** (hidden on mobile; keeps the existing Clerk `openSignUp`), solid **Start Your Story** (`bg-accent text-background`, → `dispatch({ type: 'OPEN_CHAT' })`).
- **NEW — mobile hamburger** (≤768px): toggles a dropdown panel that animates open (max-height + opacity), lists the same links + Sign Up, closes on selection and on resize back to desktop. `aria-expanded` on the button.
- Bar background turns to `surface/95` + blur + 1px accent-line bottom border once `scrollY > 24` **or** the menu is open.

### 2. Hero → `HeroSection` in `LandingPage.tsx`
**Shipping layout = `formats`** (asymmetric: copy left, a fanned stack of "editions" right). Other layouts (`cover`, `editorial`, `centered`) stay as prototype tweaks.
- Eyebrow: **"Private. Secure. Collaborative."** (mono, accent).
- H1: **"Heirloom"** (display 300, `clamp(56px,8vw,108px)`).
- Lede (accent italic): **"Capture life as it happens."**
- Body (two lines): *"The moments pass quickly. The stories behind them fade even faster."* + *"Capture memories while they're fresh, and turn them into something you'll always have."*
- CTAs: **Start Your Story** (→ OPEN_CHAT), ghost **Learn More** (→ smooth-scroll `#learn-more`).
- Visual: `FormatFan` — five stacked, slightly-rotated edition cards (Book, Webpage, Audiobook, Comic, Time Capsule), each an icon chip + name + tag + index. Built from divs/tokens; **no illustrative SVG**. Hidden ≤920px.

### 3. What Is Heirloom → `WhatIsHeirloomSection.tsx`  (id `what-is-heirloom`, also `#learn-more` anchor)
- Eyebrow "What Is Heirloom"; H2 "Through simple conversations, Heirloom helps you give your memories a future."
- Three numbered cards, each with a hairline top rule, icon chip, faint oversized index, mono label, body:
  - **Capture** (mic) — "Start with a memory, a photo, or a voice note. Invite others to deepen the story."
  - **Shape** (sparkles) — "Heirloom's storytelling engine helps you uncover what matters most and tell it well."
  - **Publish** (book-open) — "Give those stories a form that can be shared, revisited, and passed along."
- Grid collapses to 1 column ≤768px.

### 4. The Best Parts (differentiators) → `FeaturesSection.tsx`  (id `the-best-part`)
- Eyebrow "Changing the way memories are saved and shared."; H2 "The Best Parts".
- **Lead card** (full-width, feather chip): eyebrow "Storytelling, built in", H3 **"You don't have to be a writer."**, craft paragraph.
- **2×2 card grid:**
  - **Questions that draw it out** (message)
  - **Many voices, one story** (users)
  - **Memories keep their media** (image)
  - **It remembers, even if you don't** (clock)
- **Secure & responsible** (shield) — standard grid card, **wraps an `<a>`** (links to a security/privacy page — **route TBD, confirm**). Body ends with accent **"Learn more →"**.
- **A live editor** — coming-soon teaser, **dashed** accent border, "Coming soon" pill, and a **vote button** (heart + count) persisted to `localStorage['hl.liveEditorVote']` (`'1'` = voted; bumps the count by one).

### 5. The Legacy → restructured (maps onto `ContributorModelSection.tsx` area / new section)  (id `the-best-part` sibling)
**This is the biggest structural change.**
- Eyebrow "The Legacy"; H2 **"It becomes a book."**; sub-copy "A real one, in your hands. And when you want to, the same story can live on in other forms too."
- **Centerpiece — The Book:** a large two-column feature card (raised surface, accent-line border, soft shadow). Left: eyebrow "The centerpiece", H3 "The Book", description, and two mono pill tags — **Hardcover/paperback**, **On-demand**. Right: the CSS `BookCover` (spine + page-stack edge + framed cover, no SVG). Collapses to one centered column ≤820px.
- **Secondary — "Other ways to share it":** a labelled divider, then a 4-card grid — **The Comic** (panels), **The Webpage** (monitor), **The Audiobook** (headphones), **The Time Capsule** (clock). Grid: 4 → 2 (≤920px) → 1 (≤560px).

### 6. Closing CTA → `CtaSection.tsx`
- Feather icon (accent).
- Large italic serif line: **"All memories fade. They don't have to be forgotten."**
- Primary **Start Your Story** (→ OPEN_CHAT).
- Mono sub-copy: "Write your first story in under two minutes."

### 7. Footer → `Footer.tsx`  (**replace** the current Heirloom footer)
- **Transparent** background (page shows through), **1px solid accent top border** (thin terracotta line). Muted ink copy — not the old dark footer.
- Three columns: **brand** ("Brought to you by" / wordmark "Second Brain *Labs*" with "Labs" in accent italic / workshop blurb) · **Learn** (About / Blog / LinkedIn ↗) · **Contact** (`hello@2bl.ai` / "Toronto · Remote").
- Bottom row: "© <year> Second Brain Labs, Inc." + italic serif "Trying the impossible, one product at a time."
- Grid: 3 → 2 (≤760px) → 1 (≤460px).

---

## Mobile

The lander is a single responsive page — there is no separate mobile file. Preview it by setting the prototype's **Device → mobile** tweak (`main-v2.jsx` renders the same page inside a phone bezel at a true narrow viewport via `PhoneStage`). Implement with the same breakpoints in the `.tsx` components / Tailwind (`sm`/`md`):

| Breakpoint | What changes |
|---|---|
| **≤ 920px** | Hero collapses to one column and the right-hand `FormatFan` visual is **hidden** (`display:none`). The differentiator/"how" grid drops 3 → **2 columns**. |
| **≤ 820px** | "It becomes a book" centerpiece (`.book-feature`) goes one column, **center-aligned**; book cover sits above the copy. |
| **≤ 768px** | **Nav switches to mobile:** center links + ghost Sign Up hide, the **hamburger** appears and toggles the dropdown panel. "What Is" / Create-Your-Legacy grid → **1 column**. Drama taglines (`.hero-tagline`, normally `white-space:nowrap`) are allowed to **wrap**. Footer → 2 columns. |
| **≤ 560px** | Secondary "Other ways to share it" / how grid → **1 column**. |
| **≤ 460px** | Footer → **1 column**, tighter padding. |

Mobile specifics to carry over:
- **Hamburger menu** (the new nav behaviour) — see the *Nav* section above; this is the primary mobile interaction. `aria-expanded`, closes on link-select and on resize ≥769px.
- **Tap targets ≥ 44px** — the burger button, nav dropdown rows, and both CTAs must meet this on phones.
- **No horizontal scroll** — taglines wrap, the fanned hero stack is dropped (not shrunk) so nothing overflows.
- Respect `prefers-reduced-motion` for the scroll reveals on mobile too.

> The **chat widget** also has its own mobile drawer/hamburger pattern, specified separately in `design_handoff_mobile_nav/README.md`. That is the chat sidebar, **not** the landing nav — don't conflate the two. Chat remains out of scope for this landing update.

## Behaviour
- **Entrance reveals:** each section fades/rises in on scroll (IntersectionObserver), staggered ~80–130ms. Hero content is visible immediately. Reuse the existing `mounted` / IO pattern already in the codebase. Respect `prefers-reduced-motion`.
- **CTAs:** all *Start Your Story* → `dispatch({ type: 'OPEN_CHAT' })`. *Learn More* → smooth-scroll `#learn-more`. Nav links → smooth-scroll to section ids.
- **Mobile menu:** open/close state, closes on link select + on resize ≥769px.
- **Live-editor vote:** toggles count, persists to `localStorage['hl.liveEditorVote']`.
- **Chat widget itself is out of scope** for this update.

## Typography & tokens (unchanged)
Cormorant Garamond (display, 300 / 400 italic) · DM Sans (body) · DM Mono (mono — eyebrows, uppercase, tracked .26–.34em). One accent does all the work: buttons, eyebrows, italic ledes, icon chips, and (accent-borders ON) the hairlines. Full token table: see `design_handoff_landing_redesign/README.md` → *Design Tokens*. The only token delta in this update is the **flat base** (above).

## Open questions (confirm before/while implementing)
1. **Secure & responsible** "Learn more →" — destination route?
2. **Pricing** nav link — scroll to `#pricing` or a dedicated route?
3. Which of the current live sections (HowItWorks, Testimonials, BuyerPersonas, Pricing, AddOns) stay, and where do they sit relative to the new spine?
4. Confirm terracotta `#C8542E` is the shipping accent (forest `#2E854D` is still the live default).
