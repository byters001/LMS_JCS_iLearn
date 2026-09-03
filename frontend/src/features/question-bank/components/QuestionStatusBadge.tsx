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

// Badge's own semantic variants (status-*/accent-* tokens, theme-aware) —
// draft/archived read as neutral, pending_review as warning, approved as
// success, rejected as danger. Replaces the old hand-rolled green-600/
// amber-500/destructive Tailwind-gray classes with the shared token set
// every other status pill in the app now uses.
const STATUS_VARIANTS: Record<QuestionStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  archived: 'neutral',
}

export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}
