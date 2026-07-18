import { Award, Crown, Medal, Trophy } from 'lucide-react'
import type { ComponentType } from 'react'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
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
const TIER_CONFIG: Record<
  LeaderboardTier,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  platinum: {
    label: 'Platinum',
    icon: Crown,
    className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  },
  gold: {
    label: 'Gold',
    icon: Trophy,
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  silver: {
    label: 'Silver',
    icon: Medal,
    className: 'bg-zinc-400/10 text-zinc-600 dark:text-zinc-300',
  },
  bronze: {
    label: 'Bronze',
    icon: Award,
    className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  },
}

function TierBadge({ tier }: { tier: LeaderboardTier }) {
  const { label, icon: Icon, className } = TIER_CONFIG[tier]
  return (
    <Badge className={className}>
      <Icon className="size-3" />
      {label}
    </Badge>
  )
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <TableRow
      className={cn(
        'hover:bg-muted/30',
        // The logged-in student's own row: a tinted background PLUS a left
        // accent border PLUS a "(You)" label — three redundant signals, not
        // just a background tint someone could miss while scanning quickly.
        entry.isSelf &&
          'border-l-4 border-l-brand-accent bg-brand-accent/5 hover:bg-brand-accent/10',
      )}
    >
      <TableCell className="pl-4 font-medium text-brand-primary">{entry.rank}</TableCell>
      <TableCell>
        <TierBadge tier={entry.tier} />
      </TableCell>
      <TableCell className="font-medium text-brand-primary">
        {entry.displayName}
        {entry.isSelf && <span className="ml-1.5 text-xs font-normal text-brand-accent">(You)</span>}
      </TableCell>
      <TableCell className="pr-4 text-right text-muted-foreground">
        {entry.averageScorePercent}%
      </TableCell>
    </TableRow>
  )
}

// Batch-scoped leaderboard on the student dashboard (item 8B), below
// Attempt History. Reuses GET /reports/leaderboard — self-scoped entirely
// server-side (the caller's own active batch), so this component never
// passes or knows a batchId itself.
export default function LeaderboardSection() {
  const { data, isPending, isError, error } = useLeaderboard()

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-brand-primary">Leaderboard</h2>
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
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError
            ? error.message
            : 'Failed to load the leaderboard. Please try again.'}
        </div>
      )}

      {data && data.entries.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No one in your batch has completed an assessment yet — the leaderboard will appear here
          once someone finishes one.
        </p>
      )}

      {data && data.entries.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
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
      )}
    </div>
  )
}
