import { motion } from 'framer-motion'
import { Award, ChevronRight, ClipboardList, Crown, Flame, Medal, Rocket, Sparkles, Star, Trophy, Zap } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { attemptTimestamp } from '@/features/reports/components/PerformanceAnalyticsSection'
import { useLeaderboard, useMyAttempts } from '@/features/reports/api'
import type { LeaderboardTier, MyAttemptSummary } from '@/features/reports/types'
import { useMyDashboardProfile } from '@/features/students/api'
import { useCountUp } from '@/hooks/useCountUp'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { CARD_HOVER_LIFT, cn } from '@/lib/utils'
import { useAvailableAssessments } from '../api'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { AvailableAssessment, TestCategory } from '../types'

const TIER_ICON: Record<LeaderboardTier, ComponentType<{ className?: string }>> = {
  platinum: Crown,
  gold: Trophy,
  silver: Medal,
  bronze: Award,
}

// Gamified hero title — same "band -> {title, icon}" shape TIER_ICON above
// already uses, just keyed by a computed band instead of a raw enum value
// since there's no server-side "title" field to look up. Bands are ordered
// highest -> lowest and the first match wins. Deliberately invented, mildly
// playful titles (never the literal names this task's own spec called out
// as off-limits) — every band stays positive, including the lowest one,
// since this sits inside the hero card right next to the student's own name
// and shouldn't read as a put-down.
interface GamifiedTitle {
  title: string
  Icon: ComponentType<{ className?: string }>
}

function getGamifiedTitle(
  avgScore: number | null,
  tier: LeaderboardTier | undefined,
  rank: number | undefined,
): GamifiedTitle {
  if (avgScore === null) {
    return { title: 'Rising Starter', Icon: Sparkles }
  }
  const isTopStanding = tier === 'platinum' || tier === 'gold' || (rank !== undefined && rank <= 3)
  if (avgScore >= 85 && isTopStanding) {
    return { title: 'Score Sprinter', Icon: Trophy }
  }
  if (avgScore >= 85) {
    return { title: 'Quiz Champion', Icon: Star }
  }
  if (avgScore >= 65) {
    return { title: 'Sharp Achiever', Icon: Zap }
  }
  if (avgScore >= 40) {
    return { title: 'Rising Solver', Icon: Flame }
  }
  return { title: 'Steady Climber', Icon: Rocket }
}

// --- Skills radar (item 5) ---
//
// KNOWN APPROXIMATION, flagged explicitly per this phase's own instructions:
// this schema has question_categories/question_topics on `questions`, but
// there is NO existing endpoint (checked backend/src/modules/reports AND
// analytics) aggregating a student's per-category accuracy against their
// batch's median — and the real category data that DOES exist is far too
// sparse to back a 6-axis chart honestly (this dev DB currently has exactly
// 3 question_categories rows, two of them with 6 and 2 questions total and
// the third with zero). Adding a real endpoint would still cap out at 3
// mostly-empty axes, worse than the "at least 6 axes" this section needs —
// so rather than build a new aggregation on top of data too thin to support
// it, OR literally fabricate axes like "Speed"/"Knowledge Awareness" with
// zero backing signal, every axis below is derived from real data already
// fetched on this page (GET /reports/my-attempts, GET /reports/leaderboard)
// via an honest, if approximate, proxy:
//   - Aptitude/Coding/Psychometric/Versatility: this student's own average
//     scorePercent, bucketed by the attempt's testCategory (mcq/coding/
//     psychometric/mixed) — a real number, just a coarser slice than a true
//     per-topic skill breakdown.
//   - Consistency: a real statistic (100 minus a scaled standard deviation
//     of this student's own scorePercents) — not a proxy, an actual
//     computed measure of how steady their scores are.
//   - Momentum: a real statistic comparing this student's most recent
//     attempts' average against their all-time average, rescaled to a 0-100
//     band centered on 50 — again computed, not invented.
// "Batch Median" is the SAME flat number (the median of every batch
// member's overall averageScorePercent, from the leaderboard already
// fetched here) repeated across all 6 axes — there is no per-category batch
// breakdown to plot instead, so this is a deliberate simplification, not a
// per-skill batch comparison. Both are called out again inline below and in
// the chart's own caption text, not just here.
const SKILLS_RADAR_AXES = ['Aptitude', 'Coding', 'Psychometric', 'Versatility', 'Consistency', 'Momentum'] as const
type SkillsRadarAxis = (typeof SKILLS_RADAR_AXES)[number]

