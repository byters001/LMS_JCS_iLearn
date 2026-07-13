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
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-primary">Students</h1>
          <p className="text-sm text-muted-foreground">
            Department and user columns show raw IDs — GET /student-profiles doesn't
            currently join in fullName/department name.
          </p>
        </div>
      </div>

      {isPending && (
        <div className="space-y-2" role="status" aria-label="Loading students">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Failed to load students. Please try again.'}
        </div>
      )}

      {data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Department ID</TableHead>
                <TableHead>College ID</TableHead>
                <TableHead>User ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No students found.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>{student.rollNumber ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={student.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {student.departmentId ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {student.collegeId}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {student.userId}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} &middot; {data.total} student
              {data.total === 1 ? '' : 's'}
              {isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
