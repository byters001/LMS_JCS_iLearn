# JCS iLearn — Frontend

Frontend for JCS iLearn's placement training assessment platform. Consumes
the backend at `backend/` (Fastify API, already built — see
`backend/CLAUDE.md` for its architecture). Built for JCS iLearn LLP
(jcsilearn.com) — a real client, not a demo project. Match their existing
brand identity, not a generic template.

## Stack

- React 19, TypeScript, Vite
- Package manager: pnpm — always use pnpm. Never npm or yarn. Only
  pnpm-lock.yaml should exist.
- Tailwind CSS
- shadcn/ui — component base (Radix primitives + Tailwind). Components
  get copied into components/ui/ by the CLI, not installed as an opaque
  npm package — treat them as owned/editable code, not a black box.
- TanStack Query — all server state
- React Hook Form + Zod — all forms
- Axios — HTTP client (single configured instance)
- React Router DOM — routing
- Lucide React — icons
- Sonner — toast notifications
- clsx + tailwind-merge — conditional class composition (via a cn()
  helper in lib/utils.ts, the standard shadcn/ui convention)
- Recharts — charts, used in reports/analytics and score breakdowns
- Monaco Editor — code editor for the coding module's assessment screen
- Socket.IO Client — NOT included in the initial scaffold. The backend
  has no WebSocket server counterpart yet. Add only when a specific
  real-time feature is actually being built.

## Current phase

Local development only, pointed at the local backend
(`http://localhost:3000`). Do not create Docker files unless explicitly
asked.

## Brand identity — match jcsilearn.com, do not invent a new look

This is JCS iLearn LLP's actual assessment portal, not a generic app —
the visual identity should feel like a continuation of jcsilearn.com,
not a different product.

