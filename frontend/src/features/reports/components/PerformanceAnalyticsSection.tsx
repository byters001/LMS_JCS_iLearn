import { Triangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ApiError } from '@/api'
import { CARD_GRADIENT, cn } from '@/lib/utils'
import { useMyAttempts } from '../api'
import type { MyAttemptSummary } from '../types'

// Reuses GET /reports/my-attempts (already built for MyAttemptsListPage) —
// no new backend endpoint for this widget. That endpoint's MyAttemptSummary
// row carries totalScore (raw points scored) but NOT a max-possible-marks
// field — max marks only exists per-attempt in the detail endpoint
// (sum of marksPossible across that attempt's frozen question set, see
// reports.types.ts's AttemptQuestionBreakdown). Charting a real score
// PERCENTAGE across N attempts would mean N parallel detail-fetches just to
// render this dashboard widget — an N+1 pattern. Deliberately not done here;
// this charts the raw totalScore already returned by the list endpoint
// instead. Same tradeoff TrainerDetailPage.tsx's trend chart already
// documents (averageScore isn't charted there either, for the same
// different-assessments-different-max-marks reason) — score points across
// different assessments aren't strictly comparable, which is why the axis
// is labeled "Points" rather than implying a normalized scale.
const FETCH_SIZE = 50
const MAX_CHART_POINTS = 20

const SCORE_LINE_COLOR = '#4A44C4' // brand-accent, tailwind.config.js
// Phase 4 (AttemptReportPage.tsx's highlightAttemptId dot) — same green
// this codebase already uses for "this is the positive/highlighted one"
// elsewhere (BatchPerformancePage.tsx's PASS_COLOR, the Super Admin/Faculty
// analytics pages' own IMPROVEMENT_COLOR) — no new hue introduced.
const IMPROVEMENT_DOT_COLOR = '#16a34a'

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })

interface ChartPoint {
  label: string
  assessmentTitle: string
  score: number
  attemptId: string
}

