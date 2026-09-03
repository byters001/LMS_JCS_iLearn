import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface StudentRailNavItem {
  to: string
  label: string
  end?: boolean
  icon: LucideIcon
}

interface StudentRailProps {
  navItems: StudentRailNavItem[]
}

// Instagram-style icon rail phase — see Sidebar.tsx's own module comment
// for the full reasoning shared by both files (background token switched
// from the permanently-dark --sidebar-* family to the page's own
// theme-aware --background/--foreground/--muted-foreground/--primary
// tokens, why hover-to-expand elsewhere is being dropped in favor of this
// rail's existing icon-only + tooltip pattern, the WCAG numbers, and the
// content-hugging fix for the dead-zone bug this file specifically had).
// This was the one already permanently icon-only rail — its own bug was
// the visible frosted panel using flex-1/h-full and stretching to fill the
// full h-screen height, leaving dead space below the last icon; fixed the
// same way as Sidebar.tsx: the OUTER <aside> stays h-screen (so `sticky
// top-0` has a real column), but the panel itself is a plain, content-
// sized flex child with no flex-1/h-full, so it hugs exactly to its icons
// and the rest of the h-screen space below it stays fully transparent.
export function StudentRail({ navItems }: StudentRailProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col print:hidden">
      <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto rounded-b-3xl bg-background/90 py-5 backdrop-blur-md supports-backdrop-filter:bg-background/70">
        <div className="flex size-11 shrink-0 items-center justify-center">
          <img src="/jcs-logo.png" alt="JCS iLearn" className="size-8 object-contain" />
        </div>

        <nav className="flex flex-col items-center gap-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-150 ease-out',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  // Instagram-style active indicator — subtle tinted pill,
                  // not a full-strength fill. Same accent/accent-foreground
                  // pairing as Sidebar.tsx, verified >=4.5:1 in both modes.
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <item.icon className="size-5 shrink-0" />
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
