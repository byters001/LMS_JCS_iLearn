import { BarChart3, CheckCircle2, Layers, PlayCircle, TrendingUp, Users } from 'lucide-react'
import { useState } from 'react'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Combobox } from '@/components/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { useMyBatches } from '@/features/organization/api'
import { useMyAnalyticsOverview, useMyBatchPerformance, useMyCategoryImprovement } from '../api'

const PICKER_PAGE_SIZE = 100
// Sentinel for "no batchId filter" — mirrors SuperAdminAnalyticsPage's own
// ALL_COLLEGES_VALUE sentinel, same reasoning (no existing picker in this
// codebase has a built-in "all" option).
const ALL_BATCHES_VALUE = '__all__'

// Same brand-accent/green pair Phase 2 already established (BatchPerformancePage's
// HISTOGRAM_COLOR / PASS_COLOR) — no new hues on this page either.
const SCORE_COLOR = '#4A44C4'
const IMPROVEMENT_COLOR = '#16a34a'

function formatPercent(value: number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value
  return Math.round(value)
}

// Faculty's own Analytics overview — Phase 3. Structurally distinct from
// SuperAdminAnalyticsPage (this same feature's Super Admin counterpart),
// per the Phase 3 differentiation proposal: no college dropdown (a batch
// filter instead, only shown once there's actually something to filter),
// a ranked list instead of an axis bar chart for the batch comparison, and
// a Radar chart instead of grouped bars for the category-improvement
// "skill profile." See AdminAnalyticsPage.tsx's sibling, TrainerAnalyticsPage.tsx,
// for how this is combined with the existing Batch Drill-down tab.
export default function FacultyAnalyticsPage() {
  const [selectedValue, setSelectedValue] = useState<string>(ALL_BATCHES_VALUE)
  const batchId = selectedValue === ALL_BATCHES_VALUE ? undefined : selectedValue

  const myBatches = useMyBatches({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const batchOptions = [
    { value: ALL_BATCHES_VALUE, label: 'All My Batches' },
    ...(myBatches.data?.items ?? []).map((batch) => ({ value: batch.id, label: batch.name })),
  ]
  // Progressive disclosure — a single-batch faculty member has nothing to
  // filter, so the picker would be pure clutter (Phase 3 differentiation
  // proposal's explicit call).
  const showBatchFilter = (myBatches.data?.items.length ?? 0) >= 2

  const overview = useMyAnalyticsOverview(batchId)
  const batchPerformance = useMyBatchPerformance()
  const categoryImprovement = useMyCategoryImprovement(batchId)

  const hasBatchScoreData = (batchPerformance.data ?? []).some((row) => row.attemptCount > 0)
  const radarData = (categoryImprovement.data ?? []).map((row) => ({
    subject: row.categoryName,
    // Defensive-only fallback: computeCategoryImprovement (backend) always
    // populates first/latest together or not at all for a row that made it
    // into the response — this ?? 0 exists purely for TypeScript's
    // `number | null` type, not a real null case in practice.
    first: row.firstAttemptAvgPercent ?? 0,
    latest: row.latestAttemptAvgPercent ?? 0,
  }))

  return (
    <div className="space-y-4 p-5">
      <PageHeader
        title="My Analytics"
        description="Aggregate performance across the batches you're assigned to."
      >
        {showBatchFilter && (
          <div className="max-w-sm space-y-1.5">
            <label className="text-xs font-medium text-brand-primary" htmlFor="facultyBatchPicker">
              Batch
            </label>
            <Combobox
              id="facultyBatchPicker"
              options={batchOptions}
              value={selectedValue}
              onSelect={setSelectedValue}
              placeholder="Select a batch…"
              isLoading={myBatches.isPending}
              isError={myBatches.isError}
              errorMessage="Failed to load your batches."
            />
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="My Batches"
            value={overview.data?.totalBatches}
            icon={Layers}
            iconClassName="bg-brand-primary/10 text-brand-primary"
          />
          <StatCard
            label="My Students"
            value={overview.data?.totalStudents}
            icon={Users}
            iconClassName="bg-brand-accent/10 text-brand-accent"
          />
          <StatCard
            label="Active Assessments"
            value={overview.data?.activeAssessments}
            icon={PlayCircle}
            iconClassName="bg-brand-primary/10 text-brand-primary"
          />
          <StatCard
            label="Avg Score (%)"
            value={overview.data ? formatPercent(overview.data.averageScorePercent) : undefined}
            icon={TrendingUp}
            iconClassName="bg-brand-accent/10 text-brand-accent"
          />
          <StatCard
            label="Completion Rate (%)"
            value={
              overview.data
                ? formatPercent(
                    overview.data.completionRate !== null ? overview.data.completionRate * 100 : null,
                  )
                : undefined
            }
            icon={CheckCircle2}
            iconClassName="bg-brand-primary/10 text-brand-primary"
          />
        </div>
      </PageHeader>

      {/* Chart 1 replacement — ranked list with inline proportional bars,
          same widget shape as StudentListPage.tsx's "Students by college"
          (name + thin bar + number), not an axis BarChart. Always compares
          every assigned batch regardless of the picker above — the
          comparison IS the point, same reasoning SuperAdminAnalyticsPage's
          own college-comparison chart never takes a collegeId. */}
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          My Batches — Performance
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Average score across every submitted attempt, per batch.
        </p>

        {batchPerformance.isPending && (
          <div className="mt-3 h-24 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading" />
        )}

        {batchPerformance.isError && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load batch performance.
          </div>
        )}

        {batchPerformance.data && batchPerformance.data.length === 0 && (
          <EmptyState className="mt-3" icon={Layers} message="You have no assigned batches yet." />
        )}

        {batchPerformance.data && batchPerformance.data.length > 0 && !hasBatchScoreData && (
          <EmptyState
            className="mt-3"
            icon={BarChart3}
            message="No submitted attempts yet across your batches — this will populate once students start completing assessments."
          />
        )}

        {batchPerformance.data && hasBatchScoreData && (
          <div className="mt-3 space-y-2.5">
            {batchPerformance.data.map((row) => (
              <div key={row.batchId} className="flex items-center gap-3">
                <p className="w-36 shrink-0 truncate text-sm text-foreground" title={row.batchName}>
                  {row.batchName}
                </p>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand-accent"
                    style={{ width: `${row.averageScorePercent ?? 0}%` }}
                  />
                </div>
                <p className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                  {row.averageScorePercent === null ? 'No attempts' : `${Math.round(row.averageScorePercent)}%`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chart 2 replacement — Radar "skill profile" (first vs. latest
          attempt, one axis per MCQ category), not a grouped bar chart. */}
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Skill-category Improvement
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Each student's first vs. most recent submitted attempt touching a category, averaged
          across students with at least two qualifying attempts. MCQ categories only — coding
          responses aren't graded yet and psychometric responses have no correctness concept, so
          neither can produce a real score.
        </p>

        {categoryImprovement.isPending && (
          <div className="mt-3 h-64 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading" />
        )}

        {categoryImprovement.isError && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load category improvement.
          </div>
        )}

        {categoryImprovement.data && categoryImprovement.data.length === 0 && (
          <EmptyState
            className="mt-3"
            icon={BarChart3}
            message="No students have two or more submitted MCQ attempts in the same category yet — this chart will populate as retake activity accumulates."
          />
        )}

        {categoryImprovement.data && categoryImprovement.data.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <PolarRadiusAxis
                domain={[0, 100]}
                tickCount={5}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
              <Radar
                name="First attempt"
                dataKey="first"
                stroke={SCORE_COLOR}
                fill={SCORE_COLOR}
                fillOpacity={0.25}
              />
              <Radar
                name="Latest attempt"
                dataKey="latest"
                stroke={IMPROVEMENT_COLOR}
                fill={IMPROVEMENT_COLOR}
                fillOpacity={0.25}
              />
              <Legend />
              <Tooltip formatter={(value) => `${Math.round(Number(value))}%`} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
