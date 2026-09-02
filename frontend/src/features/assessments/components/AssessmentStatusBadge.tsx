import { Badge } from '@/components/ui/badge'
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
  // Was `border border-brand-primary/30 text-brand-primary` with NO bg-*
  // class — Badge's own default variant (components/ui/badge.tsx) fills
  // that gap with `bg-primary`, and this app's --primary (#211d8c, see
  // styles/globals.css) is a near-identical dark navy to brand-primary
  // (#1B2875), so the badge rendered dark-navy text on a dark-navy
  // background: invisible except when text-selection's own highlight color
  // briefly overrides the background. Every sibling entry here (and every
  // other STATUS_STYLES map in this codebase — QuestionStatusBadge,
  // CollegeListPage, BatchPerformancePage) always sets an explicit bg-*, so
  // this was the one map with the gap, not a pattern to fix elsewhere.
  // Fixed the same way its siblings already are: a real Tailwind color with
  // its own light/dark text pairing, not the app's fixed brand-primary
  // token (which has no dark-mode counterpart to switch to).
  scheduled: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  // Faculty Slate & Amber rollout — was `bg-brand-accent text-white`, a
  // static hex fill that also disagreed with every other "live" pill in the
  // app (StudentAssessmentsPage's StatusBadge, FacultyAnalyticsPage's own
  // ASSESSMENT_STATUS_BADGE map, both already on Badge's `live` variant /
  // status-success tokens). AssessmentListPage and MyBatchesPage's
  // participation table both render this component directly, so the
  // mismatch was visible on real Faculty surfaces, not just theoretical.
  // status-success is scoped per theme like every other semantic token, so
  // this now uses the SAME variant token those other two call sites do
  // instead of a third, brand-specific rendering of the same status.
  live: 'bg-status-success-bg text-status-success-fg',
  completed: 'bg-green-600/10 text-green-700 dark:text-green-400',
  archived: 'bg-muted text-muted-foreground/60',
}

export function AssessmentStatusBadge({ status }: { status: AssessmentStatus }) {
  return (
    <Badge className={STATUS_STYLES[status]}>
      {status === 'live' && <span className="size-1.5 rounded-full bg-status-success-fg" />}
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
