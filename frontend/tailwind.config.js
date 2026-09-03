/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette lifted from the login page — see globals.css's :root/.dark
        // comment for the full swatch this is drawn from.
        'brand-primary': '#211D8C',
        'brand-accent': '#4A44C4',
        'brand-panel': '#2A25A0',
        'brand-line-soft': '#332CAD',
        'brand-gradient-from': '#211D8C',
        'brand-gradient-to': '#2A25A0',
        // Phase 1 layout-shell redesign — a distinct, more vivid violet-indigo
        // used ONLY by the sidebar/top-bar shell (Sidebar.tsx, layout headers,
        // NotificationBell's unread indicator). Deliberately NOT a replacement
        // of brand-accent: brand-accent still drives features/attempts (exam
        // screens, explicitly out of scope) and the rest of today's page
        // content (also out of scope until a later phase — see CLAUDE1.md/the
        // Phase 1 brief's "not page content yet" scoping). See globals.css's
        // --sidebar-* block for the WCAG contrast numbers this was picked for.
        // CSS-var-backed (not a static hex) so Parchment & Emerald phase's
        // .theme-parchment scope (globals.css) can override it for Student
        // pages only — default value is still the same #4F46E5, so every
        // existing usage outside that scope is unchanged.
        'shell-accent': 'var(--shell-accent)',
        // Full UI overhaul phase — the three per-role static token blocks
        // that used to live here (student-*/faculty-*/admin-* — Parchment &
        // Emerald / Slate & Amber / Graphite & Steel) are superseded by one
        // shared system: globals.css's `.app-shell` / `.app-shell.dark`
        // scopes, applied to every role Layout's wrapper div, with a real
        // user-controlled toggle (store/uiStore.ts) instead of a palette
        // fixed per role. The nav rail itself stays permanently dark for
        // all three roles (--sidebar-* below), matching the reference
        // dashboard's dense dark-rail convention.
        // Obsidian & Ember phase — the 3 dashboard hero banners previously
        // used the fixed brand-gradient-from/to hex below directly, which
        // never varied with light/dark. CSS-var-backed like shell-accent so
        // it can actually flip with the toggle and carries the new ember
        // identity instead of the old indigo one; brand-gradient-from/to
        // themselves are untouched (real JCS brand hex, CLAUDE1.md — kept
        // defined for whatever future brand use, just no longer consumed by
        // these 3 hero banners specifically).
        'hero-gradient-from': 'var(--hero-gradient-from)',
        'hero-gradient-to': 'var(--hero-gradient-to)',
        // Semantic accent ramps + status tokens — see globals.css :root/.dark
        // for the light/dark values these resolve to.
        'accent-indigo-bg': 'var(--accent-indigo-bg)',
        'accent-indigo-fg': 'var(--accent-indigo-fg)',
        'accent-teal-bg': 'var(--accent-teal-bg)',
        'accent-teal-fg': 'var(--accent-teal-fg)',
        'accent-amber-bg': 'var(--accent-amber-bg)',
        'accent-amber-fg': 'var(--accent-amber-fg)',
        'accent-coral-bg': 'var(--accent-coral-bg)',
        'accent-coral-fg': 'var(--accent-coral-fg)',
        'status-success-bg': 'var(--status-success-bg)',
        'status-success-fg': 'var(--status-success-fg)',
        'status-warning-bg': 'var(--status-warning-bg)',
        'status-warning-fg': 'var(--status-warning-fg)',
        'status-danger-bg': 'var(--status-danger-bg)',
        'status-danger-fg': 'var(--status-danger-fg)',
        'status-neutral-bg': 'var(--status-neutral-bg)',
        'status-neutral-fg': 'var(--status-neutral-fg)',
      },
    },
  },
  plugins: [],
}
