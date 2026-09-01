import { motion } from 'framer-motion'
import { BarChart3, Building2, ShieldAlert } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBatchCountsByCollege, useColleges } from '@/features/organization/api'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAnalyticsOverview, useCategoryImprovement, useCollegePerformance, useProctoringActivity } from '../api'

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
const SCORE_COLOR = '#4F46E5'
const IMPROVEMENT_COLOR = '#16a34a'

// Date-range half of the filter bar (Phase 2 brief's "filter bar
// (college/date range)") — scoped honestly to what can actually honor a
// date range: only the proctoring-activity query below accepts one
// (analytics.schema.ts's proctoringActivityQuerySchema). The other three
// stats (colleges/students/active assessments) and both charts have no
// date-scoping anywhere in the backend today, and adding it there is well
// beyond "ordinary new query work" for this phase — wiring a decorative
// control that doesn't actually filter anything would be worse than not
// having one, so this toggle drives the proctoring card/list only.
const PROCTORING_WINDOW_OPTIONS = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
] as const

const PROCTORING_EVENT_LABELS: Record<string, string> = {
  tab_switch: 'Tab switch',
  fullscreen_exit: 'Fullscreen exit',
  camera_flag: 'Camera flag',
  copy_paste: 'Copy/paste',
  network_disconnect: 'Network disconnect',
  window_blur: 'Window blur',
}

