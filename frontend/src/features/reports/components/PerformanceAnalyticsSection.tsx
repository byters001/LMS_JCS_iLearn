import { TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ApiError } from '@/api'
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

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })

interface ChartPoint {
  label: string
  assessmentTitle: string
  score: number
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
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-medium ${isUp ? 'text-emerald-600' : 'text-destructive'}`}
    >
      <Icon className="size-4" />
      {isUp ? '+' : '-'}
      {formatScore(Math.abs(diff))} pts vs last attempt
    </p>
  )
}

export default function PerformanceAnalyticsSection() {
  const { data, isPending, isError, error } = useMyAttempts({ page: 1, pageSize: FETCH_SIZE })

  const sectionShell = (children: ReactNode) => (
    <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-brand-primary">
        Performance Analytics
      </h2>
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
  // submissionTime aren't guaranteed to agree. Capped to the most recent
  // MAX_CHART_POINTS completed attempts within the FETCH_SIZE window, not
  // the student's entire history — this is a dashboard glance, not the full
  // attempt log (that's Attempt History, /student/attempts).
  const completed = toCompletedAttempts(data?.items ?? [])
    .sort((a, b) => attemptTimestamp(a.attempt) - attemptTimestamp(b.attempt))
    .slice(-MAX_CHART_POINTS)

  if (completed.length === 0) {
    return sectionShell(
      <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        You haven&apos;t completed any assessments yet — your performance trend will appear here
        once you finish one.
      </p>,
    )
  }

  const latest = completed[completed.length - 1]

  if (completed.length === 1) {
    return sectionShell(
      <div className="mt-3 flex items-center justify-between rounded-lg border border-border p-4">
        <div>
          <p className="truncate text-sm font-medium text-brand-primary">
            {latest.attempt.assessmentTitle}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">First attempt</p>
        </div>
        <p className="text-2xl font-semibold text-brand-primary">{formatScore(latest.score)}</p>
      </div>,
    )
  }

  const previous = completed[completed.length - 2]
  const diff = latest.score - previous.score

  const chartData: ChartPoint[] = completed.map(({ attempt, score }) => ({
    label: DATE_FORMATTER.format(new Date(attemptTimestamp(attempt))),
    assessmentTitle: attempt.assessmentTitle,
    score,
  }))

  return sectionShell(
    <>
      <div className="mt-1 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Points scored across your completed attempts</p>
        <DeltaCallout diff={diff} />
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
              dot={{ r: 4, fill: SCORE_LINE_COLOR }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>,
  )
}
