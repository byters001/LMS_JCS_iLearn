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
        // Parchment & Emerald phase — Student portal only, additive tokens
        // paralleling brand-primary/brand-accent/brand-gradient-*/
        // shell-accent above but NOT replacing any of them (those still
        // drive Admin/Trainer + the exam screen). Static hex, not CSS vars,
        // for the pieces that don't need theme-scope swapping (the icon
        // rail is permanently dark, same reasoning as --sidebar-* in
        // globals.css). See globals.css's .theme-parchment block for the
        // scoped semantic tokens (background/card/primary/etc) this pairs
        // with, and the WCAG contrast numbers for both.
        'student-primary': '#0E6B4A',
        'student-primary-foreground': '#FFFEF9',
        'student-accent': '#1FA971',
        'student-accent-foreground': '#0F241A',
        'student-gradient-from': '#0B4632',
        'student-gradient-to': '#1B7A54',
        'student-rail': '#0F241A',
        'student-rail-foreground': '#9FB3A6',
        'student-rail-active': '#1FA971',
        'student-rail-active-foreground': '#0F241A',
        'student-rail-border': '#16332A',
        // Faculty "Slate & Amber" phase — same additive pattern as
        // student-* above, paired with globals.css's .theme-faculty block.
        // faculty-accent-foreground is dark ink (#1E2A33), not white: white
        // text on faculty-accent only reaches 3.19:1, well under AA; the
        // dark-ink pairing verified at 4.60:1 instead (same "vivid accent
        // needs a dark, not light, foreground" pattern student-accent hit).
        'faculty-primary': '#8A5A00',
        'faculty-primary-foreground': '#FFFDF7',
        'faculty-accent': '#D97706',
        'faculty-accent-foreground': '#1E2A33',
        'faculty-gradient-from': '#5C3A00',
        'faculty-gradient-to': '#8A5A00',
        'faculty-rail': '#241A0C',
        'faculty-rail-foreground': '#B8A78C',
        'faculty-rail-active': '#D97706',
        'faculty-rail-active-foreground': '#241A0C',
        'faculty-rail-border': '#3A2A14',
        // Admin "Graphite & Steel" phase — same additive pattern, paired
        // with globals.css's .theme-admin block. admin-accent is a darkened
        // #256F92 (an initial #2B7FA6 only reached 4.48:1 with white text,
        // just under AA) — verified 5.58:1 with white text after the fix.
        'admin-primary': '#204D67',
        'admin-primary-foreground': '#FFFFFF',
        'admin-accent': '#256F92',
        'admin-accent-foreground': '#FFFFFF',
        'admin-gradient-from': '#0F2E3D',
        'admin-gradient-to': '#204D67',
        'admin-rail': '#12171A',
        'admin-rail-foreground': '#9AA7AD',
        'admin-rail-active': '#256F92',
        'admin-rail-active-foreground': '#FFFFFF',
        'admin-rail-border': '#232B2F',
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
