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

export default function StudentListPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error, isFetching } = useStudentProfiles({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-brand-primary">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every student profile across your college, at a glance.
        </p>
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
