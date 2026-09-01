import { motion } from 'framer-motion'
import { Award, Crown, Medal, Trophy } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScoreRing } from '@/components/ui/ScoreRing'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLeaderboard, useMyAttempts } from '@/features/reports/api'
import type { LeaderboardTier } from '@/features/reports/types'
import { useMyDashboardProfile } from '@/features/students/api'
import { useCountUp } from '@/hooks/useCountUp'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAvailableAssessments } from '../api'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { AvailableAssessment, TestCategory } from '../types'

const TIER_ICON: Record<LeaderboardTier, ComponentType<{ className?: string }>> = {
  platinum: Crown,
  gold: Trophy,
  silver: Medal,
  bronze: Award,
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

function UpcomingAssessmentRow({ assessment }: { assessment: AvailableAssessment }) {
  const buttonState = getAttemptButtonState(assessment)
  const isScheduled = buttonState.kind === 'scheduled'
  return (
    <TableRow>
      <TableCell className="max-w-0 font-medium text-primary">
        <span className="block truncate">{assessment.title}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {TEST_CATEGORY_LABELS[assessment.testCategory]}
      </TableCell>
      <TableCell>
        <Badge variant={isScheduled ? 'scheduled' : 'live'}>
          {isScheduled ? 'Opens soon' : ATTEMPT_BUTTON_LABELS[buttonState.kind]}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild variant="outline" size="sm">
          <Link to={`/student/assessments/${assessment.id}`}>Open</Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}

function RecentResultRow({ attempt }: { attempt: { id: string; assessmentTitle: string; scorePercent: number | null; submissionTime: string | null } }) {
  return (
    <Link
      to={`/student/attempts/${attempt.id}/submitted`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 outline-none transition-colors hover:border-shell-accent/50 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
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
      <Badge
        variant={
          attempt.scorePercent === null ? 'neutral' : attempt.scorePercent >= 40 ? 'success' : 'danger'
        }
      >
        {attempt.scorePercent === null ? 'Pending' : `${Math.round(attempt.scorePercent)}%`}
      </Badge>
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
          className="relative overflow-visible rounded-xl bg-gradient-to-br from-student-gradient-from to-student-gradient-to p-4 text-white shadow-sm lg:col-span-3"
        >
          <div
            className={cn(
              'absolute -top-3 -right-3 flex size-14 items-center justify-center rounded-full border-4 border-background shadow-md',
              TierIcon ? 'bg-student-accent text-student-accent-foreground' : 'bg-muted text-muted-foreground',
            )}
            title={selfEntry?.tier ? `${selfEntry.tier} tier` : 'Not yet ranked'}
          >
            {TierIcon ? <TierIcon className="size-6" /> : <Trophy className="size-5" />}
          </div>

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
        </motion.div>

        {/* Real Upcoming Assessments table (unchanged rows/columns) moved up
            beside the hero instead of sitting in its own row below it — the
            hero and this table are now ONE dense row, not hero-then-cards
            underneath it. */}
        <motion.div variants={statVariants} className="lg:col-span-2">
          <Card className="from-student-primary/8 h-full p-3.5">
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
              <Table className="mt-2.5">
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map((assessment) => (
                    <UpcomingAssessmentRow key={assessment.id} assessment={assessment} />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Recent Results now runs full width as a 3-up grid instead of a
          narrow single-column list wedged into the old 3-card row's leftover
          third — with RECENT_RESULTS_SHOWN capped at 3, this fills exactly
          one dense row with no leftover column instead of stacking tall. */}
      <Card className="from-student-primary/8 p-3.5">
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
              <RecentResultRow key={attempt.id} attempt={attempt} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
