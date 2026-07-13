import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
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

export default function AttemptResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const { data, isLoading, isError, error } = useMyAttemptDetail(attemptId)

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading your results…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : "Couldn't load your results. Please try again."}
        </p>
      </div>
    )
  }

  const { attempt, questions } = data

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-brand-primary">{attempt.assessmentTitle}</h1>
        <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Attempt #{attempt.attemptNumber}
          {attempt.isRetake ? ' · Retake' : ''}
        </p>

        <div className="mt-4 flex items-center gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium text-brand-primary">
              {STATUS_LABELS[attempt.status] ?? attempt.status}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Score</p>
            <p className="font-medium text-brand-primary">
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
      </div>

      <div className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Question Breakdown
        </h2>

        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions to show for this attempt.</p>
        ) : (
          questions.map((question, index) => (
            <div
              key={question.questionVersionId}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-brand-primary">
                  {index + 1}. {question.questionText}
                </p>
                {/* Only for mcq/coding — psychometric has no "correct
                    answer" concept, so isCorrect is null and no badge
                    renders (not "Incorrect" by default). */}
                {question.isCorrect !== null && (
                  <span
                    className={
                      question.isCorrect
                        ? 'shrink-0 rounded-full bg-green-600/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400'
                        : 'shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive'
                    }
                  >
                    {question.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
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
            </div>
          ))
        )}
      </div>

      <Link
        to="/student/attempts"
        className="mt-6 inline-block text-sm text-brand-accent hover:underline"
      >
        &larr; Back to your attempt history
      </Link>
    </div>
  )
}