const CATEGORY_AXIS: Record<TestCategory, SkillsRadarAxis> = {
  mcq: 'Aptitude',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Versatility',
}

interface SkillsRadarPoint {
  axis: SkillsRadarAxis
  you: number
  batchMedian: number
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length === 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function buildSkillsRadarData(
  scoredAttempts: (MyAttemptSummary & { scorePercent: number })[],
  leaderboardAverages: number[],
): SkillsRadarPoint[] {
  const overallAvg = average(scoredAttempts.map((a) => a.scorePercent)) ?? 0
  const batchMedian = median(leaderboardAverages) ?? 0

  const categoryAvg = (category: TestCategory) =>
    average(scoredAttempts.filter((a) => a.testCategory === category).map((a) => a.scorePercent)) ?? 0

  const scores = scoredAttempts.map((a) => a.scorePercent)
  // A 25-point standard deviation is already a wildly inconsistent spread on
  // a 0-100 scale — scaling by 4 maps that to the 0 floor, clamped so a
  // single attempt (stdev 0, meaningless as "consistency") doesn't
  // misleadingly read as a perfect 100 either.
  const consistency =
    scores.length >= 2 ? Math.max(0, Math.min(100, 100 - standardDeviation(scores, overallAvg) * 4)) : 0

  const recentAvg =
    average(
      [...scoredAttempts]
        .sort((a, b) => attemptTimestamp(b) - attemptTimestamp(a))
        .slice(0, 3)
        .map((a) => a.scorePercent),
    ) ?? overallAvg
  const momentum = Math.max(0, Math.min(100, 50 + (recentAvg - overallAvg)))

  return SKILLS_RADAR_AXES.map((axis) => {
    const you =
      axis === 'Consistency'
        ? consistency
        : axis === 'Momentum'
          ? momentum
          : categoryAvg((Object.keys(CATEGORY_AXIS) as TestCategory[]).find((c) => CATEGORY_AXIS[c] === axis)!)
    return { axis, you: Math.round(you), batchMedian: Math.round(batchMedian) }
  })
}

// Batch Median is flat across every axis (see the big comment above), so
// ranking axes by (you - batchMedian) is mathematically identical to
// ranking by raw `you` value — the subtraction is kept anyway because it's
// the honest framing ("relative to the median", per this section's spec)
// even though the flat median makes it degenerate to the same ordering.
function buildSkillInsights(axes: SkillsRadarPoint[]): string[] {
  const ranked = [...axes].sort((a, b) => b.you - b.batchMedian - (a.you - a.batchMedian))
  const strongest = ranked[0]
  const weakest = ranked[ranked.length - 1]
  const momentum = axes.find((a) => a.axis === 'Momentum')

  const insights: string[] = []

  if (strongest && strongest.you > strongest.batchMedian) {
    insights.push(
      `${strongest.axis} is your strongest area — ${strongest.you - strongest.batchMedian} points above your batch median. Keep it up!`,
    )
  } else {
    insights.push("You're tracking right at your batch's median across the board — a great base to build from.")
  }

  if (weakest && weakest.you < weakest.batchMedian) {
    insights.push(
      `${weakest.axis} is your lowest area right now — a little focused practice here should move it the most.`,
    )
  } else {
    insights.push("You're at or above the batch median in every area — great all-round consistency.")
  }

  if (momentum) {
    if (momentum.you >= 55) {
      insights.push('Your most recent attempts are trending above your own average — the momentum is with you.')
    } else if (momentum.you <= 45) {
      insights.push('Your last few attempts dipped a bit below your average — worth a quick review before the next one.')
    } else {
      insights.push("Your scores have been steady lately — no big swings up or down.")
    }
  }

  return insights
}

// Themed Tooltip content — same bg-popover/text-popover-foreground/
// border-border shape every other Recharts tooltip in this codebase already
// uses (see e.g. FacultyAnalyticsPage.tsx's own RadarTooltipContent), a
// fresh small copy rather than an import since that one isn't exported.
function SkillsRadarTooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string }[]
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-popover-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
          {entry.name}: {Math.round(entry.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

// Same "dashboard glance, not full history" cap PerformanceAnalyticsSection.tsx
// already established for GET /reports/my-attempts (Tests Completed/Avg
// Score below would undercount past this many completed attempts — an
// accepted, already-precedented limitation, not a new gap).
const ATTEMPTS_FETCH_SIZE = 50
// Enough available (scheduled/live) assessments to reliably find
// UPCOMING_SHOWN not-yet-completed ones, without fetching the whole list.
const UPCOMING_FETCH_SIZE = 20
const UPCOMING_SHOWN = 3
const RECENT_RESULTS_SHOWN = 3

const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

// Soft & Organic phase — replaces the old table row with the mockup's
// "Upcoming Assessments" card treatment (approved 3-mockup review): a big
// rounded card, a soft icon chip, and a pill-shaped CTA button, in place of
// a dense table row. This is the paradigm case the rollout brief calls out
// by name — a small (UPCOMING_SHOWN-capped), dashboard-glance,
// one-CTA-per-row list, exactly the shape this pattern fits, unlike a real
// management table (AssessmentListPage's dense staff-facing listing stays a
// table — see that file's own comment on why real tabular density is kept
// there).
function UpcomingAssessmentCard({ assessment }: { assessment: AvailableAssessment }) {
  const buttonState = getAttemptButtonState(assessment)
  const isScheduled = buttonState.kind === 'scheduled'
  return (
    // Widened rule: the row itself has no onClick, but its "Open" button
    // leads to the assessment — that's enough to qualify as interactive now
    // (previously excluded when only a whole-row click counted).
    <div className={cn('flex items-center gap-3 rounded-2xl bg-muted/40 p-3', CARD_HOVER_LIFT)}>
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          isScheduled ? 'bg-accent-indigo-bg text-accent-indigo-fg' : 'bg-status-success-bg text-status-success-fg',
        )}
      >
        <ClipboardList className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-primary">{assessment.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {TEST_CATEGORY_LABELS[assessment.testCategory]} ·{' '}
          {isScheduled ? 'Opens soon' : ATTEMPT_BUTTON_LABELS[buttonState.kind]}
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0 rounded-full">
        <Link to={`/student/assessments/${assessment.id}`}>Open</Link>
      </Button>
    </div>
  )
}

