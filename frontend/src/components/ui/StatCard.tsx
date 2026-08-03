import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

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
  iconClassName: string
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

export function StatCard({ label, value, icon: Icon, iconClassName, progress, className }: StatCardProps) {
  return (
    <Card className={cn('p-3.5', className)}>
      <div className="flex items-center gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', iconClassName)}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="font-heading text-2xl font-semibold text-foreground">
            {value === undefined ? (
              <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
            ) : value === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              value
            )}
          </p>
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
