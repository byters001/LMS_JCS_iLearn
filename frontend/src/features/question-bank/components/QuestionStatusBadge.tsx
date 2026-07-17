import { Badge } from '@/components/ui/badge'
import type { QuestionStatus } from '../types'

// Extracted from QuestionListPage once a second real usage existed
// (QuestionDetailPage), same precedent as features/assessments/components/
// AssessmentStatusBadge.tsx's own module comment.
const STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
}

const STATUS_STYLES: Record<QuestionStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-green-600/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  archived: 'bg-muted text-muted-foreground/60',
}

export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>
}
