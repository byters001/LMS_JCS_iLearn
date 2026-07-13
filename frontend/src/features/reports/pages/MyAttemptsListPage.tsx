import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useMyAttempts } from '../api'
import type { AttemptStatus } from '../types'

const PAGE_SIZE = 10

const STATUS_LABELS: Record<AttemptStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  pending_evaluation: 'Pending Evaluation',
  invalidated: 'Invalidated',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Attempt history at /student/attempts — reachable via the nav link added
// to layouts/StudentLayout.tsx (there was no navigation beyond the
// assessments list before this phase). Same real-pagination pattern
// StudentAssessmentsPage.tsx already uses (CLAUDE1.md non-negotiable #2) —
// never fetch-all-then-paginate-client-side.
export default function MyAttemptsListPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useMyAttempts({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-brand-primary">Your Attempt History</h1>
        <p className="text-sm text-muted-foreground">
          Every past and in-progress attempt across all your assessments.
        </p>
      </div>

      {isPending && (
        <div className="space-y-2" role="status" aria-label="Loading attempts">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load your attempt history. Please try again.'}
        </div>
      )}

      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              You haven&apos;t attempted any assessments yet.
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((attempt) => (
                <Link
                  key={attempt.id}
                  to={`/student/attempts/${attempt.id}/submitted`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4 shadow-sm transition-colors hover:border-brand-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-brand-primary">
                      {attempt.assessmentTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attempt #{attempt.attemptNumber}
                      {attempt.isRetake ? ' · Retake' : ''} &middot;{' '}
                      {formatDate(attempt.submissionTime ?? attempt.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-brand-primary">
                      {attempt.status === 'pending_evaluation'
                        ? 'Pending'
                        : (attempt.totalScore ?? '—')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {STATUS_LABELS[attempt.status] ?? attempt.status}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {data.total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages} &middot; {data.total} attempt
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
