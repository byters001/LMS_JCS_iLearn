import { UserCheck, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useStudentProfiles } from '../api'

const PAGE_SIZE = 20

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active'
  return (
    <span
      className={
        isActive
          ? 'rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {status}
    </span>
  )
}

// Reuses the exact accent colors StatusBadge above already uses for
// 'active'/'archived' (brand-accent / muted) — no new colors invented, per
// CLAUDE1.md's "never invent brand colors" rule. Total gets brand-primary,
// matching its role as the headline number.
function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string
  value: number | undefined
  icon: typeof Users
  iconClassName: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', iconClassName)}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-brand-primary">
            {value === undefined ? (
              <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
            ) : (
              value
            )}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function StudentListPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useStudentProfiles({
    page,
    pageSize: PAGE_SIZE,
  })

  // Two lightweight pageSize=1 queries purely for their `total` counts — same
  // "separate small query just for a count" pattern as NotificationBell's
  // unread-count query. `activeOnly` omits includeArchived (server default
  // is false, i.e. status='active' only); `all` sets includeArchived=true,
  // which removes the status filter entirely per students.repository.ts's
  // buildDirectConditions — so its total is EVERY student regardless of
  // status, not just archived ones. Archived count is derived as the
  // difference rather than a third query.
  const activeCountQuery = useStudentProfiles({ page: 1, pageSize: 1 })
  const allCountQuery = useStudentProfiles({ page: 1, pageSize: 1, includeArchived: true })
  const activeCount = activeCountQuery.data?.total
  const totalCount = allCountQuery.data?.total
  const archivedCount =
    totalCount !== undefined && activeCount !== undefined ? totalCount - activeCount : undefined

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-primary">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every student profile across your college, at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total students"
          value={totalCount}
          icon={Users}
          iconClassName="bg-brand-primary/10 text-brand-primary"
        />
        <StatCard
          label="Active"
          value={activeCount}
          icon={UserCheck}
          iconClassName="bg-brand-accent/10 text-brand-accent"
        />
        <StatCard
          label="Archived"
          value={archivedCount}
          icon={UserX}
          iconClassName="bg-muted text-muted-foreground"
        />
      </div>

      {isPending && (
        <div className="space-y-2" role="status" aria-label="Loading students">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Failed to load students. Please try again.'}
        </div>
      )}

      {data && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Roll Number</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>College</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No students found.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((student) => (
                  <TableRow key={student.id} className="hover:bg-muted/30">
                    <TableCell className="pl-4 font-medium text-brand-primary">
                      {student.fullName ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.rollNumber ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.departmentName ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.collegeName ?? '—'}
                    </TableCell>
                    <TableCell className="pr-4">
                      <StatusBadge status={student.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} &middot; {data.total} student
              {data.total === 1 ? '' : 's'}
              {isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || isFetching}
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
