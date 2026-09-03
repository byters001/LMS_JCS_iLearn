import { ArrowLeft } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStaffAttemptDetail } from '../api'
import type { AttemptStatus } from '../types'

// Staff-facing counterpart to features/reports/pages/AttemptResultPage.tsx
// — reached by clicking a student row in BatchPerformancePage's per-student
// table (see that page's own comment on why a row Link, not a new picker,
// is the entry point). Deliberately reuses the SAME sanitized question
// shape the student sees (questionText, marks, isCorrect,
// latestCodingTestCases) plus exactly one addition, timeSpentSeconds — see
// backend's reports.types.ts StaffAttemptQuestionBreakdown for the full
// "why nothing else is added" reasoning. This stays read-only: no
// re-grading, no editing marks, from this page.
const STATUS_LABELS: Record<AttemptStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  pending_evaluation: 'Pending Evaluation',
  invalidated: 'Invalidated',
}

// Same m:ss/h:mm:ss convention as features/attempts/components/
// AttemptTimer.tsx's formatRemaining — reused here for consistency rather
// than inventing a second duration-formatting convention for the same
// unit (seconds) elsewhere in this codebase.
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export default function StaffAttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [searchParams] = useSearchParams()
  const batchId = searchParams.get('batchId') ?? undefined
  const studentName = searchParams.get('studentName')
  // Route is nested as "analytics/attempts/:attemptId" under BOTH
  // /trainer and /admin (registered once per role in routes/index.tsx,
  // same duplication BatchPerformancePage's own route already has) — a
  // relative ".." Link resolves to whichever parent it's actually nested
  // under, so this works for either role without branching on it here.
  // batchId/assessmentId ride along in the query string so
  // BatchPerformancePage re-selects the same batch/assessment on return,
  // the same pre-fill round-trip it already does for MyBatchesPage's own
  // drill-down link.
  const backSearch = new URLSearchParams()
  if (batchId) backSearch.set('batchId', batchId)
  const assessmentId = searchParams.get('assessmentId')
  if (assessmentId) backSearch.set('assessmentId', assessmentId)

  const { data, isLoading, isError, error } = useStaffAttemptDetail(batchId, attemptId)

  if (!batchId) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          Missing batchId — open this page from a student row in Batch Performance.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4" role="status" aria-label="Loading attempt details">
        <div className="h-36 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : "Couldn't load this attempt's details. Please try again."}
        </div>
      </div>
    )
  }

  const { attempt, questions } = data

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Card className="gap-0 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {studentName ?? 'Student'} &middot; Attempt Detail
        </p>
        <h1 className="mt-1 font-heading text-xl font-semibold text-primary">
          {attempt.assessmentTitle}
        </h1>
        <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Attempt #{attempt.attemptNumber}
          {attempt.isRetake ? ' · Retake' : ''}
        </p>

        <div className="mt-4 flex items-center gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium text-primary">
              {STATUS_LABELS[attempt.status] ?? attempt.status}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Score</p>
            <p className="font-medium text-primary">
              {attempt.status === 'pending_evaluation' ? 'Pending' : (attempt.totalScore ?? '—')}
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Question Breakdown
        </h2>

        {questions.length === 0 ? (
          <EmptyState message="No questions to show for this attempt." />
        ) : (
          questions.map((question, index) => (
            <Card key={question.questionVersionId} className="gap-0 p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-primary">
                  {index + 1}. {question.questionText}
                </p>
                {/* Only for mcq/coding — psychometric has no "correct
                    answer" concept, so isCorrect is null and no badge
                    renders, same precedent as AttemptResultPage. */}
                {question.isCorrect !== null && (
                  <Badge variant={question.isCorrect ? 'success' : 'danger'} className="shrink-0">
                    {question.isCorrect ? 'Correct' : 'Incorrect'}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {question.marksObtained ?? '—'} / {question.marksPossible} marks
                {question.latestCodingTestCases && (
                  <>
                    {' '}
                    &middot; {question.latestCodingTestCases.passed} /{' '}
                    {question.latestCodingTestCases.total} test cases passed (latest submission)
                  </>
                )}
                {' '}
                &middot; Time spent:{' '}
                {question.timeSpentSeconds !== null ? formatDuration(question.timeSpentSeconds) : '—'}
              </p>
            </Card>
          ))
        )}
      </div>

      <Link
        to={{ pathname: '..', search: backSearch.toString() }}
        relative="path"
        className="mt-6 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Back to Batch Performance
      </Link>
    </div>
  )
}
