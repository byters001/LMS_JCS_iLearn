import { Award, Crown, Medal, Trophy } from 'lucide-react'
import type { ComponentType } from 'react'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import { useLeaderboard } from '../api'
import type { LeaderboardEntry, LeaderboardTier } from '../types'

// Standard platinum/gold/silver/bronze visual convention — a distinct icon
// PLUS a distinct color per tier (never color alone for identity, dataviz
// skill), each label spelled out next to the badge so nothing depends on
// correctly distinguishing four similar-looking metallic hues either.
// Token-driven (accent-*/status-neutral-* ramps from globals.css), not
// hardcoded Tailwind grays — repaints correctly under both the light
// .app-shell and dark .app-shell.dark scopes with zero per-component work.
const TIER_CONFIG: Record<
  LeaderboardTier,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  platinum: {
    label: 'Platinum',
    icon: Crown,
    className: 'bg-accent-indigo-bg text-accent-indigo-fg',
  },
  gold: {
    label: 'Gold',
    icon: Trophy,
    className: 'bg-accent-amber-bg text-accent-amber-fg',
  },
  silver: {
    label: 'Silver',
    icon: Medal,
    className: 'bg-status-neutral-bg text-status-neutral-fg',
  },
  bronze: {
    label: 'Bronze',
    icon: Award,
    className: 'bg-accent-coral-bg text-accent-coral-fg',
  },
}

// Exported (Phase 4 report page) — AttemptReportPage.tsx reuses this exact
// badge for the student's own tier next to their batch rank, rather than a
// second hand-rolled tier-badge implementation that could drift out of
// sync with this one (icon/color/label per tier).
export function TierBadge({ tier }: { tier: LeaderboardTier }) {
  const { label, icon: Icon, className } = TIER_CONFIG[tier]
  return (
    <Badge className={className}>
      <Icon className="size-3" />
      {label}
    </Badge>
  )
}

// Two-letter initials for the row avatar chip — the only per-student visual
// this endpoint's data actually supports (LeaderboardEntry carries no photo
// URL), same "no fabricated data" discipline as the missing trend column
// below.
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <TableRow
      className={cn(
        'hover:bg-muted/30',
        // The logged-in student's own row: a tinted background PLUS a left
        // accent border PLUS a "(You)" label — three redundant signals, not
        // just a background tint someone could miss while scanning quickly.
        entry.isSelf && 'border-l-4 border-l-primary bg-primary/5 hover:bg-primary/10',
      )}
    >
      <TableCell className="pl-4 font-mono font-medium text-primary">
        {entry.rank <= 3 ? `#${entry.rank}` : entry.rank}
      </TableCell>
      <TableCell>
        <TierBadge tier={entry.tier} />
      </TableCell>
      <TableCell className="font-medium text-primary">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10px] font-semibold text-secondary-foreground">
            {getInitials(entry.displayName)}
          </span>
          <span className="truncate">{entry.displayName}</span>
          {entry.isSelf && <span className="shrink-0 text-xs font-normal text-primary">(You)</span>}
        </div>
      </TableCell>
      <TableCell className="pr-4 text-right font-mono text-muted-foreground">
        {entry.averageScorePercent}%
      </TableCell>
    </TableRow>
  )
}

// Batch-scoped leaderboard on the student dashboard (item 8B), below
// Attempt History. Reuses GET /reports/leaderboard — self-scoped entirely
// server-side (the caller's own active batch), so this component never
// passes or knows a batchId itself.
//
// Structural rollout — "Your Standing" is the natural hero for THIS page
// (a ranked-list page), per the same reasoning StudentDashboardPage's hero
// uses average score: it's the one percentage-shaped number here, so it
// gets the ring. Deliberately NOT a copy of the dashboard's dark full-width
// gradient hero, though — the real hero of a leaderboard page is the ranked
// table itself (comparing yourself to the batch), and a dominant dark panel
// here would compete with the table for attention instead of orienting the
// reader before it. A compact, light-surface strip (ring + rank + tier)
// does that job without duplicating the dashboard's own visual signature.
// Uses the SAME already-fetched entries — no second query — and reads
// selfEntry directly rather than re-deriving it, since LeaderboardRow below
// already needs entry.isSelf per-row anyway.
export default function LeaderboardSection() {
  const { data, isPending, isError, error } = useLeaderboard()
  const selfEntry = data?.entries.find((entry) => entry.isSelf)

  return (
    <Card className="mb-3 p-3.5">
      <h2 className="font-heading text-lg font-semibold text-primary">Leaderboard</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ranked by average score across your batch's completed attempts.
      </p>

      {isPending && (
        <div
          className="mt-4 h-48 animate-pulse rounded-lg bg-muted"
          role="status"
          aria-label="Loading leaderboard"
        />
      )}

      {isError && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load the leaderboard. Please try again.'}
        </div>
      )}

      {data && data.entries.length === 0 && (
        <EmptyState
          className="mt-3"
          message="No one in your batch has completed an assessment yet — the leaderboard will appear here once someone finishes one."
        />
      )}

      {data && data.entries.length > 0 && (
        <>
          {selfEntry ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
              <div className="relative shrink-0">
                <ScoreRing percent={selfEntry.averageScorePercent} size={64} strokeWidth={7} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-heading text-sm font-bold text-foreground">
                    {Math.round(selfEntry.averageScorePercent)}%
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                  Your standing
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-heading text-xl leading-none font-bold text-foreground">
                    #{selfEntry.rank}
                  </span>
                  <span className="text-xs text-muted-foreground">of {data.entries.length}</span>
                  <TierBadge tier={selfEntry.tier} />
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">
              Complete an assessment to see your own standing here.
            </p>
          )}

          {/* Nested directly inside this component's own <Card> below — a
              second Card here would double up shadow/elevation, so this
              stays a plain rounded, borderless clip rather than a full Card
              (same reasoning as ScoreHistoryTable.tsx's identical table). */}
          <div className="mt-3 overflow-hidden rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Rank</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="pr-4 text-right">Avg Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => (
                  <LeaderboardRow key={entry.studentId} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  )
}
