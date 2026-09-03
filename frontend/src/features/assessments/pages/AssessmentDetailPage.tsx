import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Lock, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { Assessment, ListAvailableAssessmentsResponse } from '../types'

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

// Same 'live'/'scheduled' Badge variants StudentAssessmentsPage.tsx's card
// already establishes as the right meaning for these two statuses — kept as
// its own small local copy rather than a cross-file import, matching this
// codebase's existing convention of a page owning its own tiny status-badge
// helper (see MyAttemptsListPage.tsx's STATUS_BADGE_VARIANT for the same
// pattern) rather than reaching into a sibling page's component.
function StatusBadge({ status }: { status: Assessment['status'] }) {
  if (status === 'live') return <Badge variant="live">Live</Badge>
  if (status === 'scheduled') return <Badge variant="scheduled">Scheduled</Badge>
  return <Badge variant="secondary">{status}</Badge>
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
      <div className="p-4">
        <Card className="mx-auto max-w-xl gap-0 p-4">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load this assessment&apos;s details directly.{' '}
            <Link to="/student/assessments" className="text-primary underline">
              Go back to your assessments
            </Link>
            .
          </p>
        </Card>
      </div>
    )
  }

  // Button-state phase — same getAttemptButtonState() StudentAssessmentsPage.tsx's
  // card uses, so this page's button can never disagree with the card that
  // linked here about whether this is a fresh start, a resume, a retake, or
  // already completed.
  const buttonState = getAttemptButtonState(assessment)

  return (
    <div className="space-y-3 p-4">
      <Link
        to="/student/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to assessments
      </Link>

      <Card className="mx-auto max-w-xl gap-0 p-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-xl font-semibold text-foreground">{assessment.title}</h1>
          <StatusBadge status={assessment.status} />
        </div>
        <Badge variant="secondary" className="mt-2">
          {TEST_CATEGORY_LABELS[assessment.testCategory] ?? assessment.testCategory}
        </Badge>

        {assessment.description && (
          <p className="mt-3 text-sm text-muted-foreground">{assessment.description}</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Timer</dt>
              <dd className="font-medium text-foreground">
                {assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Max attempts</dt>
              <dd className="font-medium text-foreground">{assessment.maxAttempts}</dd>
            </div>
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
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 p-3 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            {formatStartDate(buttonState.startAt)
              ? `Opens ${formatStartDate(buttonState.startAt)}`
              : 'Not open yet'}
          </div>
        ) : buttonState.kind === 'completed' ? (
          // Completed (no retake left) links straight to the polished
          // report page (Phase 4, final — was the bare results page
          // before; StudentAssessmentsPage.tsx's card was repointed the
          // same way, same reasoning) — there's nothing left here to
          // start. Same distinct muted/outline treatment as the card, not
          // the solid primary fill every clickable action state uses.
          <Link
            to={`/student/attempts/${buttonState.resultsAttemptId}/report`}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'mt-4 w-full border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {ATTEMPT_BUTTON_LABELS.completed}
          </Link>
        ) : (
          // Every other state uses the same instructions-flow navigation as
          // before ("Continue"/"Retake" resuming/re-starting is the
          // backend's own job — attempts.service.ts's startAttempt already
          // returns the existing in_progress attempt instead of creating a
          // new one when one exists, so this click handler doesn't need to
          // know which case it is).
          <Button
            size="lg"
            className="mt-4 w-full"
            disabled={buttonState.kind === 'not-live'}
            onClick={() => navigate(`/student/assessments/${assessment.id}/instructions`)}
          >
            {ATTEMPT_BUTTON_LABELS[buttonState.kind]}
          </Button>
        )}
      </Card>
    </div>
  )
}
