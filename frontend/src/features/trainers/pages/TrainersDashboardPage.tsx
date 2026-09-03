import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, UserCheck, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ApiError } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
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
// GET /trainers/overview only ever returns one page of rows (never fetch-
// all-then-slice client-side), so this chart can only ever be a page-local
// "top N of the visible 20" breakdown, not a global ranking — capped at 8
// bars so it stays a glanceable read alongside the table, not a second
// near-duplicate of it.
const TOP_TRAINERS_CHART_COUNT = 8

interface TrainerBatchChartPoint {
  name: string
  batches: number
}

interface ChartTooltipProps {
  active?: boolean
  label?: string
  payload?: Array<{ value: number }>
}

// Themed replacement for Recharts' unstyled default tooltip box (renders
// broken-looking in dark mode) — bg-popover/border-border/text-popover-
// foreground, the same tokens every other themed popover surface uses.
function BatchCountTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{label}</p>
      <p className="text-muted-foreground">
        {value} batch{value === 1 ? '' : 'es'}
      </p>
    </div>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return <Badge variant={isActive ? 'success' : 'neutral'}>{isActive ? 'active' : 'inactive'}</Badge>
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
  const activeCount = items.filter((trainer) => trainer.isActive).length
  const batchSum = items.reduce((sum, trainer) => sum + trainer.batchCount, 0)

  // Real per-trainer data (batchCount — the same number shown in the
  // table's own "Batches" column), just resorted and capped for a
  // glanceable chart, never invented. Scoped to the current page only —
  // same page-local-aggregate caveat as the two "(this page)" stat cards
  // below, since no endpoint returns a cross-page ranking to chart instead.
  const chartData: TrainerBatchChartPoint[] = [...items]
    .sort((a, b) => b.batchCount - a.batchCount)
    .slice(0, TOP_TRAINERS_CHART_COUNT)
    .map((trainer) => ({ name: trainer.fullName, batches: trainer.batchCount }))

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Trainers"
        description="Which trainer works in which college, department, and batch — click a trainer for their performance trend."
      />

      {/* Headline numbers before the table/chart, same "stat tiles precede
          detail" pattern as BatchPerformancePage. Total Trainers is the one
          server-reported global count (trainers.data.total); the other two
          are explicitly labeled "(this page)" since GET /trainers/overview
          only ever returns one page of rows at a time — presenting a
          page-local sum as if it were global would misrepresent it (same
          reasoning this page's original single-stat version already
          documented). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total Trainers"
          value={trainers.isPending ? undefined : total}
          icon={Users}
          iconClassName="bg-accent-indigo-bg text-accent-indigo-fg"
          accent="indigo"
        />
        <StatCard
          label="Active (this page)"
          value={trainers.isPending ? undefined : activeCount}
          icon={UserCheck}
          iconClassName="bg-accent-teal-bg text-accent-teal-fg"
          accent="teal"
          progress={items.length > 0 ? { value: activeCount, total: items.length } : undefined}
        />
        <StatCard
          label="Batches (this page)"
          value={trainers.isPending ? undefined : batchSum}
          icon={Layers}
          iconClassName="bg-accent-amber-bg text-accent-amber-fg"
          accent="amber"
        />
      </div>

      {trainers.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {trainers.error instanceof ApiError
            ? trainers.error.message
            : 'Failed to load trainers. Please try again.'}
        </div>
      )}

      {trainers.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading trainers">
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {!trainers.isPending && !trainers.isError && chartData.length > 0 && (
        <Card className="space-y-3 p-3.5">
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Top Trainers by Batch Count
            </h3>
            <p className="text-xs text-muted-foreground">
              Current page only, sorted by assigned batch count.
            </p>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<BatchCountTooltip />} cursor={{ fill: 'var(--muted)' }} />
              <Bar dataKey="batches" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
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
                      <Link to={trainer.trainerId} className="text-primary hover:underline">
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

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3.5 py-2.5">
            <p className="text-sm text-muted-foreground">
              Page {trainers.data?.page ?? page} of {totalPages} &middot; {total} trainer
              {total === 1 ? '' : 's'}
              {trainers.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary/5"
                disabled={page <= 1 || trainers.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary/5"
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