- **Color palette** (read from jcsilearn.com's live header/hero, July
  2026 — visually sourced, not pulled from source CSS; treat as close
  but verify precisely later if pixel-exact brand compliance matters):
  - `brand-primary`: `#1B2875` — deep navy, used for logo wordmark, nav
    link text, and any primary heading/text-on-white contexts
  - `brand-accent`: `#2E3FD6` — vivid indigo-blue, used for primary CTA
    buttons ("Get Started"-style) and interactive highlights
  - `brand-gradient-from`: `#0D1444` / `brand-gradient-to`: `#3B4FE8` —
    the diagonal hero-section gradient (dark navy → brighter indigo)
  - Secondary buttons follow a white-background/navy-border/navy-text
    pattern (like the site's "Explore More" button), not a filled color
  - Wire all of these into `tailwind.config` under `theme.extend.colors`
    as named tokens (`brand-primary`, `brand-accent`, etc.) — never
    hardcode these hex values directly in component classNames.

## Design references — study before building, don't copy verbatim

Per-area references to inform layout decisions, not to clone pixel-for-
pixel:

- **Coding assessment screens**: HackerRank (split-pane editor/problem
  layout, test-case panel, timer placement), LeetCode (cleaner/more
  minimal chrome), CodeSignal (pre-assessment environment-check flow —
  camera/mic checks, instructions screen), HackerEarth (closest to
  actual placement-training use case).
- **MCQ/psychometric assessment screens**: Mercer Mettl (question-
  navigator sidebar, section-switching, proctoring warning banners —
  closest direct competitor), TestGorilla (friendlier/less enterprise-
  heavy alternative), iMocha (mixed-format tests — MCQ + coding +
  subjective in one assessment, directly analogous to this platform's
  assessments).
- **Admin/trainer dashboards**: TalentLMS/Coursera for Campus admin side
  (cohort/batch/results management — closer to organization/trainers/
  reports modules), Google Classroom (uncluttered course/batch
  management, a good anti-pattern reference against over-dense admin
  screens).
- **Reports/analytics visualizations**: Vervoe (score breakdowns,
  comparative views — reference for Recharts layouts in reports/
  analytics modules).
- Additional curated visual references (Pinterest boards) — check these
  for layout/spacing/component-style inspiration when building each
  feature's UI, not for literal copying.

## Backend contract — do not deviate without checking backend/CLAUDE.md

- Base URL: `http://localhost:3000/api/v1` (configurable via
  `VITE_API_BASE_URL`)
- Health check lives at `/healthz` / `/readyz`, unprefixed (no `/api/v1`)
- Every response is one of:
  `{ success: true, data: T }`
  `{ success: false, error: { code: string, message: string, details?: unknown } }`
  `details` only appears on validation errors. One shared type for this
  envelope, unwrapped in the API client — feature code only ever sees
  `data` or a thrown error, never the envelope itself.
- Auth:
  - `POST /api/v1/auth/login` returns `{ accessToken, user }` in the
    body, and sets the refresh token as an httpOnly cookie automatically
    (frontend code never reads or stores the refresh token itself).
  - Access token goes in memory only (Zustand store), NOT localStorage
    or sessionStorage.
  - `POST /api/v1/auth/refresh` — cookie sent automatically
    (axios `withCredentials: true`), returns a new access token. Called
    from an axios response interceptor on a 401, never manually from
    feature code.
  - `POST /api/v1/auth/logout` — clears server-side revocation + cookie.
- Every protected endpoint requires `Authorization: Bearer <accessToken>`.
- Role-based UI: the `user` object includes `roles: string[]` and
  `activeCollegeId: string | null`. Route guards and conditional UI key
  off these.

## Frozen architecture — folder structure
src/
├── api/                 axios instance, response envelope unwrapping,
│                        refresh-token interceptor — the ONLY place
│                        that constructs HTTP requests directly
├── assets/
│   └── brand/            JCS iLearn logo files, stored locally
├── features/            one folder per backend module, mirrored 1:1:
│   ├── auth/
│   ├── users/
│   ├── organization/
│   ├── students/
│   ├── trainers/
│   ├── question-bank/
│   ├── assessments/
│   ├── coding/
│   │   └── components/
│   │       └── CodeEditor.tsx   wraps @monaco-editor/react,
│   │                            lazy-loaded, applies lib/monaco.config.ts
│   ├── attempts/
│   ├── reports/
│   ├── analytics/
│   ├── notifications/
│   └── settings/
│       each feature/<name>/ contains:
│       ├── api.ts         TanStack Query hooks calling api/ client
│       ├── components/    feature-specific UI
│       ├── pages/         route-level components for this feature
│       └── types.ts       frontend-side types (own copy, not shared
│                          with backend's *.types.ts)
├── components/
│   └── ui/              shadcn/ui components — generated via CLI, then
│                        customized here
├── layouts/             role-specific shells (student/trainer/admin)
├── hooks/               shared, cross-feature hooks
├── store/               Zustand stores — auth/session state only
├── routes/              React Router tree + role-based guards
├── lib/
│   ├── utils.ts          cn() helper (clsx + tailwind-merge)
│   └── monaco.config.ts  shared Monaco setup (language defaults, theme)
├── styles/              Tailwind config, global styles
├── App.tsx
└── main.tsx

## Boundary rules

- A feature's `api.ts` is the only file in that feature allowed to import
  from `api/`. Components call the feature's own TanStack Query hooks,
  never axios directly.
- Shared `components/` never imports from a specific `features/*` folder
  — feature-specific data comes in as props.
- `store/` (Zustand) holds only session/UI state that isn't server data.
  Fetched data belongs in TanStack Query's cache, not Zustand.
- Route guards live in `routes/`, not scattered per-page.

## Non-negotiable requirements

1. Axios instance in `api/` has an interceptor: on a 401 with an
   "access token expired" error code, call `POST /auth/refresh` once,
   retry the original request with the new token, redirect to login
   only if refresh itself fails. Dedupe/queue simultaneous 401s so they
   don't trigger parallel refresh calls.
2. Every list/table backed by a paginated backend endpoint (`page`,
   `pageSize`) implements real pagination controls — never fetch-all-
   then-paginate-client-side.
3. File uploads (avatars, question images, certificates) go through the
   corresponding backend module's multipart endpoint — never a direct
   frontend-to-Supabase upload path.
4. Forms use React Hook Form + Zod resolver — no uncontrolled
   forms-via-refs, no duplicated manual validation logic.
5. Loading and error states handled for every data-fetching component —
   no bare `data.map(...)` assuming data is always defined.
6. Environment variables go through `import.meta.env`, validated once at
   startup — no scattered `import.meta.env.VITE_X` calls.
7. Monaco Editor is lazy-loaded (React.lazy/dynamic import) — never part
   of the main bundle, since not every assessment includes a coding
   section.
8. Attempt/coding submit requests send an `Idempotency-Key` header
   (client-generated UUID, once per submit attempt, not regenerated on
   retry) — matching the backend's idempotency requirement.
9. Brand colors/logo come from the confirmed values in this file's
   "Brand identity" section, wired into `tailwind.config` as named
   theme tokens — never raw hex values pasted directly into component
   className strings.

## Reference

- `backend/CLAUDE.md` — backend architecture and reliability rules.
- `backend/drizzle/reference/schema.sql` — data shapes, for context only.
- jcsilearn.com — brand identity source (logo, tone, contact info).

## Build process

Same phased approach as the backend: one phase per session, review and
commit before moving to the next. Do not build ahead of the current
phase's stated scope without asking first.

## Environment variables

VITE_API_BASE_URL (e.g. http://localhost:3000/api/v1)

## What not to do

- Do not use npm or yarn — pnpm only.
- Do not store the access token in localStorage/sessionStorage.
- Do not call axios directly from a component.
- Do not duplicate response-envelope unwrapping logic per feature.
- Do not create Docker files unless explicitly asked.
- Do not invent new top-level folders without asking.
- Do not add Socket.IO until a specific real-time feature needs it.
- Do not invent brand colors — use the confirmed palette only.
