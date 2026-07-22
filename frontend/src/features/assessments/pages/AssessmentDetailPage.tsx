import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { ListAvailableAssessmentsResponse } from '../types'

function formatStartDate(startAt: string | null): string | null {
  if (!startAt) return null
  return new Date(startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const TEST_CATEGORY_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  // Button-state phase — same getAttemptButtonState() StudentAssessmentsPage.tsx's
  // card uses, so this page's button can never disagree with the card that
  // linked here about whether this is a fresh start, a resume, a retake, or
  // already completed.
  const buttonState = getAttemptButtonState(assessment)

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

        {buttonState.kind === 'not-live' && (
          <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            This assessment isn&apos;t live yet.
          </p>
        )}

        {/* Item 2 fix — scheduled gets the same genuine lock treatment as
            StudentAssessmentsPage.tsx's card (see that file's module
            comment for the full reasoning): a real "opens at X" message,
            not a disabled button that still literally says "Start Test". */}
        {buttonState.kind === 'scheduled' ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 p-3 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            {formatStartDate(buttonState.startAt)
              ? `Opens ${formatStartDate(buttonState.startAt)}`
              : 'Not open yet'}
          </div>
        ) : buttonState.kind === 'completed' ? (
          // Completed (no retake left) links straight to the results page —
          // there's nothing left here to start. Item 1 fix — same
          // distinct muted/outline treatment as the card, not the solid
          // brand-accent blue every clickable action state uses.
          <Link
            to={`/student/attempts/${buttonState.resultsAttemptId}/submitted`}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'mt-4 w-full border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            Test Completed
          </Link>
        ) : (
          // Every other state uses the same instructions-flow navigation as
          // before ("Continue"/"Retake" resuming/re-starting is the
          // backend's own job — attempts.service.ts's startAttempt already
          // returns the existing in_progress attempt instead of creating a
          // new one when one exists, so this click handler doesn't need to
          // know which case it is).
          <Button
            className="mt-4 w-full bg-brand-accent text-white hover:bg-brand-accent/90"
            disabled={buttonState.kind === 'not-live'}
            onClick={() => navigate(`/student/assessments/${assessment.id}/instructions`)}
          >
            {ATTEMPT_BUTTON_LABELS[buttonState.kind]}
          </Button>
        )}
      </div>
    </div>
  )
}