function toNumber(totalScore: string | null): number | null {
  if (totalScore === null) return null
  const parsed = Number(totalScore)
  return Number.isFinite(parsed) ? parsed : null
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

// submissionTime is when the attempt's score actually became final — the
// right axis for a "completed attempts over time" trend. createdAt (attempt
// start) is only a fallback for the theoretical case it's missing; it must
// NOT be mixed with submissionTime as a sort key, since the two aren't
// guaranteed to move in the same order (a student can start an attempt,
// leave it open, then submit it well after starting — and finishing — a
// later one). Sorting by createdAt while labeling by submissionTime was
// exactly that bug: it plotted points in one order but dated them by
// another, silently reversing the true most-recent-vs-previous comparison.
// Exported (Performance page phase) — ScoreHistoryTable.tsx's most-recent-
// first ordering needs the EXACT same submissionTime-not-createdAt sort key
// as this chart uses, for the same reason documented above: a second,
// hand-copied version of this function could silently drift out of sync
// with this one and re-introduce the exact ordering bug this comment
// already describes.
export function attemptTimestamp(attempt: MyAttemptSummary): number {
  return new Date(attempt.submissionTime ?? attempt.createdAt).getTime()
}

// Only 'submitted' attempts carry a final, trustworthy totalScore —
// 'pending_evaluation' still has ungraded coding responses (see
// attempts.service.ts's submitAttempt), so its totalScore isn't done
// changing yet and would misrepresent the trend if included.
function toCompletedAttempts(items: MyAttemptSummary[]): { attempt: MyAttemptSummary; score: number }[] {
  return items
    .filter((attempt) => attempt.status === 'submitted')
    .map((attempt) => ({ attempt, score: toNumber(attempt.totalScore) }))
    .filter((row): row is { attempt: MyAttemptSummary; score: number } => row.score !== null)
}

function DeltaCallout({ diff }: { diff: number }) {
  if (diff === 0) {
    return <p className="text-sm font-medium text-muted-foreground">No change vs last attempt</p>
  }
  const isUp = diff > 0
  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-medium ${isUp ? 'text-emerald-600' : 'text-destructive'}`}
    >
      <Triangle className={cn('size-4', !isUp && 'rotate-180')} fill="currentColor" />
      {isUp ? '+' : '-'}
      {formatScore(Math.abs(diff))} pts vs last attempt
    </p>
  )
}

interface PerformanceAnalyticsSectionProps {
  // Phase 4 (AttemptReportPage.tsx) — when given, the delta callout and the
  // "first attempt" special case anchor to THIS specific attempt instead of
  // always the caller's most recent one, and its point on the chart (if
  // within the rendered window) gets a distinct highlighted dot. Omitted
  // everywhere else (PerformancePage.tsx's dashboard usage), which keeps
  // its existing "always the latest attempt" behavior byte-for-byte.
  highlightAttemptId?: string
  // Phase 4 — lets AttemptReportPage.tsx use report-appropriate copy
  // ("Your Score Trend") instead of the dashboard's generic heading,
  // without forking a second copy of this component for one string.
  heading?: string
}

export default function PerformanceAnalyticsSection({
  highlightAttemptId,
  heading = 'Performance Analytics',
}: PerformanceAnalyticsSectionProps = {}) {
  const { data, isPending, isError, error } = useMyAttempts({ page: 1, pageSize: FETCH_SIZE })

  const sectionShell = (children: ReactNode) => (
    <div className={cn('mb-4 rounded-xl border border-border bg-card p-4 shadow-sm', CARD_GRADIENT)}>
      <h2 className="font-heading text-lg font-semibold text-brand-primary">{heading}</h2>
      {children}
    </div>
  )

  if (isPending) {
    return sectionShell(
      <div className="mt-4 h-48 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading performance analytics" />,
    )
  }

  if (isError) {
    return sectionShell(
      <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error instanceof ApiError
          ? error.message
          : 'Failed to load your performance analytics. Please try again.'}
      </div>,
    )
  }

  // Oldest -> newest by submissionTime (see attemptTimestamp) — NOT simply
  // reversing the list endpoint's desc(createdAt) order, since createdAt and
  // submissionTime aren't guaranteed to agree. This is the caller's FULL
  // completed history within the FETCH_SIZE window — chartCompleted below
  // is the further-capped MAX_CHART_POINTS slice actually rendered; kept
  // separate so a highlightAttemptId's delta is still computed correctly
  // even in the rare case it falls just outside the chart's own window.
  const allCompleted = toCompletedAttempts(data?.items ?? []).sort(
    (a, b) => attemptTimestamp(a.attempt) - attemptTimestamp(b.attempt),
  )

  if (allCompleted.length === 0) {
    return sectionShell(
      <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        You haven&apos;t completed any assessments yet — your performance trend will appear here
        once you finish one.
      </p>,
    )
  }

  if (allCompleted.length === 1) {
    const only = allCompleted[0]
    return sectionShell(
      <div className="mt-3 flex items-center justify-between rounded-lg border border-border p-4">
        <div>
          <p className="truncate text-sm font-medium text-brand-primary">
            {only.attempt.assessmentTitle}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">First attempt</p>
        </div>
        <p className="text-2xl font-semibold text-brand-primary">{formatScore(only.score)}</p>
      </div>,
    )
  }

  const targetIndex = highlightAttemptId
    ? allCompleted.findIndex((row) => row.attempt.id === highlightAttemptId)
    : allCompleted.length - 1

  // Only reachable if a caller passes a highlightAttemptId this student has
  // no matching 'submitted' row for within the FETCH_SIZE=50 window — e.g.
  // a genuinely prolific test-taker viewing a report for an attempt older
  // than their last 50. Rather than silently fall back to a DIFFERENT
  // attempt's delta/score (misleading on a page reporting on one specific
  // attempt), this says so plainly.
  if (targetIndex === -1) {
    return sectionShell(
      <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        This attempt is outside your recent attempt history — the trend chart isn&apos;t available
        for it.
      </p>,
    )
  }

  const target = allCompleted[targetIndex]
  const previous = targetIndex > 0 ? allCompleted[targetIndex - 1] : undefined

  const chartCompleted = allCompleted.slice(-MAX_CHART_POINTS)
  const chartData: ChartPoint[] = chartCompleted.map(({ attempt, score }) => ({
    label: DATE_FORMATTER.format(new Date(attemptTimestamp(attempt))),
    assessmentTitle: attempt.assessmentTitle,
    score,
    attemptId: attempt.id,
  }))

  return sectionShell(
    <>
      <div className="mt-1 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Points scored across your completed attempts</p>
        {previous ? (
          <DeltaCallout diff={target.score - previous.score} />
        ) : (
          <p className="text-sm font-medium text-muted-foreground">First attempt</p>
        )}
      </div>

      <div className="mt-3">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="performanceScoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SCORE_LINE_COLOR} stopOpacity={0.1} />
                <stop offset="100%" stopColor={SCORE_LINE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} label={{ value: 'Points', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [formatScore(Number(value)), 'Score']}
              labelFormatter={(_label, payload) =>
                payload?.[0]?.payload ? (payload[0].payload as ChartPoint).assessmentTitle : ''
              }
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={SCORE_LINE_COLOR}
              strokeWidth={2}
              fill="url(#performanceScoreFill)"
              dot={(dotProps) => {
                const point = dotProps.payload as ChartPoint
                const isHighlighted = highlightAttemptId !== undefined && point.attemptId === highlightAttemptId
                return (
                  <circle
                    key={point.attemptId}
                    cx={dotProps.cx}
                    cy={dotProps.cy}
                    r={isHighlighted ? 7 : 4}
                    fill={isHighlighted ? IMPROVEMENT_DOT_COLOR : SCORE_LINE_COLOR}
                    stroke={isHighlighted ? 'var(--card)' : 'none'}
                    strokeWidth={isHighlighted ? 2 : 0}
                  />
                )
              }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>,
  )
}
