import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type SidebarNavItem =
  | { type: 'link'; to: string; label: string; end?: boolean; icon: LucideIcon }
  | {
      type: 'group'
      label: string
      icon: LucideIcon
      children: { to: string; label: string; end?: boolean; icon: LucideIcon }[]
    }

interface SidebarProps {
  navItems: SidebarNavItem[]
}

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return cn(
    'flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    // Instagram-style active indicator — a subtle tinted pill behind the
    // icon (bg-accent/text-accent-foreground, the same soft chip pairing
    // used for hover/secondary chrome elsewhere in this app), not the old
    // full-strength bg-sidebar-primary fill. Verified >=4.5:1 in both
    // modes — see this file's own module comment for the numbers.
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )
}

// Instagram-style icon rail phase — full redesign of the shared Admin/
// Trainer nav shell, replacing the prior hover-to-expand floating capsule
// (collapsed w-24 icon rail <-> expanded w-72 labeled panel with
// Collapsible groups) with a single, PERMANENTLY icon-only rail. Three
// deliberate changes from the previous phase, each because the old
// approach couldn't satisfy this phase's brief, not by default:
//
// 1. Hover-to-expand is REMOVED, not kept. The brief requires "same width
//    ... across all three roles" and StudentRail.tsx has never expanded —
//    keeping Admin/Trainer's hover-expand would mean this rail's width
//    changes on hover while Student's never does, directly violating that
//    requirement. Icon-only + a native `title`/`aria-label` tooltip (the
//    exact mechanism StudentRail.tsx already used) is now the ONE shared
//    wayfinding pattern for all three roles. A 'group' item (e.g. Admin's
//    Question Bank) no longer renders as an expandable trigger — its
//    children are flattened into their own icon links instead, same as
//    this file's own previous collapsed-state fallback already did; no
//    grouping information is lost since every child already carries its
//    own distinct icon + tooltip.
//
// 2. Background token swapped from the permanently-dark --sidebar-*
//    family to the page's own theme-aware --background/--foreground/
//    --muted-foreground/--primary tokens. This isn't a style preference —
//    it's the only way the requested ~70%-translucent glass effect can
//    pass WCAG AA in light mode. Checked, not assumed: --sidebar-
//    foreground (#b8a99a) was tuned against the FULLY OPAQUE near-black
//    --sidebar (#14100c); blended at 70% opacity toward light mode's
//    --background (#faf9f7) backdrop, that pairing's contrast collapses
//    to ~3.19:1 (fails the 4.5:1 AA minimum). The page's own foreground/
//    background pairs are designed to flip correctly with the toggle and
//    stay high-contrast in both directions by construction — verified
//    below, not just assumed from that design intent.
//
// 3. No more separate "floating pill capsule inset in a transparent
//    aside" — the frosted surface IS the rail now (flush to the
//    left/top edges, only the bottom corners soften), and it carries NO
//    shadow, matching the brief's "no bordered/boxed container feel."
//    "hug content, don't stretch" (the StudentRail dead-zone bug) is
//    solved the same way in both files: the OUTER <aside> is h-screen
//    (so `sticky top-0` has a real column to stick within), but the
//    VISIBLE frosted panel is a plain flex child with no flex-1/h-full —
//    it sizes to exactly its own icon content, and whatever h-screen
//    space is left below it stays fully transparent, showing the
//    .app-shell page background through, not a stretched panel.
//    max-h-full + overflow-y-auto on the panel is a pure safety net for a
//    very short viewport with many icons — it caps, it never forces a
//    stretch, so the common case (content shorter than the viewport)
//    still hugs exactly as before.
//
// WCAG AA contrast, computed against the actual worst-case backdrop —
// which is always exactly --background at full strength: this layout
// never renders anything else behind the aside (a flex sibling column,
// not an overlay), so alpha-blending --background at any opacity over
// itself is a no-op for contrast purposes; the numbers below are the
// same ones any normal page text against --background would get.
// Recomputed for the Monochrome Premium palette (globals.css):
//   LIGHT (.app-shell):  foreground/background        16.87:1
//                        muted-foreground/background    4.71:1
//                        accent-foreground/accent       10.42:1  (active pill)
//                        ring/background                11.59:1  (focus ring, needs >=3:1)
//   DARK  (.app-shell.dark): foreground/background     18.01:1
//                        muted-foreground/background    6.71:1
//                        accent-foreground/accent        8.91:1  (active pill)
//                        ring/background                 6.06:1  (focus ring, needs >=3:1)
// All eight comfortably clear the AA minimums (4.5:1 text, 3:1 non-text).
export function Sidebar({ navItems }: SidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col print:hidden">
      {/* This div, not the <aside>, carries the visible frosted surface —
          content-sized (no flex-1/h-full), so it hugs its own icons
          exactly instead of stretching to fill the h-screen parent.
          bg-background/90 is the no-backdrop-filter fallback (a slightly
          more opaque, still-reasonable look on the rare browser without
          backdrop-filter support); supports-backdrop-filter:bg-background/70
          is the real, requested ~70% glass effect wherever it's actually
          supported — same fallback-then-enhance pattern this codebase's
          own sticky header bars already use. */}
      <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto rounded-b-3xl bg-background/90 py-5 backdrop-blur-md supports-backdrop-filter:bg-background/70">
        <div className="flex size-11 shrink-0 items-center justify-center">
          <img src="/jcs-logo.png" alt="JCS iLearn" className="size-8 object-contain" />
        </div>

        <nav className="flex flex-col items-center gap-3">
          {navItems.map((item) => {
            if (item.type === 'link') {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  aria-label={item.label}
                  className={navLinkClassName}
                >
                  <item.icon className="size-5 shrink-0" />
                </NavLink>
              )
            }

            // Icon-only rail has no room for a labeled group trigger —
            // flatten each group's children into their own icon links
            // instead (each child already has its own distinct icon, e.g.
            // AdminLayout's Question Bank group), same as every flat item.
            return item.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                end={child.end}
                title={child.label}
                aria-label={child.label}
                className={navLinkClassName}
              >
                <child.icon className="size-5 shrink-0" />
              </NavLink>
            ))
          })}
        </nav>
      </div>
    </aside>
  )
}
