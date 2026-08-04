import { Target, Trophy } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { StatCard } from '@/components/ui/StatCard'
import { useLeaderboard, useMyAttemptDetail } from '../api'
import PerformanceAnalyticsSection from '../components/PerformanceAnalyticsSection'
import { TierBadge } from '../components/LeaderboardSection'

// Phase 4 (final) — the polished single-attempt performance report reached
// from StudentAssessmentsPage.tsx's "View Report" action (a completed
// assessment card now links HERE instead of straight to AttemptResultPage's
// per-question breakdown — see that page's own module comment for why this
// isn't a redundant second button). Every number on this page is reused
// from an endpoint that already exists and already serves this exact
// student's own data:
//   - attempt/score:      GET /reports/my-attempts/:attemptId (same
//                          sanitized shape AttemptResultPage.tsx already
//                          renders — no second, looser endpoint built here)
//   - batch rank/tier:    GET /reports/leaderboard (same self-scoped,
//                          batch-wide ranking LeaderboardSection.tsx uses —
//                          this IS the student's overall batch standing,
//                          not a per-assessment rank; no such narrower
//                          ranking exists anywhere in this codebase, so
//                          this page doesn't invent one)
//   - trend + delta:      PerformanceAnalyticsSection.tsx, reused via its
//                          new highlightAttemptId prop (Phase 4 addition)
//                          rather than a second chart implementation for
//                          the same GET /reports/my-attempts data shape
// "Download PDF" is deliberately NOT implemented here — no PDF-generation
// capability exists anywhere in this codebase (backend or frontend; no
// pdfkit/puppeteer/jspdf/react-pdf-style dependency, no existing pipeline)
// and no "pdf" skill was available to build one. That's real new scope,
// flagged for a decision rather than silently built as a side effect of
// this page.
export default function AttemptReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const { data, isLoading, isError, error } = useMyAttemptDetail(attemptId)
  const leaderboard = useLeaderboard()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Loading your report…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load your report. Please try again."}
        </p>
      </div>
    )
  }

  const { attempt } = data
  const selfEntry = leaderboard.data?.entries.find((entry) => entry.isSelf)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <Link to="/student" className="text-sm text-brand-accent hover:underline">
          &larr; Back to Your Assessments
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-brand-primary">
          {attempt.assessmentTitle}
        </h1>
        <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Performance Report &middot; Attempt #{attempt.attemptNumber}
          {attempt.isRetake ? ' · Retake' : ''}
        </p>
      </div>

      {/* Same two non-final states AttemptResultPage.tsx already handles
          explicitly — a completed-tier card (attemptButtonState.ts's
          COMPLETED_TIER_STATUSES) can still be 'pending_evaluation' or
          'invalidated', neither of which has a real score to report on. */}
      {attempt.status === 'pending_evaluation' && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          One or more coding questions haven&apos;t finished grading yet — your report will be
          available once evaluation completes.{' '}
          <Link to={`/student/attempts/${attemptId}/submitted`} className="text-brand-accent hover:underline">
            View what&apos;s graded so far &rarr;
          </Link>
        </div>
      )}

      {attempt.status === 'invalidated' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          This attempt was invalidated (proctoring flag) and has no scored result to report.
        </div>
      )}

      {attempt.status === 'submitted' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              label="Score (%)"
              value={attempt.scorePercent !== null ? Math.round(attempt.scorePercent) : null}
              icon={Target}
              iconClassName="bg-brand-accent/10 text-brand-accent"
            />
            <StatCard
              label="Batch Rank"
              value={leaderboard.isPending ? undefined : (selfEntry?.rank ?? null)}
              icon={Trophy}
              iconClassName="bg-brand-primary/10 text-brand-primary"
            />
          </div>

          {/* Real, reused numbers that don't fit StatCard's single-number
              shape — the raw points score (scorePercent above is the
              comparable-across-assessments figure; this is the literal
              grade) and the same TierBadge LeaderboardSection.tsx renders
              for this student's row there. */}
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {attempt.totalScore !== null && <span>{attempt.totalScore} points scored</span>}
            {selfEntry && (
              <>
                <span>&middot;</span>
                <TierBadge tier={selfEntry.tier} />
                <span>batch tier</span>
              </>
            )}
          </p>

          <PerformanceAnalyticsSection highlightAttemptId={attemptId} heading="Your Score Trend" />
        </>
      )}

      <Link
        to={`/student/attempts/${attemptId}/submitted`}
        className="inline-block text-sm text-brand-accent hover:underline"
      >
        View detailed question breakdown &rarr;
      </Link>
    </div>
  )
}
