import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ApiError } from '@/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CARD_GRADIENT, cn } from '@/lib/utils'
import { useTrainerPerformance } from '../api'
import type { TrainerPerformanceTrendPoint } from '../types'

// Same validated colorblind-safe green as features/analytics/pages/
// BatchPerformancePage.tsx's PASS_COLOR — one shared "pass" color across
// the app rather than a second, arbitrarily-different one for this chart.
const TREND_LINE_COLOR = '#16a34a'

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-background p-4', CARD_GRADIENT)}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-brand-primary">{value}</p>
    </div>
  )
}

interface TrendChartPoint {
  label: string
  assessmentTitle: string
  batchId: string
  passRatePercent: number
}

// Only passRate is charted as one continuous trend line — it's always a
// 0-1 proportion, so it's the one metric that's actually comparable across
// different assessments. averageScore is deliberately NOT plotted
// alongside it on a shared axis: different assessments can have wildly
// different total possible marks (same reasoning as the backend's own
// getBatchPerformance/BatchPerformanceSummary — see analytics.service.ts's
// module comment), so a unified "score" line would silently mix
// incompatible scales into one misleading trend. Raw averageScore is still
// shown, per point, in the table below the chart — just not charted.
function toChartPoints(trend: TrainerPerformanceTrendPoint[]): TrendChartPoint[] {
  return trend
    .filter((point) => point.passRate !== null)
    .map((point) => ({
      label: DATE_FORMATTER.format(new Date(point.attemptedAt)),
      assessmentTitle: point.assessmentTitle,
      batchId: point.batchId,
      passRatePercent: Math.round((point.passRate as number) * 100),
    }))
}

// Super Admin only — the route this page lives on is already gated by
// RequireRole (routes/index.tsx). Reached only via TrainersDashboardPage's
// click-through (no separate nav entry for this detail route, same
// precedent as PoolDetailPage/QuestionDetailPage).
export default function TrainerDetailPage() {
  const { trainerId } = useParams<{ trainerId: string }>()
  const performance = useTrainerPerformance(trainerId)

  const chartData = performance.data ? toChartPoints(performance.data.trend) : []
  const batchNameById = new Map(
    (performance.data?.batches ?? []).map((batch) => [batch.id, batch.name]),
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to trainers
      </Link>

      {performance.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading trainer performance">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {performance.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {performance.error instanceof ApiError
            ? performance.error.message
            : 'Failed to load trainer performance. Please try again.'}
        </div>
      )}

      {performance.data && (
        <>
          <div>
            <h1 className="font-heading text-xl font-semibold text-brand-primary">{performance.data.fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Assigned batches and performance trend across them.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Assigned Batches" value={String(performance.data.batches.length)} />
            <StatTile label="Assessments Tracked" value={String(performance.data.trend.length)} />
          </div>

          <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Assigned Batches
            </h2>
            {performance.data.batches.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No batches assigned yet.
              </p>
            ) : (
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {performance.data.batches.map((batch) => (
                  <div key={batch.id} className="rounded-lg border border-border p-3">
                    <dt className="font-medium text-brand-primary">{batch.name}</dt>
                    <dd className="mt-0.5 text-sm text-muted-foreground">
                      {batch.collegeName} &middot; {batch.departmentName}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Pass Rate Trend
            </h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Pass Rate']}
                    labelFormatter={(_label, payload) =>
                      payload?.[0]?.payload
                        ? `${(payload[0].payload as TrendChartPoint).assessmentTitle} — ${
                            batchNameById.get((payload[0].payload as TrendChartPoint).batchId) ?? ''
                          }`
                        : ''
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="passRatePercent"
                    stroke={TREND_LINE_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No graded assessment activity yet across this trainer's batches — the trend will
                appear once at least one attempt has been fully evaluated.
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Assessment</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Average Score</TableHead>
                  <TableHead>Pass Rate</TableHead>
                  <TableHead className="pr-4 text-right">Attempted / Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.data.trend.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No assessment activity yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  performance.data.trend.map((point) => (
                    <TableRow
                      key={`${point.batchId}-${point.assessmentId}`}
                      className="hover:bg-muted/30"
                    >
                      <TableCell className="pl-4 font-medium text-brand-primary">
                        {point.assessmentTitle}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {batchNameById.get(point.batchId) ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {point.averageScore ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {point.passRate !== null ? `${Math.round(point.passRate * 100)}%` : '—'}
                      </TableCell>
                      <TableCell className="pr-4 text-right text-muted-foreground">
                        {point.studentsAttempted} / {point.totalStudents}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
