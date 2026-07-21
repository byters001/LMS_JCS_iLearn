import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { CARD_GRADIENT, cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTrainersOverview } from '../api'
import type { TrainerOverviewNamedRef } from '../types'

const PAGE_SIZE = 20
const NAMED_REF_TRUNCATE_COUNT = 2

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {isActive ? 'active' : 'inactive'}
    </span>
  )
}

// Named refs (colleges/departments) render as a comma-joined list, capped
// at NAMED_REF_TRUNCATE_COUNT with a "+N more" suffix — a trainer assigned
// across many colleges shouldn't blow out a table row's height; the full,
// untruncated set is still visible on TrainerDetailPage via the batches
// list (each batch names its own college/department directly).
function NamedRefList({ refs }: { refs: TrainerOverviewNamedRef[] }) {
  if (refs.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const shown = refs.slice(0, NAMED_REF_TRUNCATE_COUNT)
  const remaining = refs.length - shown.length
  return (
    <span>
      {shown.map((ref) => ref.name).join(', ')}
      {remaining > 0 ? ` +${remaining} more` : ''}
    </span>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-background p-3.5', CARD_GRADIENT)}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-brand-primary">{value}</p>
    </div>
  )
}

// Super Admin only — the route this page lives on is already gated by
// RequireRole (routes/index.tsx), same as every other /admin page. "Trainer"
// here means a user holding the 'faculty' role (see the backend's own
// TrainerOverviewRow comment) — this is the roster + assignment-summary
// view; per-trainer score trends live one click away on TrainerDetailPage.
export default function TrainersDashboardPage() {
  const [page, setPage] = useState(1)
  const trainers = useTrainersOverview({ page, pageSize: PAGE_SIZE })

  const items = trainers.data?.items ?? []
  const total = trainers.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Trainers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which trainer works in which college, department, and batch — click a trainer for their
          performance trend.
        </p>
      </div>

      {/* Headline number before the table, same "stat tiles precede detail"
          pattern as BatchPerformancePage — only the server-reported total is
          shown here (not a page-scoped sum), since a page-local aggregate
          presented without that caveat would misleadingly read as global. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total Trainers" value={String(total)} />
      </div>

      {trainers.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading trainers">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {trainers.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {trainers.error instanceof ApiError
            ? trainers.error.message
            : 'Failed to load trainers. Please try again.'}
        </div>
      )}

      {!trainers.isPending && !trainers.isError && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Colleges</TableHead>
                <TableHead>Departments</TableHead>
                <TableHead className="pr-4 text-right">Batches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No trainers found.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((trainer) => (
                  <TableRow key={trainer.trainerId} className="hover:bg-muted/30">
                    <TableCell className="pl-4 font-medium">
                      <Link
                        to={trainer.trainerId}
                        className="text-brand-primary hover:underline"
                      >
                        {trainer.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{trainer.email}</TableCell>
                    <TableCell>
                      <StatusBadge isActive={trainer.isActive} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <NamedRefList refs={trainer.colleges} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <NamedRefList refs={trainer.departments} />
                    </TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">
                      {trainer.batchCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {trainers.data?.page ?? page} of {totalPages} &middot; {total} trainer
              {total === 1 ? '' : 's'}
              {trainers.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || trainers.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || trainers.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
