# Centralization Completion Plan (v3 — corrected target structure)

## 0. Two definitions of done

1. **Architectural done** — `boundaries/element-types` flips `warn` → `error`. All **logic** in `services/` (headless), all **shared presentation** in `components/` (app-importable). (Steps A–G.)
2. **Zero-code-rollout done** — a new product needs *no new files*: a `tenants` row with `shell_type` + `tenant_branding` + prompt blocks renders a working product through one dynamic route. Requires dynamic routing **and** three-tier prompt inheritance. (Steps H–I.)

## 0.1 The hard rule (Correction 1) and the resulting target structure

**`services/` is headless — pure logic, hooks with no JSX, no React components. Anything with JSX moves to `components/`, never `services/`.**

```
services/chat/ui/v1/          ← headless ONLY: hooks + logic + stores
  useChatTurn.ts, useChatSession.ts, useKeyboardViewport.ts   (exist)
  store.ts, store-registry.ts, registry.ts, message.ts        (exist)
  parseBookingCards.ts        ← moves here (Step B, headless wrapper)
  persistence.ts              ← moves here (Step B, ex-chatPersistence)
  useSageParameters.ts        ← moves here (Step E, data hook, no JSX)
  chatReducer.ts              ← moves here (Step F, pure reducer)

components/                    ← app-importable shared PRESENTATION
  admin/**                    ← Step D (Mantine admin UI)
  shells/
    widget/                   ← Step E (JSX): Hero, Chat, Nav, SectionProcess,
                                 BookingCard, SageReply, markdownComponents,
                                 ChatSessionProvider-mount, widget-shell store provider
    membership/               ← Step F (JSX): ChatHero, ChatHeader, ChatInput,
                                 MessageList, Sidebar, chatStore Provider, ui/* primitives
```

Import directions stay legal: `app → components` (allowed via the new eslint `components` element-type), `app → services` (allowed), `components → services` (allowed), **`services → nothing in app/components`** (stays clean).

---

## 1. Grounding (verified on `main`)

- `services/` clean — no `src/`/`app/` imports.
- Dead (0 importers): `src/lib/ai.ts`; legacy `useChatStore` export; marketing cluster `About/Problems/Process/WhyMe/Career*/QuoteCarousel`.
- Boundary debt dominated by `@/components/admin/*` (presentation).
- Inline-logic routes: `platform/tenants[/id]`, `assets/upload`, `blocks/chat`, `prompt-chat`.
- `services/chat/ui/v1/message.ts` exists → Phase-0 message canonicalization likely satisfied (confirm before E).
- `tenant_branding` table exists (logo/palette/fonts) → substrate for Step I runtime branding.
- **globals.css split already done** — not a work item (verification above).

---

## 2. Workstreams (target · dependency · risk)

**A — Delete dead code.** No deps. *Low.* `ai.ts`; legacy `useChatStore` export; 7-file marketing cluster.

**B — Headless logic → `services/`.** No deps. *Low–Med.*
`parseBookingCards` → `services/chat/ui/v1/`; `chatPersistence`(+test) → `services/chat/ui/v1/persistence.ts` (preserve `heirloom:chat:v1:*` keys); `time` → `services/shared/` or delete.

**C — API routes → service delegation.** Independent. *Med–High.*
- `platform/tenants[/id]` → **`services/tenant/`**, including `resolveTenantConfig(host) → { tenant_id, shell_type, branding, capabilities }` consumed by Step I.
- `assets/upload`+`content[/id]`+`topics` → **`services/content/`**.
- `blocks/chat`+`prompt-chat` → extend **`services/prompt/`** (streaming; preserve AI-SDK wire format).

**D — Admin UI → `components/`.** Precede G. *Med.*
`src/components/admin/**` → `components/admin/**` **+ add an eslint `components` element-type that `app` may import** (this same allowance covers Steps E/F shells). Move + lint change in one PR.

