import { motion } from 'framer-motion'
import { AlertTriangle, BarChart3, CheckCircle2, Layers } from 'lucide-react'
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
import { Link } from 'react-router-dom'
import { Combobox } from '@/components/Combobox'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAssessments } from '@/features/assessments/api'
import { useMyBatches } from '@/features/organization/api'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { useMyAnalyticsOverview, useMyBatchPerformance, useMyCategoryImprovement, useMyNeedsAttention } from '../api'

const PICKER_PAGE_SIZE = 100
const LIVE_UPCOMING_SHOWN = 6
const NEEDS_ATTENTION_SHOWN = 6
// Below this score, a student's most recent classified attempt is treated
// as "needs attention" — reuses getBatchPerformance's own 'failed'
// classification (already computed server-side against the assessment's
// real passing threshold), not a second, different cutoff invented here.
// Sentinel for "no batchId filter" — mirrors SuperAdminAnalyticsPage's own
// ALL_COLLEGES_VALUE sentinel, same reasoning (no existing picker in this
// codebase has a built-in "all" option).
const ALL_BATCHES_VALUE = '__all__'

// Same brand-accent/green pair Phase 2 already established (BatchPerformancePage's
// HISTOGRAM_COLOR / PASS_COLOR) — no new hues on this page either.
const SCORE_COLOR = '#4F46E5'
const IMPROVEMENT_COLOR = '#16a34a'

function formatPercent(value: number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value
  return Math.round(value)
}

const ASSESSMENT_STATUS_BADGE: Record<string, 'live' | 'scheduled'> = {
  live: 'live',
  scheduled: 'scheduled',
}

