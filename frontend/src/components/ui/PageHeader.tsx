import type { ReactNode } from 'react'

// Shared shape derived from what StudentListPage/LeaderboardPage/
// CollegeListPage/AssessmentListPage already did inline: an h1 (font-heading
// text-xl font-semibold text-foreground) + an optional description
// paragraph (mt-1 text-sm text-muted-foreground), with AssessmentListPage's
// "Create Assessment" button being the one real precedent for a
// right-aligned action (its own `flex items-baseline justify-between`
// wrapper) — not an invented API. `children` is the optional stat-row slot
// (StudentListPage's 3-card grid) rendered beneath title/description,
// matching how that grid already sits directly under the header block.
interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}

export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