// Soft & Organic phase — a leading circular score chip (bigger, more visual
// weight) replaces the old trailing text Badge; same exact pass/fail/pending
// semantic mapping (status-success/danger/neutral tokens) as before, just
// reshaped, and the whole row loses its hard border for a shadow-based card
// matching the new Card language.
const RESULT_SCORE_CLASS = {
  pass: 'bg-status-success-bg text-status-success-fg',
  fail: 'bg-status-danger-bg text-status-danger-fg',
  pending: 'bg-status-neutral-bg text-status-neutral-fg',
} as const

function RecentResultCard({ attempt }: { attempt: { id: string; assessmentTitle: string; scorePercent: number | null; submissionTime: string | null } }) {
  const tone = attempt.scorePercent === null ? 'pending' : attempt.scorePercent >= 40 ? 'pass' : 'fail'
  return (
    <Link
      to={`/student/attempts/${attempt.id}/submitted`}
      className={cn(
        'flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm outline-none focus-visible:-translate-y-1 focus-visible:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        CARD_HOVER_LIFT,
      )}
    >
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          RESULT_SCORE_CLASS[tone],
        )}
      >
        {attempt.scorePercent === null ? '—' : `${Math.round(attempt.scorePercent)}%`}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-primary">{attempt.assessmentTitle}</p>
        {attempt.submissionTime && (
          <p className="text-xs text-muted-foreground">
            {new Date(attempt.submissionTime).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </p>
        )}
      </div>
    </Link>
  )
}