// Faculty's own Analytics overview — Phase 3, restyled Phase 2 (design
// system) with three additions this pass: a live+upcoming assessments
// table, a needs-attention list, and a corrected 4-stat row (see the stat
// row's own comment for what replaced "Active Assessments").
//
// Structurally distinct from SuperAdminAnalyticsPage (this same feature's
// Super Admin counterpart), per the Phase 3 differentiation proposal: no
// college dropdown (a batch filter instead, only shown once there's
// actually something to filter), a ranked list instead of an axis bar chart
// for the batch comparison, and a Radar chart instead of grouped bars for
// the category-improvement "skill profile." See AdminAnalyticsPage.tsx's
// sibling, TrainerAnalyticsPage.tsx, for how this is combined with the
// existing Batch Drill-down tab.
export default function FacultyAnalyticsPage() {
  const [selectedValue, setSelectedValue] = useState<string>(ALL_BATCHES_VALUE)
  const batchId = selectedValue === ALL_BATCHES_VALUE ? undefined : selectedValue
  const prefersReducedMotion = usePrefersReducedMotion()

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

  // Live+upcoming assessments — reuses the SAME staff-facing GET /assessments
  // AssessmentListPage.tsx already calls, already Faculty-batch-scoped
  // server-side (resolveAssessmentListBatchScope, pre-dates this phase — see
  // analytics.service.ts's getMyOverview comment for the same reuse). Always
  // spans every batch the caller is assigned to, same "the comparison IS the
  // point" reasoning the batch-performance section below already applies —
  // the page's own batch picker doesn't narrow this table.
  const live = useAssessments({ status: 'live', page: 1, pageSize: LIVE_UPCOMING_SHOWN })
  const scheduled = useAssessments({ status: 'scheduled', page: 1, pageSize: LIVE_UPCOMING_SHOWN })
  const liveAndUpcoming = [...(live.data?.items ?? []), ...(scheduled.data?.items ?? [])]
    .sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? ''))
    .slice(0, LIVE_UPCOMING_SHOWN)
  const isAssessmentsPending = live.isPending || scheduled.isPending
  const isAssessmentsError = live.isError || scheduled.isError

  // Needs attention — "if derivable from existing data" per the Phase 2
  // brief: see api.ts's useMyNeedsAttention for exactly how (fans
  // getBatchPerformance out across every assigned batch, filters to its
  // existing 'failed' classification — no new backend endpoint).
  const { rows: needsAttentionRows, isPending: needsAttentionPending } = useMyNeedsAttention(
    myBatches.data?.items ?? [],
  )

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

  const statVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS
  const containerVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title="My Analytics"
        description="Aggregate performance across the batches you're assigned to."
      >
        {showBatchFilter && (
          <div className="max-w-sm space-y-1.5">
            <label className="text-xs font-medium text-primary" htmlFor="facultyBatchPicker">
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

      </PageHeader>

      {/* Structural language shared with StudentDashboardPage's Parchment &
          Emerald redesign, adapted to Faculty's own real numbers. Now on
          Faculty's own "Slate & Amber" scoped theme (.theme-faculty in
          globals.css, applied on TrainerLayout's root) — faculty-* tokens
          in tailwind.config.js drive the hero gradient/rail; shell-accent
          resolves per-scope automatically (see globals.css's .theme-faculty
          comment), so the corner badge below needed no code change at all.
          Avg Score is the hero: the one number a Faculty
          member most wants at a glance (are my students actually learning),
          rendered as the same bespoke ring StudentDashboardPage uses rather
          than a 4th equal-weight stat card. My Batches/My Students/
          Completion Rate pack tightly beside it instead of floating as
          separate boxes. The Needs Attention count bleeds off the hero's
          own corner — real data already fetched below for that section, not
          a decorative badge — the deliberate grid-break. Live & Upcoming
          moves up beside the hero (same pairing StudentDashboardPage uses:
          hero + already-fetched adjacent content, not hero + filler). */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="grid grid-cols-1 gap-2.5 lg:grid-cols-5"
      >
        <motion.div
          variants={statVariants}
          className="relative overflow-visible rounded-xl bg-gradient-to-br from-faculty-gradient-from to-faculty-gradient-to p-4 text-white shadow-sm lg:col-span-3"
        >
          {!needsAttentionPending && needsAttentionRows.length > 0 && (
            <div
              className="absolute -top-3 -right-3 flex size-14 items-center justify-center rounded-full border-4 border-background bg-shell-accent text-white shadow-md"
              title={`${needsAttentionRows.length} student${needsAttentionRows.length === 1 ? '' : 's'} need attention`}
            >
              <AlertTriangle className="size-6" />
            </div>
          )}

          <p className="text-xs text-white/70">Aggregate performance</p>
          <h1 className="mt-0.5 font-heading text-xl font-semibold">Your Batches</h1>

          <div className="mt-3 flex items-center gap-4">
            <div className="relative shrink-0">
              <ScoreRing
                percent={overview.data ? formatPercent(overview.data.averageScorePercent) ?? null : null}
                size={100}
                strokeWidth={9}
                trackClassName="stroke-white/20"
                progressClassName="stroke-white"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {!overview.data ? (
                  <span className="inline-block h-6 w-10 animate-pulse rounded bg-white/20" />
                ) : (
                  <span className="font-heading text-2xl leading-none font-bold">
                    {overview.data.averageScorePercent !== null
                      ? `${formatPercent(overview.data.averageScorePercent)}%`
                      : '—'}
                  </span>
                )}
                <span className="mt-1 font-mono text-[9px] tracking-wide text-white/70 uppercase">avg score</span>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-1.5 border-l border-white/15 pl-4">
              <div>
                <p className="font-mono text-xl leading-none font-semibold">
                  {overview.data ? (
                    overview.data.totalBatches
                  ) : (
                    <span className="inline-block h-5 w-6 animate-pulse rounded bg-white/20 align-middle" />
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-white/70">My Batches</p>
              </div>
              <div>
                <p className="font-mono text-xl leading-none font-semibold">
                  {overview.data ? (
                    overview.data.totalStudents
                  ) : (
                    <span className="inline-block h-5 w-8 animate-pulse rounded bg-white/20 align-middle" />
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-white/70">My Students</p>
              </div>
              <div>
                <p className="font-mono text-xl leading-none font-semibold">
                  {overview.data ? (
                    overview.data.completionRate !== null ? (
                      `${formatPercent(overview.data.completionRate * 100)}%`
                    ) : (
                      '—'
                    )
                  ) : (
                    <span className="inline-block h-5 w-8 animate-pulse rounded bg-white/20 align-middle" />
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-white/70">Completion Rate</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={statVariants} className="lg:col-span-2">
          <Card className="h-full p-3.5">
            <h2 className="font-heading text-sm font-semibold text-primary">Live &amp; Upcoming</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Across every batch you&apos;re assigned to.</p>

            {isAssessmentsPending && (
              <div className="mt-2.5 space-y-2" role="status" aria-label="Loading assessments">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}

            {isAssessmentsError && (
              <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
                Failed to load assessments.
              </div>
            )}

            {!isAssessmentsPending && !isAssessmentsError && liveAndUpcoming.length === 0 && (
              <EmptyState className="mt-2.5" message="Nothing live or scheduled right now." />
            )}

            {!isAssessmentsPending && !isAssessmentsError && liveAndUpcoming.length > 0 && (
              <Table className="mt-2.5">
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Starts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveAndUpcoming.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell className="max-w-0 font-medium text-primary">
                        <Link to={`/trainer/assessments/${assessment.id}/edit`} className="block truncate hover:underline">
                          {assessment.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">{assessment.testCategory}</TableCell>
                      <TableCell>
                        <Badge variant={ASSESSMENT_STATUS_BADGE[assessment.status] ?? 'neutral'}>
                          {assessment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {assessment.startAt ? new Date(assessment.startAt).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Batch comparison — ranked list with inline proportional bars, same
          widget shape as StudentListPage.tsx's "Students by college" (name +
          thin bar + number), not an axis BarChart. Always compares every
          assigned batch regardless of the picker above — the comparison IS
          the point, same reasoning SuperAdminAnalyticsPage's own
          college-comparison chart never takes a collegeId. */}
      <Card className="p-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          My Batches — Performance
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Average score across every submitted attempt, per batch.
        </p>

        {batchPerformance.isPending && (
          <div className="mt-2.5 h-24 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading" />
        )}

        {batchPerformance.isError && (
          <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
            Failed to load batch performance.
          </div>
        )}

        {batchPerformance.data && batchPerformance.data.length === 0 && (
          <EmptyState className="mt-2.5" icon={Layers} message="You have no assigned batches yet." />
        )}

        {batchPerformance.data && batchPerformance.data.length > 0 && !hasBatchScoreData && (
          <EmptyState
            className="mt-2.5"
            icon={BarChart3}
            message="No submitted attempts yet across your batches — this will populate once students start completing assessments."
          />
        )}

        {batchPerformance.data && hasBatchScoreData && (
          <div className="mt-2.5 space-y-2">
            {batchPerformance.data.map((row) => (
              <div key={row.batchId} className="flex items-center gap-2.5">
                <p className="w-36 shrink-0 truncate text-sm text-foreground" title={row.batchName}>
                  {row.batchName}
                </p>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-shell-accent"
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
      </Card>

      <Card className="p-3.5">
        <h2 className="font-heading text-lg font-semibold text-primary">Needs Attention</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Students whose best attempt on their batch&apos;s most recent assessment fell below the passing
          threshold.
        </p>

        {needsAttentionPending && (
          <div className="mt-2.5 space-y-2" role="status" aria-label="Loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {!needsAttentionPending && needsAttentionRows.length === 0 && (
          <EmptyState
            className="mt-2.5"
            icon={CheckCircle2}
            message="No students below the passing threshold on their most recent assessment right now."
          />
        )}

        {!needsAttentionPending && needsAttentionRows.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {needsAttentionRows.slice(0, NEEDS_ATTENTION_SHOWN).map((row) => (
              <div
                key={`${row.batchId}-${row.studentId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlertTriangle className="size-4 shrink-0 text-status-danger-fg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">{row.fullName}</p>
                    <p className="text-xs text-muted-foreground">{row.batchName}</p>
                  </div>
                </div>
                <Badge variant="danger">{row.totalScore ?? '—'} pts</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Skill profile — Radar (first vs. latest attempt, one axis per MCQ
          category), not a grouped bar chart. */}
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
          <div className="mt-2.5 h-64 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading" />
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
      </Card>
    </div>
  )
}
