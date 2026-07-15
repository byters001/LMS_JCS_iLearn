# JCS iLearn — UI Polish Phase Supplement

> This file supplements `CLAUDE1.md` (the project's real, existing
> architecture/brand file) — it does NOT replace it. CLAUDE1.md already
> defines brand colors, stack, folder structure, and backend contract in
> full; read that first. This file adds only what CLAUDE1.md doesn't cover:
> concrete dashboard references reviewed this session, and the interaction
> requirements (search, filtering, exports) for this specific UI-polish pass.

---

## 1. Confirmation — brand colors already correct, no changes needed

CLAUDE1.md's brand palette (`brand-primary: #1B2875`, `brand-accent:
#2E3FD6`, gradient `#0D1444` → `#3B4FE8`) matches the logo exactly. Use it
as-is. No new tokens needed for brand color — only add semantic status
colors if the app doesn't already have them:

```css
--status-live-green: #16A34A;
--status-draft-amber: #D97706;
--status-scheduled-blue: #2563EB;
--status-completed-slate: #64748B;
--status-error-red: #DC2626;
```

Check `tailwind.config` for these before adding — don't duplicate if they
already exist under different names.

---

## 2. Concrete Dashboard References (4 screenshots reviewed this session)

CLAUDE1.md's "Design references" section lists 10 platforms by name
(HackerRank, Mettl, TestGorilla, etc.) at a conceptual level. These 4 were
actually reviewed as images — treat their layout patterns as directly
actionable. **Never copy their colors** — always substitute
`brand-primary`/`brand-accent` from CLAUDE1.md.

| Reference | Layout pattern | Apply to |
|---|---|---|
| Dark-sidebar analytics dashboard | Fixed left sidebar, top search bar, stat cards with sparkline trend arrows, a data table with inline mini trend charts per row | `features/analytics/` — inline per-row trend charts upgrade the current donut-only view |
| Light sales dashboard | Top stat-card row (icon-in-circle + trend %), bar chart with hover tooltips, radial growth gauge, search box directly above its table | `features/analytics/` + `features/assessments/` list page |
| Invoicing SaaS dashboard | "Active filters" bar (badge count + dropdowns + search), and a **split list/detail layout** — list left, detail panel right, updates on click with no navigation/reload | `features/question-bank/` pools view — maps directly to "click a pool → see criteria + Preview Resolution inline," which already exists at the API level per this session's earlier backend/frontend work |
| Inventory dashboard | Welcome header with user name + search + notification bell, stat card row, pie chart + ranked bar-list pair | `features/students/` and `layouts/` shell — bell + user menu already partially exist per current screenshots, extend the pattern |

**Cross-cutting patterns from all 4:**
- Search is always top-level and visible, never buried in a page body.
- Stat cards precede tables/charts — headline numbers before detail.
- Applied filters show as visible chips/badges, not silently hidden state.
- Detail views open inline (split-pane or expand), not via full navigation —
  consistent with this project's existing "no reload" precedent from the
  question-pool criteria work.

---

## 3. Cross-Functional Search — concrete scope (proposed default)

Not yet specified anywhere, so here's a concrete default — confirm or
correct before Claude Code builds it:

- **One search input**, in the top nav/header (per the dashboard references
  above), always visible across admin screens.
- **Scope**: searches across Students, Assessments, Questions, and Pools —
  the four entities with existing paginated list endpoints per CLAUDE1.md's
  backend contract.
- **Mechanics**: debounced input (~300ms) calling each relevant module's
  existing paginated endpoint with a `search`/`q` query param — do NOT
  fetch-all-then-filter-client-side (this violates CLAUDE1.md's non-
  negotiable #2 on pagination).
- **If the backend has no unified search endpoint**, the frontend fans out
  to the 4 existing list endpoints in parallel (TanStack Query) and groups
  results by type in a dropdown — this needs backend confirmation of
  whether each list endpoint actually accepts a search param today. If not,
  that's a backend task, not a UI-only task — flag it rather than building
  a search box that silently does nothing.

**Confirm with me**: is this the scope you want, or should search be
narrower (e.g. Students only) or broader (also search inside question
content/tags)?

---

## 4. Downloads/Exports — concrete scope (proposed default, needs your confirmation)

This wasn't specified in any prior session — proposing a default rather
than leaving it vague, since vague requirements are what caused the earlier
"dummy UI" confusion:

- **Analytics/reports**: export the current filtered view (batch +
  assessment selection) as CSV — matches the existing Analytics screen's
  batch/assessment filter inputs already built.
- **Students list**: export the visible/filtered student roster as CSV.
- **Assessment results**: per-assessment results export as CSV (score,
  pass/fail, attempted status per student) — the natural extension of the
  Analytics screen's existing pass/fail data.
- Explicitly **not in scope** unless you say otherwise: PDF certificate
  generation, bulk question-bank export/import, any export requiring a new
  backend endpoint beyond serializing already-fetched data to CSV
  client-side.

**Confirm with me**: does "downloading everything" mean CSV exports like
this, or did you mean something else — e.g. downloading a student's
individual result as a PDF report, or exporting question papers?

---

## 5. Still Out of Scope for This Phase

- No new API endpoints unless search/export above genuinely requires one
  (see section 3's fallback note) — and even then, confirm with me before
  building backend changes during what's meant to be a UI-only phase.
- No changes to auth/refresh flow or the existing Vitest/Playwright suites.
- No new design system — shadcn/Radix/Tailwind as already configured per
  CLAUDE1.md, not a replacement.
