import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

// Lifecycle state, not outcome — these badges say nothing about pass/fail
// (that's a scorePercent-vs-threshold question StudentDashboardPage's own
// RecentResultRow already answers separately, via 'success'/'danger' on the
// SCORE, not the status). 'live' for in_progress reuses the exact "this is
// happening right now" meaning FacultyAnalyticsPage's assessment-status
// badges already give that variant; 'closed' for submitted reuses the same
// "no longer active" neutral-grey token rather than inventing a new one.
const STATUS_BADGE_VARIANT: Record<AttemptStatus, 'neutral' | 'live' | 'closed' | 'warning' | 'danger'> = {
  not_started: 'neutral',
  in_progress: 'live',
  submitted: 'closed',
  pending_evaluation: 'warning',
  invalidated: 'danger',
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
//
// Phase 3b — swapped the raw h1/p header for PageHeader. No genuine stat
// row exists on this page (every number here already lives in the table
// itself, same as PerformancePage.tsx's own Phase 3a call), so no entrance
// animation is added. The row list is now the shared Table (same
// header-row/hover/pl-4/pr-4 shape as ScoreHistoryTable.tsx and
// StudentRosterTable.tsx) instead of a bespoke card list, split into
// Assessment/Attempt/Date/Score/Status columns; status renders via the
// shared Badge component instead of plain text.
//
// Structural rollout — deliberately NO hero here either. Highlighting "your
// most recent attempt" would just duplicate StudentDashboardPage's own
// Recent Results, and this page's actual job — a complete, evenly-weighted
// audit trail of every attempt — is undermined, not helped, by visually
// privileging one row over the rest. A clean dense table is the correct
// structural choice for a history page; only density/palette changed here.
export default function MyAttemptsListPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useMyAttempts({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title="Your Attempt History"
        description="Every past and in-progress attempt across all your assessments."
      />

      {isPending && (
        <div className="space-y-2" role="status" aria-label="Loading attempts">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load your attempt history. Please try again.'}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState message="You haven't attempted any assessments yet." />
      )}

      {data && data.items.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Assessment</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((attempt) => (
                <TableRow key={attempt.id} className="hover:bg-muted/30">
                  <TableCell className="max-w-0 pl-4 font-medium text-primary">
                    <Link
                      to={`/student/attempts/${attempt.id}/submitted`}
                      className="block truncate hover:underline"
                    >
                      {attempt.assessmentTitle}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    #{attempt.attemptNumber}
                    {attempt.isRetake ? ' · Retake' : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(attempt.submissionTime ?? attempt.createdAt)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-primary">
                    {attempt.status === 'pending_evaluation' ? 'Pending' : (attempt.totalScore ?? '—')}
                  </TableCell>
                  <TableCell className="pr-4">
                    <Badge variant={STATUS_BADGE_VARIANT[attempt.status]}>
                      {STATUS_LABELS[attempt.status] ?? attempt.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.total > 0 && (
            <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3.5 py-2.5">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages} &middot; {data.total} attempt
                {data.total === 1 ? '' : 's'}
                {isFetching ? ' · refreshing…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary/5"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary/5"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