// The new /student index (student Dashboard phase) — StudentAssessmentsPage.tsx
// (the assessments grid) moved to /student/assessments; this is the new
// landing page, same "dashboard-first" convention TrainerLayout's nav
// reorder just established for Faculty. Every number here is reused from an
// endpoint that already exists (or, for college/batch name, a small new
// self-service one — see students/api.ts's useMyDashboardProfile for
// exactly why that was genuinely missing before this):
//   - name/college/batch:  GET /students/me (new, self-service, see above)
//   - Tests Completed/Avg: GET /reports/my-attempts — same 'submitted'-only
//                          filter and scorePercent averaging
//                          PerformanceAnalyticsSection.tsx already
//                          established, not a new calculation
//   - Batch Rank/Tier:     GET /reports/leaderboard, same self-scoped
//                          batch-wide ranking LeaderboardSection.tsx uses —
//                          Tier reuses that component's own exported
//                          TierBadge rather than a second badge
//   - Upcoming Assessments: GET /assessments/available, reusing
//                          attemptButtonState.ts's getAttemptButtonState —
//                          the SAME Start/Continue/Retake/Completed logic
//                          the assessments grid itself uses, so "not yet
//                          completed" here can never disagree with what
//                          that grid would show for the same assessment
//   - Recent Results:      the SAME useMyAttempts fetch already powering
//                          Tests Completed/Avg above, just the most recent
//                          few submitted ones — no second request.
//
// 4th stat slot (Phase 2 correction): "Attendance" was dropped — the audit
// found no per-student attendance data exists anywhere in this schema, and
// the only proxy (training_sessions.status) is session-level, not personal
// presence, so labeling a stat "Attendance" from it would be a mislabel.
// KEEPING Batch Tier here rather than swapping in "total questions
// attempted": Tier is real, already-correct data from the SAME leaderboard
// call Batch Rank already uses (zero new backend work), and it's a
// categorical complement to the numeric rank right next to it, not a
// duplicate. "Total questions attempted" would need a genuinely new
// backend field (MyAttemptSummary carries no per-attempt question count
// today) for a number that tells a student less than Tests Completed
// already does — Tier is the better card for the same zero-cost budget.
export default function StudentDashboardPage() {
  const profile = useMyDashboardProfile()
  const attempts = useMyAttempts({ page: 1, pageSize: ATTEMPTS_FETCH_SIZE })
  const leaderboard = useLeaderboard()
  const available = useAvailableAssessments({ page: 1, pageSize: UPCOMING_FETCH_SIZE })
  const prefersReducedMotion = usePrefersReducedMotion()

  const submittedAttempts = (attempts.data?.items ?? []).filter((attempt) => attempt.status === 'submitted')
  const testsCompleted = submittedAttempts.length
  const scorePercents = submittedAttempts
    .map((attempt) => attempt.scorePercent)
    .filter((value): value is number => value !== null)
  const avgScorePercent =
    scorePercents.length > 0
      ? scorePercents.reduce((sum, value) => sum + value, 0) / scorePercents.length
      : null

  const selfEntry = leaderboard.data?.entries.find((entry) => entry.isSelf)

  const upcoming = (available.data?.items ?? [])
    .filter((assessment) => getAttemptButtonState(assessment).kind !== 'completed')
    .slice(0, UPCOMING_SHOWN)

  const recentResults = [...submittedAttempts]
    .sort((a, b) => (b.submissionTime ?? '').localeCompare(a.submissionTime ?? ''))
    .slice(0, RECENT_RESULTS_SHOWN)

  const roundedAvg = avgScorePercent !== null ? Math.round(avgScorePercent) : null
  const displayAvg = useCountUp(attempts.isPending ? undefined : roundedAvg)
  const displayTests = useCountUp(attempts.isPending ? undefined : testsCompleted)
  const TierIcon = selfEntry?.tier ? TIER_ICON[selfEntry.tier] : null

  // Item 4 — gamified hero title, ready only once both its inputs
  // (avgScorePercent, selfEntry) have actually loaded, same "don't render
  // real content off half-loaded data" rule the rest of this hero already
  // follows for roundedAvg/testsCompleted above.
  const gamifiedReady = !attempts.isPending && !leaderboard.isPending
  const gamifiedTitle = getGamifiedTitle(roundedAvg, selfEntry?.tier, selfEntry?.rank)

  // Item 5 — skills radar, built once both its inputs have loaded (see the
  // big KNOWN APPROXIMATION comment above buildSkillsRadarData for what
  // this is and isn't measuring).
  const skillsReady = !attempts.isPending && !leaderboard.isPending
  const skillsScoredAttempts = submittedAttempts.filter(
    (attempt): attempt is MyAttemptSummary & { scorePercent: number } => attempt.scorePercent !== null,
  )
  const skillsRadarData = buildSkillsRadarData(
    skillsScoredAttempts,
    (leaderboard.data?.entries ?? []).map((entry) => entry.averageScorePercent),
  )
  const skillInsights = buildSkillInsights(skillsRadarData)

  const statVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS
  const containerVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS

  return (
    <div className="space-y-3 p-4">
      {/* Direction chosen for the real build: A's asymmetric hero
          (identity + standing merged into one dominant panel, not a flat
          banner sitting above three equal-weight cards) as the shell, with
          C's custom ring motif standing in for a bare typographic number —
          the ring gives Avg Score real display-scale weight (B's principle)
          while staying a bespoke visual rather than plain digits floating in
          space. The tier medallion bleeding off the hero's own corner is
          the one deliberate grid-break, reused from mockup A. Falls back to
          a plain trophy outline when unranked so the overlap treatment
          stays visible even before a student has a tier yet — see its own
          comment below for why that matters. */}
      <motion.div initial="hidden" animate="show" variants={containerVariants} className="grid grid-cols-1 gap-2.5 lg:grid-cols-5">
        <motion.div
          variants={statVariants}
          className="relative overflow-visible rounded-4xl bg-linear-to-br from-hero-gradient-from to-hero-gradient-to p-4 text-white shadow-md lg:col-span-3"
        >
          <div
            className={cn(
              'absolute -top-3 -right-3 flex size-14 items-center justify-center rounded-full border-4 border-background shadow-md',
              TierIcon ? 'bg-accent-amber-bg text-accent-amber-fg' : 'bg-muted text-muted-foreground',
            )}
            title={selfEntry?.tier ? `${selfEntry.tier} tier` : 'Not yet ranked'}
          >
            {TierIcon ? <TierIcon className="size-6" /> : <Trophy className="size-5" />}
          </div>

          {/* Item 5 — outer row splits the hero into a left column (all the
              existing name/college + ScoreRing/stats content, unchanged
              other than being nested one level deeper) and a right column
              holding just the gamified title. items-center on THIS row
              vertically centers the (much shorter) right column against the
              left column's own full stacked height — middle-right, not
              top-right, and never near the top-right tier medallion above
              (that medallion is an absolutely-positioned sibling of this
              row, so it's completely unaffected by this restructure). */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white/70">
                {profile.isPending ? (
                  <span className="inline-block h-3.5 w-32 animate-pulse rounded bg-white/20 align-middle" />
                ) : (
                  [profile.data?.collegeName, profile.data?.batchName].filter(Boolean).join(' · ')
                )}
              </p>
              <h1 className="mt-0.5 truncate font-heading text-xl font-semibold">
                {profile.isPending ? (
                  <span className="inline-block h-6 w-40 animate-pulse rounded bg-white/20 align-middle" />
                ) : (
                  (profile.data?.fullName ?? 'Student')
                )}
              </h1>

              <div className="mt-3 flex items-center gap-4">
                <div className="relative shrink-0">
                  <ScoreRing
                    percent={attempts.isPending ? null : roundedAvg}
                    size={100}
                    strokeWidth={9}
                    trackClassName="stroke-white/20"
                    progressClassName="stroke-white"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {attempts.isPending ? (
                      <span className="inline-block h-6 w-10 animate-pulse rounded bg-white/20" />
                    ) : (
                      <span className="font-heading text-2xl leading-none font-bold">
                        {roundedAvg !== null ? `${displayAvg}%` : '—'}
                      </span>
                    )}
                    <span className="mt-1 font-mono text-[9px] tracking-wide text-white/70 uppercase">avg score</span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-center gap-2 border-l border-white/15 pl-4">
                  <div>
                    <p className="font-mono text-2xl leading-none font-semibold">
                      {attempts.isPending ? (
                        <span className="inline-block h-6 w-8 animate-pulse rounded bg-white/20 align-middle" />
                      ) : (
                        displayTests
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-white/70">Tests Completed</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl leading-none font-semibold">
                      {leaderboard.isPending ? (
                        <span className="inline-block h-6 w-10 animate-pulse rounded bg-white/20 align-middle" />
                      ) : selfEntry?.rank ? (
                        `#${selfEntry.rank}`
                      ) : (
                        '—'
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-white/70 capitalize">
                      {selfEntry?.tier ? `Batch Rank · ${selfEntry.tier}` : 'Batch Rank'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* max-w caps this column so it shrinks/wraps its 2-3 word title
                across up to two lines on a narrow card rather than forcing
                the left column (which needs the room far more) to shrink,
                or overflowing past the card's own right padding. */}
            <div className="flex max-w-[40%] shrink-0 flex-col items-end gap-1 text-right">
              {gamifiedReady ? (
                <>
                  <gamifiedTitle.Icon className="size-8 text-white" />
                  <p className="font-heading text-xl leading-tight font-bold text-white sm:text-2xl">
                    {gamifiedTitle.title}
                  </p>
                </>
              ) : (
                <>
                  <span className="inline-block size-8 animate-pulse rounded-full bg-white/20" />
                  <span className="inline-block h-6 w-24 animate-pulse rounded bg-white/20" />
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Real Upcoming Assessments table (unchanged rows/columns) moved up
            beside the hero instead of sitting in its own row below it — the
            hero and this table are now ONE dense row, not hero-then-cards
            underneath it. */}
        <motion.div variants={statVariants} className="lg:col-span-2">
          <Card className="from-primary/8 h-full p-3.5">
            <div className="flex items-center justify-between gap-2.5">
              <div>
                <h2 className="font-heading text-sm font-semibold text-primary">Upcoming Assessments</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Not yet completed.</p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/student/assessments">View more</Link>
              </Button>
            </div>

            {available.isPending && (
              <div className="mt-2.5 space-y-2" role="status" aria-label="Loading upcoming assessments">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}

            {available.isError && (
              <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
                {available.error instanceof ApiError
                  ? available.error.message
                  : 'Failed to load your assessments. Please try again.'}
              </div>
            )}

            {available.data && upcoming.length === 0 && (
              <EmptyState
                className="mt-2.5"
                message="Nothing left to complete right now — check back once a new assessment goes live."
              />
            )}

            {available.data && upcoming.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {upcoming.map((assessment) => (
                  <UpcomingAssessmentCard key={assessment.id} assessment={assessment} />
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Item 5 — skills radar, its own full-width Card between the hero
          row and Recent Results. See buildSkillsRadarData's own big comment
          above for exactly what's real vs. approximated here. */}
      <Card className="p-3.5">
        <h2 className="font-heading text-sm font-semibold text-foreground">Skills Radar</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How your recent performance compares to your batch, across a few broad skill areas.
        </p>

        {(attempts.isPending || leaderboard.isPending) && (
          <div className="mt-2.5 h-64 animate-pulse rounded-lg bg-muted" role="status" aria-label="Loading skills radar" />
        )}

        {(attempts.isError || leaderboard.isError) && (
          <div className="mt-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
            {attempts.error instanceof ApiError
              ? attempts.error.message
              : leaderboard.error instanceof ApiError
                ? leaderboard.error.message
                : 'Failed to load your skills radar. Please try again.'}
          </div>
        )}

        {skillsReady && !attempts.isError && !leaderboard.isError && skillsScoredAttempts.length === 0 && (
          <EmptyState
            className="mt-2.5"
            message="Complete an assessment to see your skills radar — it'll populate here once you have a graded attempt."
          />
        )}

        {skillsReady && !attempts.isError && !leaderboard.isError && skillsScoredAttempts.length > 0 && (
          <div className="mt-2.5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={skillsRadarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <PolarRadiusAxis
                    domain={[0, 100]}
                    tickCount={5}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  {/* Blue/green pair (reusing the same --accent-info-fg/
                      --chart-score-line tokens the Performance/Score History
                      recolor already introduced) instead of the old --primary/
                      --accent-indigo-fg orange/brown pair — those two sat too
                      close to each other and to this Obsidian & Ember theme's
                      warm card backgrounds to read as clearly distinct at a
                      glance in either light or dark mode. Both tokens are
                      independently contrast-checked against both card
                      backgrounds already (see globals.css's own comments on
                      each). */}
                  <Radar
                    name="You"
                    dataKey="you"
                    stroke="var(--chart-score-line)"
                    fill="var(--chart-score-line)"
                    fillOpacity={0.3}
                  />
                  <Radar
                    name="Batch Median"
                    dataKey="batchMedian"
                    stroke="var(--accent-info-fg)"
                    fill="var(--accent-info-fg)"
                    fillOpacity={0.25}
                  />
                  {/* wrapperStyle padding — the legend row used to sit flush
                      against the "Versatility" axis label with no breathing
                      room. Legend swatches automatically follow each Radar's
                      own `stroke` color above, so no separate swatch-color
                      prop is needed. */}
                  <Legend wrapperStyle={{ paddingTop: 12 }} />
                  <Tooltip content={(props) => <SkillsRadarTooltipContent {...props} />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Right column — the 3 insight points, each with a small
                blue chevron marker (not a plain dot) instead of no marker at
                all, then the explanatory caveat paragraph directly beneath
                them. Both moved out from under the chart on the left, which
                now holds only the RadarChart itself. */}
            <div className="flex flex-col justify-center gap-2.5">
              {skillInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-2xl bg-muted/40 p-3 text-sm text-foreground">
                  <ChevronRight
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent-info-fg)]"
                    aria-hidden="true"
                  />
                  <span>{insight}</span>
                </div>
              ))}

              {/* Explicit caveat per this section's own spec — see the
                  KNOWN APPROXIMATION comment on buildSkillsRadarData for
                  the full reasoning, surfaced here too rather than only in
                  a code comment nobody using the page would ever see. */}
              <p className="text-[11px] text-muted-foreground">
                Aptitude/Coding/Psychometric/Versatility are your average scores by test type; Consistency and
                Momentum are computed from your own attempt history. Batch Median is your batch's overall median
                score shown as a flat reference line — a true per-skill breakdown isn't tracked yet.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Recent Results now runs full width as a 3-up grid instead of a
          narrow single-column list wedged into the old 3-card row's leftover
          third — with RECENT_RESULTS_SHOWN capped at 3, this fills exactly
          one dense row with no leftover column instead of stacking tall. */}
      <Card className="from-primary/8 p-3.5">
        <div className="flex items-center justify-between gap-2.5">
          <div>
            <h2 className="font-heading text-sm font-semibold text-primary">Recent Results</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Your most recently submitted attempts.</p>
          </div>
          <Link to="/student/attempts" className="shrink-0 text-[11px] font-medium text-primary hover:underline">
            View all →
          </Link>
        </div>

        {attempts.isPending && (
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading recent results">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {attempts.data && recentResults.length === 0 && (
          <EmptyState className="mt-2.5" message="No submitted attempts yet." />
        )}

        {attempts.data && recentResults.length > 0 && (
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentResults.map((attempt) => (
              <RecentResultCard key={attempt.id} attempt={attempt} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
