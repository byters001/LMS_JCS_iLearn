import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { ApiError } from '@/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useMyAttempts } from '../api'
import { attemptTimestamp } from './PerformanceAnalyticsSection'
import type { MyAttemptSummary } from '../types'

// Same fetch window as PerformanceAnalyticsSection.tsx's own chart — a
// recent-history companion table, not a replacement for the full Attempt
// History page (/student/attempts, MyAttemptsListPage.tsx), which already
// handles real pagination over a student's entire history.
const FETCH_SIZE = 50

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

interface ScoreHistoryRow {
  attempt: MyAttemptSummary
  scorePercent: number
  // null only for the chronologically FIRST scored attempt — "—", never a
  // fabricated 0%, per this phase's explicit requirement.
  changeVsPrevious: number | null
}

// Only attempts with both a 'submitted' status AND a resolvable
// scorePercent (backend's reports.service.ts's attachScorePercents —
// reused from analyticsService.getScorePercentagesForAttempts, not a new
// calculation here) are eligible — same "only a final, trustworthy score
// counts" reasoning PerformanceAnalyticsSection.tsx's own
// toCompletedAttempts already documents. Sorted oldest -> newest by the
// SAME submissionTime-based attemptTimestamp the chart uses (imported, not
// re-implemented) to compute each row's change-vs-previous correctly, then
// reversed for most-recent-first display — computing the delta on an
// already-reversed array would silently compare each attempt to the WRONG
// neighbor.
function buildRows(items: MyAttemptSummary[]): ScoreHistoryRow[] {
  const scored = items
    .filter((attempt) => attempt.status === 'submitted' && attempt.scorePercent !== null)
    .sort((a, b) => attemptTimestamp(a) - attemptTimestamp(b))

  const rows: ScoreHistoryRow[] = scored.map((attempt, index) => {
    const scorePercent = attempt.scorePercent as number
    const previous = index > 0 ? scored[index - 1] : undefined
    const changeVsPrevious =
      previous && previous.scorePercent !== null
        ? Math.round((scorePercent - previous.scorePercent) * 10) / 10
        : null
    return { attempt, scorePercent, changeVsPrevious }
  })

  return rows.reverse()
}

function ChangeCell({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-muted-foreground">—</span>
  }
  if (change === 0) {
    return (
      <span className="flex items-center justify-end gap-1 text-muted-foreground">
        <Minus className="size-3.5" />
        0%
      </span>
    )
  }
  const isUp = change > 0
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'flex items-center justify-end gap-1 font-medium',
        isUp ? 'text-emerald-600' : 'text-destructive',
      )}
    >
      <Icon className="size-3.5" />
      {isUp ? '+' : '-'}
      {formatPercent(Math.abs(change))}
    </span>
  )
}

// Performance page phase (item 2b) — the score-percent table companion to
// PerformanceAnalyticsSection.tsx's chart. Same brand-accent/brand-primary
// tokens and hover-row convention as LeaderboardSection.tsx's table
// (hover:bg-muted/30), no new colors invented — the emerald/destructive
// up/down treatment matches PerformanceAnalyticsSection.tsx's own
// DeltaCallout exactly, just applied per-row instead of once for the
// latest attempt.
export default function ScoreHistoryTable() {
  const { data, isPending, isError, error } = useMyAttempts({ page: 1, pageSize: FETCH_SIZE })

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-brand-primary">Score History</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every graded attempt, most recent first, with your % change vs. the attempt before it.
      </p>

      {isPending && (
        <div
          className="mt-4 h-48 animate-pulse rounded-lg bg-muted"
          role="status"
          aria-label="Loading score history"
        />
      )}

      {isError && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load your score history. Please try again.'}
        </div>
      )}

      {data &&
        (() => {
          const rows = buildRows(data.items)
          if (rows.length === 0) {
            return (
              <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                You haven&apos;t completed any graded assessments yet — your score history will
                appear here once one is graded.
              </p>
            )
          }
          return (
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Assessment</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="pr-4 text-right">% Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ attempt, scorePercent, changeVsPrevious }) => (
                    <TableRow key={attempt.id} className="hover:bg-muted/30">
                      <TableCell className="pl-4 font-medium text-brand-primary">
                        {attempt.assessmentTitle}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {DATE_FORMATTER.format(
                          new Date(attempt.submissionTime ?? attempt.createdAt),
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-brand-primary">
                        {formatPercent(scorePercent)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <ChangeCell change={changeVsPrevious} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        })()}
    </div>
  )
}
