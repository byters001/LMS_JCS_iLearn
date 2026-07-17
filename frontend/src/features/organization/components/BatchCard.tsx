import { ChevronDown, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Batch } from '../types'

function StatusBadge({ status }: { status: Batch['status'] }) {
  if (status === 'active') {
    return (
      <span className="shrink-0 rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent">
        active
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {status}
    </span>
  )
}

export interface BatchCardMenuItem {
  label: string
  onSelect: () => void
}

interface BatchCardProps {
  batch: Batch
  menuItems?: BatchCardMenuItem[]
  // Omitted entirely (not just disabled) on Trainer's "My Batches" page —
  // this toggle is a Super-Admin-only lifecycle action there, matching the
  // backend's batches.toggle_active permission.
  showActiveToggle?: boolean
  isTogglingActive?: boolean
  onToggleActive?: () => void
  // Click-to-expand support (fix-doc item 6's batch-scoped student
  // drill-down on MyBatchesPage). Omitted on BatchListPage — that page has
  // no drill-down, so the card stays a plain non-interactive surface there.
  // Same isSelected/onSelect shape as StudentListPage's college-card
  // grid, the closest existing expand-caret precedent in this codebase.
  isSelected?: boolean
  onSelect?: () => void
}

// Shared by BatchListPage (Admin/Faculty, backed by listBatches) and
// MyBatchesPage (Trainer, backed by listMyBatches) — same card UI, backed by
// different data sources and different menuItems/toggle visibility per
// caller. Do not duplicate this markup in either page.
export function BatchCard({
  batch,
  menuItems,
  showActiveToggle,
  isTogglingActive,
  onToggleActive,
  isSelected,
  onSelect,
}: BatchCardProps) {
  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-expanded={onSelect ? (isSelected ?? false) : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
      className={cn(
        'rounded-xl border bg-background p-4 shadow-sm transition-shadow hover:shadow-md',
        onSelect ? 'cursor-pointer' : undefined,
        isSelected ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-primary">{batch.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {batch.collegeName} · {batch.departmentName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={batch.status} />
          {onSelect && (
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                isSelected && 'rotate-180',
              )}
            />
          )}
          {menuItems && menuItems.length > 0 && (
            // stopPropagation: this sits inside the card's own onClick
            // (added for onSelect above) — without it, opening the actions
            // menu would also toggle the card's drill-down selection.
            <div onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Actions for ${batch.name}`}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-brand-primary"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {menuItems.map((item) => (
                    <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {batch.studentCount} student{batch.studentCount === 1 ? '' : 's'}
          {batch.maxStudents ? ` / ${batch.maxStudents} max` : ''}
        </p>
        {showActiveToggle && batch.status !== 'completed' && (
          // Same stopPropagation reasoning as the menu wrapper above.
          <div onClick={(event) => event.stopPropagation()}>
            <Switch
              checked={batch.status === 'active'}
              disabled={isTogglingActive}
              onCheckedChange={onToggleActive}
              aria-label={batch.status === 'active' ? 'Set batch inactive' : 'Set batch active'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
