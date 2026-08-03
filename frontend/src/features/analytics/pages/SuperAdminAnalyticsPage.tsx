import { BarChart3, Building2, CheckCircle2, Layers, PlayCircle, TrendingUp, Users } from 'lucide-react'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Combobox } from '@/components/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { useBatchCountsByCollege, useColleges } from '@/features/organization/api'
import { useAnalyticsOverview, useCategoryImprovement, useCollegePerformance } from '../api'

const PICKER_PAGE_SIZE = 100
// Sentinel for "no collegeId filter" — the college-picker Combobox itself
// has no built-in unscoped option (every existing college picker in this
// codebase — BatchesEditor.tsx, CreateBatchPage.tsx, BatchPerformancePage.tsx
// — requires picking exactly one real college first); this is the first
// caller that needs an "All Colleges" choice, added as a page-local
// synthetic option rather than a change to the shared Combobox component.
const ALL_COLLEGES_VALUE = '__all__'

// Same brand-accent hex BatchPerformancePage.tsx's own HISTOGRAM_COLOR
// already uses for a single-series magnitude chart, and the same green
// BatchPerformancePage.tsx's PASS_COLOR / TrainerDetailPage.tsx's
// TREND_LINE_COLOR already use for "positive" — no new hues introduced
// anywhere on this page.
const SCORE_COLOR = '#4A44C4'
const IMPROVEMENT_COLOR = '#16a34a'

function formatPercent(value: number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value
  return Math.round(value)
}

// Platform-wide Super Admin dashboard — college selector + 5 stat cards +
// 2 cross-college charts. Distinct from BatchPerformancePage (this same
// feature's other page): that one drills into ONE batch's ONE assessment;
// this one aggregates across every college/batch/assessment at once. See
// AdminAnalyticsPage.tsx (routes/index.tsx's /admin/analytics) for how the
// two are combined into one Tabs page without removing the existing
// batch-drill-down capability.
export default function SuperAdminAnalyticsPage() {
  const [selectedValue, setSelectedValue] = useState<string>(ALL_COLLEGES_VALUE)
  const collegeId = selectedValue === ALL_COLLEGES_VALUE ? undefined : selectedValue

  const colleges = useColleges({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const collegeOptions = [
    { value: ALL_COLLEGES_VALUE, label: 'All Colleges' },
    ...(colleges.data?.items ?? []).map((college) => ({ value: college.id, label: college.name })),
  ]

  const overview = useAnalyticsOverview(collegeId)
  // Only fires when a single college is picked — the "Total Batches" card
  // below only renders in that case, same conditional-hook-usage-is-fine-
  // because-the-array-itself-changes shape useBatchCountsByCollege's other
  // callers (StudentListPage) already rely on.
  const { batchCountsByCollegeId } = useBatchCountsByCollege(collegeId ? [collegeId] : [])

  const collegePerformance = useCollegePerformance()
  const categoryImprovement = useCategoryImprovement(collegeId)

  const hasCollegeScoreData = (collegePerformance.data ?? []).some((row) => row.attemptCount > 0)

  return (
    <div className="space-y-4 p-5">
      <PageHeader
        title="Platform Overview"
        description="Aggregate performance across every college, batch, and assessment — pick a college below to narrow the scope."
      >
        <div className="max-w-sm space-y-1.5">
          <label className="text-xs font-medium text-brand-primary" htmlFor="analyticsCollegePicker">
            College
          </label>
          <Combobox
            id="analyticsCollegePicker"
            options={collegeOptions}
            value={selectedValue}
            onSelect={setSelectedValue}
            placeholder="Select a college…"
            isLoading={colleges.isPending}
            isError={colleges.isError}
            errorMessage="Failed to load colleges."
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {collegeId ? (
            <StatCard
              label="Total Batches"
              value={batchCountsByCollegeId.get(collegeId)}
              icon={Layers}
              iconClassName="bg-brand-primary/10 text-brand-primary"
            />
          ) : (
            <StatCard
              label="Total Colleges"
              value={colleges.data?.total}
              icon={Building2}
              iconClassName="bg-brand-primary/10 text-brand-primary"
            />
          )}
          <StatCard
            label="Total Students"
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

      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          College-wise Performance
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Average score across every submitted attempt, per college.
        </p>

        {collegePerformance.isPending && (
          <div className="mt-3 h-56 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading chart" />
        )}

        {collegePerformance.isError && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load college performance.
          </div>
        )}

        {collegePerformance.data && !hasCollegeScoreData && (
          <EmptyState
            className="mt-3"
            icon={BarChart3}
            message="No submitted attempts yet on the platform — this chart will populate once students start completing assessments."
          />
        )}

        {collegePerformance.data && hasCollegeScoreData && (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={collegePerformance.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="collegeName"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                formatter={(value, _name, entry) => {
                  const attemptCount = (entry.payload as { attemptCount: number }).attemptCount
                  return [
                    value === null ? 'No attempts yet' : `${Math.round(Number(value))}% (${attemptCount} attempt${attemptCount === 1 ? '' : 's'})`,
                    'Average score',
                  ]
                }}
              />
              <Bar dataKey="averageScorePercent" fill={SCORE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

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
          <div className="mt-3 h-56 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading chart" />
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
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryImprovement.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="categoryName"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                formatter={(value) => `${Math.round(Number(value))}%`}
              />
              <Legend
                formatter={(value) => (value === 'firstAttemptAvgPercent' ? 'First attempt' : 'Most recent attempt')}
              />
              <Bar
                dataKey="firstAttemptAvgPercent"
                name="firstAttemptAvgPercent"
                fill={SCORE_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                dataKey="latestAttemptAvgPercent"
                name="latestAttemptAvgPercent"
                fill={IMPROVEMENT_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