// Platform-wide Super Admin dashboard — college selector + date-range
// (proctoring only, see above) + 4 stat cards + 2 cross-college charts +
// an organizations activity table + a recent proctoring events list.
// Distinct from BatchPerformancePage (this same feature's other page): that
// one drills into ONE batch's ONE assessment; this one aggregates across
// every college/batch/assessment at once. See AdminAnalyticsPage.tsx
// (routes/index.tsx's /admin/analytics) for how the two are combined into
// one Tabs page without removing the existing batch-drill-down capability.
export default function SuperAdminAnalyticsPage() {
  const [selectedValue, setSelectedValue] = useState<string>(ALL_COLLEGES_VALUE)
  const collegeId = selectedValue === ALL_COLLEGES_VALUE ? undefined : selectedValue
  const [proctoringDays, setProctoringDays] = useState<number>(7)
  const prefersReducedMotion = usePrefersReducedMotion()

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
  const proctoringActivity = useProctoringActivity(collegeId, proctoringDays)

  const hasCollegeScoreData = (collegePerformance.data ?? []).some((row) => row.attemptCount > 0)
  const collegePerformanceByCollegeId = new Map(
    (collegePerformance.data ?? []).map((row) => [row.collegeId, row]),
  )
  // Hero row's compact preview — the SAME recentEvents array the full table
  // further down this page already renders, just its first few rows. No
  // second query.
  const recentEventsPreview = (proctoringActivity.data?.recentEvents ?? []).slice(0, 4)

  const statVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS
  const containerVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title="Platform Overview"
        description="Aggregate performance across every college, batch, and assessment — pick a college below to narrow the scope."
      >
        <div className="flex flex-wrap items-end gap-3">
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

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-brand-primary">
              Proctoring window
            </p>
            {/* Segmented toggle, not a dropdown — same pattern
                DownloadCsvDialog.tsx's Format control already established
                for a small, fixed set of mutually-exclusive options. */}
            <div className="inline-flex rounded-md border border-input p-0.5">
              {PROCTORING_WINDOW_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setProctoringDays(option.days)}
                  aria-pressed={proctoringDays === option.days}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    proctoringDays === option.days
                      ? 'bg-shell-accent text-white'
                      : 'text-muted-foreground hover:text-brand-primary',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

      </PageHeader>

      {/* Structural language shared with StudentDashboardPage/
          FacultyAnalyticsPage, adapted to Admin's own numbers and kept on
          Admin's own existing tokens — structural pass only, no new colors.
          Total Students is the hero: the single number that answers "how
          big is this platform" at a glance, given genuine typographic
          display weight (Space Grotesk, ~60px) instead of a 4th equal-weight
          stat card — this is a plain count, not a percentage, so it gets
          the same scale-contrast treatment mockup B explored rather than
          the ring StudentDashboardPage/FacultyAnalyticsPage use for a %
          metric (forcing the ring onto a raw count would misread as
          "0-100% of something"). Total Colleges/Batches, Active Assessments,
          and the Proctoring count pack tightly beside it. The corner badge
          bleeds only when there's a real signal (>=1 proctoring event in the
          selected window) — the deliberate grid-break, tied to actual data
          rather than decorative. Recent Proctoring Events (right column)
          reuses the SAME query already powering the full table further down
          this page — no second fetch, just its first few rows as a preview
          beside the hero. */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="grid grid-cols-1 gap-2.5 lg:grid-cols-5"
      >
        <motion.div
          variants={statVariants}
          className="relative overflow-visible rounded-xl bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to p-4 text-white shadow-sm lg:col-span-3"
        >
          {(proctoringActivity.data?.totalEvents ?? 0) > 0 && (
            <div
              className="absolute -top-3 -right-3 flex size-14 items-center justify-center rounded-full border-4 border-background bg-shell-accent text-white shadow-md"
              title={`${proctoringActivity.data?.totalEvents} proctoring event${proctoringActivity.data?.totalEvents === 1 ? '' : 's'} in this window`}
            >
              <ShieldAlert className="size-6" />
            </div>
          )}

          <p className="text-xs text-white/70">Platform-wide</p>
          {overview.data ? (
            <span className="mt-1 block font-heading text-6xl leading-[0.85] font-bold">
              {overview.data.totalStudents}
            </span>
          ) : (
            <span className="mt-1 inline-block h-12 w-28 animate-pulse rounded bg-white/20" />
          )}
          <p className="mt-1.5 font-mono text-[11px] tracking-widest text-white/70 uppercase">Total Students</p>

          <div className="mt-3 flex items-center gap-5 border-t border-white/15 pt-3">
            <div>
              <p className="font-mono text-xl leading-none font-semibold">
                {collegeId ? (
                  (batchCountsByCollegeId.get(collegeId) ?? (
                    <span className="inline-block h-5 w-6 animate-pulse rounded bg-white/20 align-middle" />
                  ))
                ) : colleges.data ? (
                  colleges.data.total
                ) : (
                  <span className="inline-block h-5 w-6 animate-pulse rounded bg-white/20 align-middle" />
                )}
              </p>
              <p className="mt-0.5 text-[10px] text-white/70">{collegeId ? 'Total Batches' : 'Total Colleges'}</p>
            </div>
            <div>
              <p className="font-mono text-xl leading-none font-semibold">
                {overview.data ? (
                  overview.data.activeAssessments
                ) : (
                  <span className="inline-block h-5 w-6 animate-pulse rounded bg-white/20 align-middle" />
                )}
              </p>
              <p className="mt-0.5 text-[10px] text-white/70">Active Assessments</p>
            </div>
            <div>
              <p className="font-mono text-xl leading-none font-semibold">
                {proctoringActivity.data ? (
                  proctoringActivity.data.totalEvents
                ) : (
                  <span className="inline-block h-5 w-6 animate-pulse rounded bg-white/20 align-middle" />
                )}
              </p>
              <p className="mt-0.5 text-[10px] text-white/70">
                Proctoring ({proctoringDays === 1 ? '24h' : `${proctoringDays}d`})
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={statVariants} className="lg:col-span-2">
          <Card className="h-full p-3.5">
            <h2 className="font-heading text-sm font-semibold text-brand-primary">Recent Proctoring Events</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Latest integrity signals in the selected window.</p>

            {proctoringActivity.isPending && (
              <div className="mt-2.5 space-y-2" role="status" aria-label="Loading proctoring events">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}

            {proctoringActivity.data && recentEventsPreview.length === 0 && (
              <EmptyState className="mt-2.5" icon={ShieldAlert} message="No proctoring events logged in this window." />
            )}

            {proctoringActivity.data && recentEventsPreview.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {recentEventsPreview.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-brand-primary">{event.studentName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{event.assessmentTitle}</p>
                    </div>
                    <Badge variant="warning" className="shrink-0 text-[10px]">
                      {PROCTORING_EVENT_LABELS[event.eventType] ?? event.eventType}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </motion.div>

      <Card className="p-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          College-wise Performance
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Average score across every submitted attempt, per college.
        </p>

        {collegePerformance.isPending && (
          <div className="mt-2.5 h-56 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading chart" />
        )}

        {collegePerformance.isError && (
          <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
            Failed to load college performance.
          </div>
        )}

        {collegePerformance.data && !hasCollegeScoreData && (
          <EmptyState
            className="mt-2.5"
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
      </Card>

      <Card className="p-3.5">
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
          <div className="mt-2.5 h-56 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading chart" />
        )}

        {categoryImprovement.isError && (
          <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
            Failed to load category improvement.
          </div>
        )}

        {categoryImprovement.data && categoryImprovement.data.length === 0 && (
          <EmptyState
            className="mt-2.5"
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
      </Card>

      <Card className="p-3.5">
        <h2 className="font-heading text-lg font-semibold text-brand-primary">Organizations</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every college on the platform, joined with its submitted-attempt activity above.
        </p>

        {(colleges.isPending || collegePerformance.isPending) && (
          <div className="mt-2.5 space-y-2" role="status" aria-label="Loading organizations">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {colleges.data && collegePerformance.data && colleges.data.items.length === 0 && (
          <EmptyState className="mt-2.5" icon={Building2} message="No colleges on the platform yet." />
        )}

        {colleges.data && collegePerformance.data && colleges.data.items.length > 0 && (
          <Table className="mt-2.5">
            <TableHeader>
              <TableRow>
                <TableHead>College</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Avg Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colleges.data.items.map((college) => {
                const performance = collegePerformanceByCollegeId.get(college.id)
                return (
                  <TableRow key={college.id}>
                    <TableCell className="font-medium text-brand-primary">{college.name}</TableCell>
                    <TableCell>
                      <Badge variant={college.status === 'active' ? 'live' : 'neutral'}>{college.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{performance?.attemptCount ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {performance?.averageScorePercent === null || performance?.averageScorePercent === undefined
                        ? '—'
                        : `${Math.round(performance.averageScorePercent)}%`}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-3.5">
        <h2 className="font-heading text-lg font-semibold text-brand-primary">Recent Proctoring Events</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Raw event log for the window above — tab switches, fullscreen exits, and similar
          integrity signals. There is no review/approval workflow on these yet, so every event
          shown here is simply "logged," never "pending" or "reviewed."
        </p>

        {proctoringActivity.isPending && (
          <div className="mt-2.5 space-y-2" role="status" aria-label="Loading proctoring events">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {proctoringActivity.isError && (
          <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
            Failed to load proctoring events.
          </div>
        )}

        {proctoringActivity.data && proctoringActivity.data.byType.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {proctoringActivity.data.byType.map((entry) => (
              <Badge key={entry.eventType} variant="warning">
                {PROCTORING_EVENT_LABELS[entry.eventType] ?? entry.eventType} · {entry.count}
              </Badge>
            ))}
          </div>
        )}

        {proctoringActivity.data && proctoringActivity.data.recentEvents.length === 0 && (
          <EmptyState
            className="mt-2.5"
            icon={ShieldAlert}
            message="No proctoring events logged in this window."
          />
        )}

        {proctoringActivity.data && proctoringActivity.data.recentEvents.length > 0 && (
          <Table className="mt-2.5">
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>College</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proctoringActivity.data.recentEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium text-brand-primary">{event.studentName}</TableCell>
                  <TableCell className="max-w-0 text-muted-foreground">
                    <span className="block truncate">{event.assessmentTitle}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning">{PROCTORING_EVENT_LABELS[event.eventType] ?? event.eventType}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{event.collegeName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(event.occurredAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
