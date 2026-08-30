import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

const ACCENT_CHIP_CLASS = {
  indigo: 'bg-accent-indigo-bg text-accent-indigo-fg',
  teal: 'bg-accent-teal-bg text-accent-teal-fg',
  amber: 'bg-accent-amber-bg text-accent-amber-fg',
  coral: 'bg-accent-coral-bg text-accent-coral-fg',
} as const

type StatCardAccent = keyof typeof ACCENT_CHIP_CLASS

// Promoted as-is from features/students/pages/StudentListPage.tsx — same
// props, same markup, same loading-pulse placeholder. This is a relocation,
// not a redesign: StudentListPage's rendering must stay byte-for-byte
// identical after the move.
interface StatCardProps {
  label: string
  // undefined = still loading (pulse placeholder, unchanged). null = loaded,
  // but genuinely no data to show (e.g. zero submitted attempts backing an
  // average-score card) — the Super Admin Analytics page's overview cards
  // are the first caller needing this distinction; every existing caller
  // only ever passes a number or undefined, so this is purely additive.
  value: number | null | undefined
  icon: LucideIcon
  // Legacy per-caller icon chip color (e.g. "bg-blue-500/10 text-blue-600").
  // Ignored when `accent` is passed — kept required so every existing call
  // site (none of which pass `accent` yet) renders byte-for-byte the same.
  iconClassName: string
  // Optional — new token-driven icon chip (32px, rounded-lg) used instead of
  // iconClassName's free-form circle when set. Opt-in only, so no existing
  // caller changes appearance until it adopts this.
  accent?: StatCardAccent
  // Optional — arrow + percentage vs. a prior period, colored via the
  // success/danger status tokens. Omitted entirely unless a caller passes it.
  delta?: number
  // Optional — StudentListPage's "Total students" card uses this to show
  // the active/archived split as a thin bar beneath the count, rather than
  // making the caller repeat the total/active/archived numbers a second
  // time in a separate row. Omitted entirely (no bar rendered) unless a
  // caller passes it, so every other StatCard usage is unaffected.
  progress?: {
    value: number
    total: number
  }
  // Optional — CollegeListPage's single "Total colleges" card uses this to
  // cap its width (a lone StatCard has no grid cell to size it), rather
  // than stretching edge-to-edge like a banner. Omitted entirely elsewhere,
  // so every other StatCard usage is unaffected.
  className?: string
}

export function StatCard({ label, value, icon: Icon, iconClassName, accent, delta, progress, className }: StatCardProps) {
  const displayValue = useCountUp(value)

  return (
    <Card className={cn('p-3.5', className)}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center',
            accent ? 'size-8 rounded-lg' : 'size-10 rounded-full',
            accent ? ACCENT_CHIP_CLASS[accent] : iconClassName,
          )}
        >
          <Icon className={accent ? 'size-4' : 'size-5'} />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-2xl font-semibold text-foreground">
              {value === undefined ? (
                <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
              ) : value === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                displayValue
              )}
            </p>
            {delta !== undefined && value !== undefined && value !== null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 font-mono text-xs font-medium',
                  delta >= 0 ? 'text-status-success-fg' : 'text-status-danger-fg',
                )}
              >
                {delta >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                {Math.abs(delta)}%
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
      {progress && progress.total > 0 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-accent"
            style={{ width: `${Math.min(100, (progress.value / progress.total) * 100)}%` }}
          />
        </div>
      )}
    </Card>
  )
}
