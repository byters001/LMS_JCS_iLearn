import { CheckCircle2, Medal, Target, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'
import { useLeaderboard, useMyAttempts } from '@/features/reports/api'
import { TierBadge } from '@/features/reports/components/LeaderboardSection'
import type { LeaderboardTier } from '@/features/reports/types'
import { useMyDashboardProfile } from '@/features/students/api'
import { cn } from '@/lib/utils'
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

const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

function TierStatCard({ tier, isPending }: { tier: LeaderboardTier | undefined; isPending: boolean }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
          <Medal className="size-5" />
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
  return (
    <Link
      to={`/student/assessments/${assessment.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:border-brand-accent/50 hover:bg-muted/30"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-brand-primary">{assessment.title}</p>
        <p className="text-xs text-muted-foreground">{TEST_CATEGORY_LABELS[assessment.testCategory]}</p>
      </div>
      <Badge
        className={cn(
          'shrink-0',
          buttonState.kind === 'scheduled'
            ? 'bg-muted text-muted-foreground'
            : 'bg-brand-accent/10 text-brand-accent',
        )}
      >
        {buttonState.kind === 'scheduled' ? 'Opens soon' : ATTEMPT_BUTTON_LABELS[buttonState.kind]}
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
export default function StudentDashboardPage() {
  const profile = useMyDashboardProfile()
  const attempts = useMyAttempts({ page: 1, pageSize: ATTEMPTS_FETCH_SIZE })
  const leaderboard = useLeaderboard()
  const available = useAvailableAssessments({ page: 1, pageSize: UPCOMING_FETCH_SIZE })

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

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to p-6 text-white shadow-sm">
        <p className="text-sm text-white/70">Welcome back,</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold">
          {profile.isPending ? (
            <span className="inline-block h-8 w-40 animate-pulse rounded bg-white/20 align-middle" />
          ) : (
            (profile.data?.fullName ?? 'Student')
          )}
        </h1>
        {!profile.isPending && (profile.data?.collegeName || profile.data?.batchName) && (
          <p className="mt-2 text-sm text-white/80">
            {[profile.data?.collegeName, profile.data?.batchName].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tests Completed"
          value={attempts.isPending ? undefined : testsCompleted}
          icon={CheckCircle2}
          iconClassName="bg-brand-primary/10 text-brand-primary"
        />
        <StatCard
          label="Avg Score (%)"
          value={attempts.isPending ? undefined : (avgScorePercent !== null ? Math.round(avgScorePercent) : null)}
          icon={Target}
          iconClassName="bg-brand-accent/10 text-brand-accent"
        />
        <StatCard
          label="Batch Rank"
          value={leaderboard.isPending ? undefined : (selfEntry?.rank ?? null)}
          icon={Trophy}
          iconClassName="bg-brand-primary/10 text-brand-primary"
        />
        <TierStatCard tier={selfEntry?.tier} isPending={leaderboard.isPending} />
      </div>

      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
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
          <div className="mt-3 space-y-2" role="status" aria-label="Loading upcoming assessments">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {available.isError && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {available.error instanceof ApiError
              ? available.error.message
              : 'Failed to load your assessments. Please try again.'}
          </div>
        )}

        {available.data && upcoming.length === 0 && (
          <EmptyState
            className="mt-3"
            message="Nothing left to complete right now — check back once a new assessment goes live."
          />
        )}

        {available.data && upcoming.length > 0 && (
          <div className="mt-3 space-y-2">
            {upcoming.map((assessment) => (
              <UpcomingAssessmentRow key={assessment.id} assessment={assessment} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
