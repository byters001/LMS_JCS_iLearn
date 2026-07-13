import { cn } from '@/lib/utils'
import type { AssessmentStatus } from '../types'

// Shared by AssessmentListPage and AssessmentEditPage — extracted here once
// a second real usage existed, not speculatively. Covers all seven
// assessment_status_enum values with distinct styling (more granular than
// the student-facing badge, which only ever needs Live/Scheduled/other).
const STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  live: 'Live',
  completed: 'Completed',
  archived: 'Archived',
}

const STATUS_STYLES: Record<AssessmentStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  review: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  scheduled: 'border border-brand-primary/30 text-brand-primary',
  live: 'bg-brand-accent text-white',
  completed: 'bg-green-600/10 text-green-700 dark:text-green-400',
  archived: 'bg-muted text-muted-foreground/60',
}

export function AssessmentStatusBadge({ status }: { status: AssessmentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {status === 'live' && <span className="size-1.5 rounded-full bg-white" />}
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
