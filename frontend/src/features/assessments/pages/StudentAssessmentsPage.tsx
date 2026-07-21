import { Clock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAvailableAssessments } from '../api'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { Assessment, AvailableAssessment } from '../types'

const PAGE_SIZE = 12

const TEST_CATEGORY_LABELS: Record<Assessment['testCategory'], string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

function StatusBadge({ status }: { status: Assessment['status'] }) {
  if (status === 'live') {
    return (
      <Badge className="bg-brand-accent text-white">
        <span className="size-1.5 rounded-full bg-white" />
        Live
      </Badge>
    )
  }
  if (status === 'scheduled') {
    return (
      <Badge variant="outline" className="border-brand-primary/30 text-brand-primary">
        Scheduled
      </Badge>
    )
  }
  return <Badge variant="secondary">{status}</Badge>
}

function formatStartDate(startAt: string | null): string | null {
  if (!startAt) return null
  return new Date(startAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Button-state phase — label + the card's own link target both derive from
// the SAME getAttemptButtonState()/ATTEMPT_BUTTON_LABELS this feature's
// AssessmentDetailPage.tsx button also uses, so the two surfaces can never
// disagree about whether a given assessment is Start/Continue/Retake/
// Completed. A completed (locked, no retake left) assessment's card links
// straight to the results page instead of the detail page — there's
// nothing left to "view details" toward starting.
function AssessmentCard({ assessment }: { assessment: AvailableAssessment }) {
  const startDate = formatStartDate(assessment.startAt)
  const durationLabel = assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'
  const buttonState = getAttemptButtonState(assessment)
  const linkTo =
    buttonState.kind === 'completed'
      ? `/student/attempts/${buttonState.resultsAttemptId}/submitted`
      : `/student/assessments/${assessment.id}`

  return (
    <Link
      to={linkTo}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-accent/50 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading font-semibold text-foreground">{assessment.title}</h3>
        <StatusBadge status={assessment.status} />
      </div>

      {assessment.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{assessment.description}</p>
      )}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        <span>{durationLabel}</span>
        {assessment.status === 'scheduled' && startDate && <span>· Starts {startDate}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{TEST_CATEGORY_LABELS[assessment.testCategory]}</Badge>
        <Badge variant="outline">
          {assessment.maxAttempts} attempt{assessment.maxAttempts === 1 ? '' : 's'}
        </Badge>
      </div>

      <span
        className={cn(
          buttonVariants({ variant: 'default' }),
          'mt-1 h-9 w-full group-hover:bg-primary/90',
        )}
      >
        {ATTEMPT_BUTTON_LABELS[buttonState.kind]}
      </span>
    </Link>
  )
}

export default function StudentAssessmentsPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useAvailableAssessments({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Your Assessments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live and upcoming assessments for your batch.
        </p>
      </div>

      {isPending && (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading assessments"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load assessments. Please try again.'}
        </div>
      )}

      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No assessments available right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((assessment) => (
                <AssessmentCard key={assessment.id} assessment={assessment} />
              ))}
            </div>
          )}

          {data.total > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages} &middot; {data.total} assessment
                {data.total === 1 ? '' : 's'}
                {isFetching ? ' · refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
