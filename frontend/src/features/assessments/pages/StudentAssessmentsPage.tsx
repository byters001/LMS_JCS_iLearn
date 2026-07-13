import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useAvailableAssessments } from '../api'
import type { Assessment } from '../types'

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
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-accent px-2.5 py-0.5 text-xs font-semibold text-white">
        <span className="size-1.5 rounded-full bg-white" />
        Live
      </span>
    )
  }
  if (status === 'scheduled') {
    return (
      <span className="rounded-full border border-brand-primary/30 px-2.5 py-0.5 text-xs font-medium text-brand-primary">
        Scheduled
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {status}
    </span>
  )
}

function formatStartDate(startAt: string | null): string | null {
  if (!startAt) return null
  return new Date(startAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function AssessmentCard({ assessment }: { assessment: Assessment }) {
  const startDate = formatStartDate(assessment.startAt)

  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-brand-primary">{assessment.title}</h3>
        <StatusBadge status={assessment.status} />
      </div>

      <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {TEST_CATEGORY_LABELS[assessment.testCategory]}
      </p>

      {assessment.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{assessment.description}</p>
      )}

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>{assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'}</p>
        {assessment.status === 'scheduled' && startDate && <p>Starts: {startDate}</p>}
        <p>
          Max attempts: {assessment.maxAttempts}
        </p>
      </div>
    </div>
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
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-brand-primary">Your Assessments</h1>
        <p className="text-sm text-muted-foreground">
          Live and upcoming assessments for your batch.
        </p>
      </div>

      {isPending && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading assessments"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load assessments. Please try again.'}
        </div>
      )}

      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No assessments available right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((assessment) => (
                <AssessmentCard key={assessment.id} assessment={assessment} />
              ))}
            </div>
          )}

          {data.total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages} &middot; {data.total} assessment
                {data.total === 1 ? '' : 's'}
                {isFetching ? ' · refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
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
