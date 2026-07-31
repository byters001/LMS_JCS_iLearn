import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The dashed-box/centered/muted-text shell here is the ONE real shared shape
// every ad-hoc "no data" message across the app already uses verbatim
// (StudentListPage's "No colleges found.", BatchListPage, DepartmentListPage,
// MyBatchesPage, PoolListPage, TrainersDashboardPage, PerformanceAnalyticsSection,
// LeaderboardSection, ScoreHistoryTable, TrainerDetailPage — all
// `rounded-lg/md border border-dashed border-border p-6/8 text-center text-sm
// text-muted-foreground`). Icon and CTA are genuinely new — none of those
// call sites had either — added as optional slots on top of the existing
// shape rather than inventing a different container.
interface EmptyStateProps {
  icon?: LucideIcon
  message: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {Icon && <Icon className="mx-auto mb-2 size-8 text-muted-foreground/50" />}
      <p>{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}