**F — Membership shell extraction (Correction 1 applied).** Needs B. *Med.*
- **Headless → `services/chat/ui/v1/`:** `chatReducer.ts` (pure reducer; persistence already moved in B).
- **JSX → `components/shells/membership/`:** `ChatHero`, `ChatHeader`, `ChatInput`, `MessageList`, `Sidebar`, the `chatStore`/`ChatProvider` context wrapper, and `ui/*` (`Avatar`, `Button`, `IconButton`).
- `app/heirloom/` keeps only `page.tsx` (mount), `layout.tsx`, `globals.css`, `components/landing/*`.

**E — Widget shell extraction (Correction 1 applied).** Needs B + Phase-0. *High.*
- **Headless → `services/chat/ui/v1/`:** `useSageParameters` (data hook, no JSX); the `useSageStore` **conversation slice** as a vanilla store (per chat-ui-v2 design); the widget **shell-state** store (`isExpanded`/`expand`/`composerRef`/`mode` — design-doc Risk 4) also headless.
- **JSX → `components/shells/widget/`:** `Hero`, `Chat`, `Nav`, `SectionProcess`, `BookingCard`, `SageReply`, `markdownComponents`, and the `ChatSessionProvider` mount.
- Defend the Hero+Overlay one-conversation invariant; sign off design-doc Risks 1/2/4; §5 test matrix gates.

