import { motion } from 'framer-motion'
import { CheckCircle2, Medal, Target, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLeaderboard, useMyAttempts } from '@/features/reports/api'
import { TierBadge } from '@/features/reports/components/LeaderboardSection'
import type { LeaderboardTier } from '@/features/reports/types'
import { useMyDashboardProfile } from '@/features/students/api'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { useAvailableAssessments } from '../api'
import { ATTEMPT_BUTTON_LABELS, getAttemptButtonState } from '../attemptButtonState'
import type { AvailableAssessment, TestCategory } from '../types'

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

// Bespoke, not a plain StatCard: Tier is a categorical badge
// (platinum/gold/silver/bronze via TierBadge), not the numeric value
// StatCard's `value` prop expects — everything else (32px accent chip,
// radius-lg card via the shared Card, same p-3.5/gap-3 layout) matches
// StatCard's own accented shape so it reads as one of the four, not a
// fifth, different-looking card.
function TierStatCard({ tier, isPending }: { tier: LeaderboardTier | undefined; isPending: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-coral-bg text-accent-coral-fg">
          <Medal className="size-4" />
        </div>
        <div>
          {isPending ? (
            <span className="inline-block h-6 w-16 animate-pulse rounded bg-muted align-middle" />
          ) : tier ? (
            <TierBadge tier={tier} />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <p className="mt-1 text-sm text-muted-foreground">Batch Tier</p>
        </div>
      </div>
    </Card>
  )
}

function UpcomingAssessmentRow({ assessment }: { assessment: AvailableAssessment }) {
  const buttonState = getAttemptButtonState(assessment)
  const isScheduled = buttonState.kind === 'scheduled'
  return (
    <TableRow>
      <TableCell className="max-w-0 font-medium text-brand-primary">
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
        <p className="truncate text-sm font-medium text-brand-primary">{attempt.assessmentTitle}</p>
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

  const statVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS
  const containerVariants = prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-xl bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to p-4 text-white shadow-sm">
        <p className="text-sm text-white/70">Welcome back,</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold">
          {profile.isPending ? (
            <span className="inline-block h-8 w-40 animate-pulse rounded bg-white/20 align-middle" />
          ) : (
            (profile.data?.fullName ?? 'Student')
          )}
        </h1>
        {!profile.isPending && (profile.data?.collegeName || profile.data?.batchName) && (
          <p className="mt-1.5 text-sm text-white/80">
            {[profile.data?.collegeName, profile.data?.batchName].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={statVariants}>
          <StatCard
            label="Tests Completed"
            value={attempts.isPending ? undefined : testsCompleted}
            icon={CheckCircle2}
            iconClassName="bg-brand-primary/10 text-brand-primary"
            accent="indigo"
          />
        </motion.div>
        <motion.div variants={statVariants}>
          <StatCard
            label="Avg Score (%)"
            value={attempts.isPending ? undefined : (avgScorePercent !== null ? Math.round(avgScorePercent) : null)}
            icon={Target}
            iconClassName="bg-brand-accent/10 text-brand-accent"
            accent="teal"
          />
        </motion.div>
        <motion.div variants={statVariants}>
          <StatCard
            label="Batch Rank"
            value={leaderboard.isPending ? undefined : (selfEntry?.rank ?? null)}
            icon={Trophy}
            iconClassName="bg-brand-primary/10 text-brand-primary"
            accent="amber"
          />
        </motion.div>
        <motion.div variants={statVariants}>
          <TierStatCard tier={selfEntry?.tier} isPending={leaderboard.isPending} />
        </motion.div>
      </motion.div>

      <Card className="p-3.5">
        <div className="flex items-center justify-between gap-2.5">
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand-primary">Upcoming Assessments</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Live and scheduled assessments you haven&apos;t completed yet.
            </p>
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

      <Card className="p-3.5">
        <h2 className="font-heading text-lg font-semibold text-brand-primary">Recent Results</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Your most recently submitted attempts.</p>

        {attempts.isPending && (
          <div className="mt-2.5 space-y-2" role="status" aria-label="Loading recent results">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {attempts.data && recentResults.length === 0 && (
          <EmptyState className="mt-2.5" message="No submitted attempts yet." />
        )}

        {attempts.data && recentResults.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {recentResults.map((attempt) => (
              <RecentResultRow key={attempt.id} attempt={attempt} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
