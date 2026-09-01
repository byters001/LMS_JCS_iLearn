import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useMyAttemptDetail } from '../api'
import type { AttemptStatus } from '../types'

// Reuses the SAME route path attempts/pages/AttemptPage.tsx and
// SubmitAttemptButton.tsx already navigate to on submit
// (/student/attempts/:attemptId/submitted) — routes/index.tsx now points
// that path at this component instead of the old bare AttemptSubmittedPage
// (deleted; it had gone unreferenced by any route), rather than adding a
// new URL.
const STATUS_LABELS: Record<AttemptStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  pending_evaluation: 'Pending Evaluation',
  invalidated: 'Invalidated',
}

// Phase 3b — styling only, per this page's own sanitization rules (no
// change to what data is shown/hidden). Loading/error states now match the
// skeleton-pulse and bordered-destructive-box convention every other data
// page in this codebase already uses instead of bare text. The two content
// blocks below become the shared Card (gap-0 override to neutralize Card's
// own flex gap-4, since this page's internal spacing is already hand-tuned
// via mt-*/space-y-* on non-flex children — same override technique
// AssessmentListPage.tsx's AssessmentCard already uses for the same
// reason). No PageHeader here — this is a single-attempt "receipt" layout
// with a status/score sub-header, not a page-level title+stat-row; the same
// class of page (AttemptReportPage.tsx, this attempt's own polished
// report) already established that PageHeader's title+description+
// stat-row API doesn't fit a detail view like this one.
//
// Structural rollout — deliberately no hero/ring here either: this page
// reports on ONE specific attempt, a single data record, not an aggregate
// standing — a ring/typographic hero would misrepresent what the page
// actually is. Palette-token promotion only (the old hardcoded
// text-brand-primary/text-brand-accent now read text-primary throughout),
// same constrained mx-auto max-w-2xl reading
// width kept as-is since a receipt genuinely benefits from it, unlike the
// dashboard's full-width grids.
export default function AttemptResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const { data, isLoading, isError, error } = useMyAttemptDetail(attemptId)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4" role="status" aria-label="Loading your results">
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
            : "Couldn't load your results. Please try again."}
        </div>
      </div>
    )
  }

  const { attempt, questions } = data

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Card className="gap-0 p-4">
        <h1 className="font-heading text-xl font-semibold text-primary">{attempt.assessmentTitle}</h1>
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
              {attempt.status === 'pending_evaluation'
                ? 'Pending'
                : (attempt.totalScore ?? '—')}
            </p>
          </div>
        </div>

        {/* The two real non-final states this phase was asked to handle
            explicitly — a coding response that never resolved to a final
            grade (pending_evaluation), and the ordinary case of viewing an
            attempt still in progress from the history list. */}
        {attempt.status === 'pending_evaluation' && (
          <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            One or more coding questions haven&apos;t finished grading yet. Your final score will
            be available once evaluation completes.
          </p>
        )}
        {attempt.status === 'in_progress' && (
          <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            This attempt hasn&apos;t been submitted yet — the breakdown below only reflects
            questions answered so far.
          </p>
        )}
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
                    renders (not "Incorrect" by default). */}
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
              </p>
            </Card>
          ))
        )}
      </div>

      <Link
        to="/student/attempts"
        className="mt-6 inline-block text-sm text-primary hover:underline"
      >
        &larr; Back to your attempt history
      </Link>
    </div>
  )
}