**G — Flip lint to `error`.** Needs D + E + F. *Low.* **Architectural done.** (Can land before H/I — those are additive feature work, not boundary debt — but the zero-code claim isn't true until H+I ship.)

**H — Three-tier prompt inheritance (Correction 3).** *Med–High. Prereq for zero-code.*
- **Resolution order:** platform defaults → product defaults → tenant overrides → tenant `master_prompt`.
- **Target:** built into **`services/prompt/compiler.ts`** (per your instruction) — a resolver that walks the `tenants.parent_id` tree and compiles the effective prompt; `/api/sage` consumes it via the existing `services/chat/server/prompt.ts` seam.
- **Block *removal*, not just override (hard requirement):** a tenant must be able to **suppress** an inherited platform/product default block. Mechanism: a tombstone / `suppressed_block_keys` (or equivalent scope+suppression model) honored by `compiler.ts` during the walk. **This is the gating design decision** — and the schema to carry suppression + block scope (platform/product/tenant) is **Jeff in Studio** (rule #3); CC builds against the migrated schema.
- *Dependency:* independent of shells; build in parallel with E/F once the suppression model + schema are signed off. Does **not** gate G; **does** gate the zero-code claim and Step I's usefulness.

**I — Dynamic tenant routing (Correction 2).** **Needs E *and* F complete.** *High. Achieves true zero-code deployment.*
- **Schema (Jeff, Studio):** add `tenants.shell_type` (`'widget' | 'membership'`).
- **Route:** `app/[tenant]/page.tsx` (+ `layout.tsx`) — dynamic catch-all that (1) resolves tenant from host (middleware → `resolveTenantConfig`), (2) reads `shell_type`, (3) renders `components/shells/{widget|membership}` with the tenant's resolved config + inherited prompt (Step H).
- **Brand tokens become runtime data (the pivot).** A single dynamic route cannot statically import a per-product `globals.css`. The per-product CSS files verified above must be superseded by **runtime CSS-variable injection from `tenant_branding`** on the `[tenant]` layout wrapper. This **intentionally supersedes** the current "one `globals.css` file per product" model (which is correct *today* but incompatible with a catch-all). Needs explicit sign-off since it revises ARCHITECTURE_OVERVIEW's product-design-isolation section.
- **Middleware:** rewrite product hosts to `/[tenant]` (carry the slug) instead of fixed `/heirloom` / `/secondbrainlabs`, preserving `/admin` + `/api` guards.
- **Migration (coexistence, low-risk):** `[tenant]` is the default for *new* tenants first; existing `(jefflougheed)`/`heirloom`/`secondbrainlabs` keep their explicit routes until runtime branding is proven on one, then migrate one at a time. No big-bang.

---

## 3. Dependency graph & order

```
A ─┐ B ─┐ C ─┐  (C carries resolveTenantConfig for I)
   │    │
D ─┤  F (needs B) ┐
   │  E (needs B + Phase-0) ┤
   │                        ├── G flip lint→error  [architectural done]
   │  H inheritance@compiler.ts (needs suppression decision + schema; ∥ to E/F)
   └──────────────┬─────────┘
                  └── I dynamic routing (needs E + F + C-config + H + branding-as-data)
                                                          [zero-code done]
```

Sequence (one PR/step, preview-verified):
1. **A** delete dead code.
2. **B** headless → services.
3. **D** admin UI → `components/` + eslint `components` type.
4. **C** (∥ after A) — `services/tenant/` (w/ `resolveTenantConfig`), then `services/content/`, then composer streaming.
5. **H-design** — sign off block-suppression model; Jeff lands schema.
6. **F** membership shell (headless→services, JSX→components/shells/membership).
7. **E** widget shell (headless→services, JSX→components/shells/widget; Phase-0 + sign-offs first).
8. **G** flip lint to `error` → **architectural done**.
9. **H-build** three-tier inheritance in `services/prompt/compiler.ts`.
10. **I** dynamic routing: `shell_type` (Jeff) → runtime `tenant_branding` injection → `app/[tenant]/` → middleware rewrite → migrate one product as proof → **zero-code done**.

---

## 4. Risk table

| Step | Risk | Hazard | Mitigation |
|------|------|--------|-----------|
| A | Low | parked component wanted | confirm with Jeff |
| B | Low–Med | localStorage key drift | preserve `heirloom:chat:v1:*` |
| C | Med–High | service-role writes, wire format, admin gate | one family/PR; keep gates; preview |
| D | Med | large move + lint must change with it | move + eslint in one PR |
| F | Med | headless/JSX split mis-sorts a file; Heirloom recovery regress | reducer→services, everything with JSX→components; lifecycle checklist |
| E | High | Hero+Overlay one-conversation invariant; shell-state vs conversation-state split | Phase-0; §5 tests; Risks 1/2/4; shell-state store stays headless in services |
| H | Med–High | unanswered block-*suppression* semantics; cross-tenant prompt regressions | resolve suppression model first; schema by Jeff; snapshot effective prompts before/after |
| I | High | brand tokens can no longer be build-time CSS; middleware touches every host | prove `tenant_branding` runtime injection on one tenant; keep explicit routes during coexistence; guard `/admin`+`/api` |
| G | Low | residual stray import | only after D+E+F |

---

## 5. New product deployment after completion

**After H+I (true zero-code):**
1. **`tenants` row** — name, type, parent, `domain`, **`shell_type`**.
2. **`tenant_branding` row** — palette/fonts/logo → injected as runtime CSS vars (no CSS file).
3. **Prompt** — author only tenant override/**suppression** blocks; platform/product defaults **inherit** via `compiler.ts` three-tier resolution (launchable with no `master_prompt` authoring).
4. **Middleware** — add host to the product-host set → rewrites to `/[tenant]`.

No new files. `app/[tenant]/page.tsx` resolves the tenant, reads `shell_type`, injects branding, resolves the inherited prompt, and renders the shared shell from `components/shells/` (driven by headless hooks in `services/chat/ui/v1/`). Adding a product = three Supabase rows + a host entry.

---

Awaiting approval before touching anything. Gating decisions:

1. **Block *suppression* model (H):** tombstone / `suppressed_block_keys` vs scope-flag-with-suppression, and the `blocks` scope dimension (platform/product/tenant). Blocks all of H; schema is Jeff's.
2. **Brand tokens → runtime `tenant_branding` (I):** confirm superseding per-product `globals.css` files with runtime CSS-var injection. Revises the ARCHITECTURE_OVERVIEW product-isolation model — needs explicit sign-off.
3. Still open: **dead-code deletion** confirmation (the marketing cluster), and **Phase-0** confirmation (is `message.ts` the frozen canonical shape?) before E.
