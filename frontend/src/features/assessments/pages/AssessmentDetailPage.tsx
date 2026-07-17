import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useStartAttempt } from '@/features/attempts/api'
import type { ListAvailableAssessmentsResponse } from '../types'

const TEST_CATEGORY_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

// The backend's three named start-attempt failure cases (attempts.service.ts)
// all reuse generic AppError codes (ForbiddenError=FORBIDDEN,
// ConflictError=CONFLICT for BOTH "not live" and "max attempts used") — there
// is no distinct code per case, same situation as the earlier 401-refresh
// phase's UNAUTHORIZED finding. The backend's own message text IS specific
// per case, so this branches on code + message content rather than
// fabricating codes that don't exist, and falls back to the raw message
// otherwise.
function describeStartAttemptError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong starting this attempt. Please try again.'
  }
  if (error.code === 'FORBIDDEN') {
    return 'You are not authorized to attempt this assessment — check with your trainer if you believe this is a mistake.'
  }
  if (error.code === 'CONFLICT' && error.message.toLowerCase().includes('maximum attempts')) {
    return `${error.message}. Contact your trainer if you need a retake.`
  }
  // Covers "must be live" (and any other case) — the backend's own message
  // is already specific and safe to show as-is.
  return error.message
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const startAttempt = useStartAttempt()

  // Idempotency-Key generated ONCE per page visit, via useState's
  // initializer — it runs only on this component's first mount, so it
  // stays the same across re-renders AND across repeated "Start Attempt"
  // clicks on this same page instance (a double-click or a retry after a
  // failed/slow request reuses this exact value). A fresh navigation to
  // this page (new mount, e.g. leaving and coming back) gets a fresh key,
  // which is correct — that's a new attempt-start session, not a retry of
  // the same click. See features/attempts/api.ts's useStartAttempt for
  // where this gets sent as the Idempotency-Key header.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // No student-scoped GET /assessments/:id exists (assessments.routes.ts's
  // GET /assessments/:id is staff-only, ASSESSMENTS_MANAGE-gated) — building
  // one is out of this phase's scope (attempt pre-start flow, not another
  // backend endpoint). Instead of fabricating one, this reads the
  // already-fetched list page's TanStack Query cache: StudentAssessmentsPage
  // caches its results under queryKey ['assessments', 'available', params],
  // and this searches every such cached page for a matching id. Works for
  // the normal flow (click a card, land here), not for a direct URL
  // visit/hard refresh with an empty cache — handled below with a plain
  // fallback rather than silently showing broken/blank content.
  const cachedLists = queryClient.getQueriesData<ListAvailableAssessmentsResponse>({
    queryKey: ['assessments', 'available'],
  })
  const assessment = cachedLists
    .map(([, data]) => data?.items.find((item) => item.id === id))
    .find((item) => item !== undefined)

  if (!assessment) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load this assessment&apos;s details directly.{' '}
          <Link to="/student" className="text-brand-accent underline">
            Go back to your assessments
          </Link>
          .
        </p>
      </div>
    )
  }

  const canStart = assessment.status === 'live'

  return (
    <div className="p-6">
      <Link to="/student" className="text-sm text-brand-accent hover:underline">
        &larr; Back to assessments
      </Link>

      <div className="mt-3 max-w-xl rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">{assessment.title}</h1>
        <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {TEST_CATEGORY_LABELS[assessment.testCategory] ?? assessment.testCategory}
        </p>

        {assessment.description && (
          <p className="mt-3 text-sm text-muted-foreground">{assessment.description}</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Timer</dt>
            <dd className="font-medium text-brand-primary">
              {assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Max attempts</dt>
            <dd className="font-medium text-brand-primary">{assessment.maxAttempts}</dd>
          </div>
        </dl>

        {!canStart && (
          <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            This assessment is scheduled but not live yet — the Start button will be enabled once
            it opens.
          </p>
        )}

        {startAttempt.isError && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {describeStartAttemptError(startAttempt.error)}
          </p>
        )}

        <Button
          className="mt-4 w-full bg-brand-accent text-white hover:bg-brand-accent/90"
          disabled={!canStart || startAttempt.isPending}
          onClick={() =>
            startAttempt.mutate(
              { assessmentId: assessment.id, idempotencyKey },
              {
                onSuccess: (attempt) =>
                  navigate(`/student/attempts/${attempt.id}`, { replace: true }),
              },
            )
          }
        >
          {startAttempt.isPending ? 'Starting…' : 'Start Attempt'}
        </Button>
      </div>
    </div>
  )
}
