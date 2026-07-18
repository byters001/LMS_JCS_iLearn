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
import { useArchiveStudentProfile, useUpdateStudentProfile } from '../api'
import { EditStudentDialog } from './EditStudentDialog'
import type { ListStudentProfilesResponse, StudentProfile } from '../types'

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

// Minimal shape both StudentListPage's and MyBatchesPage's own
// useStudentProfiles(...) calls already satisfy — accepting the real
// UseQueryResult type here would force this component to import
// @tanstack/react-query's generic just to describe a prop, when only these
// five fields are ever read.
interface StudentsQueryState {
  data?: ListStudentProfilesResponse
  isPending: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
}

interface StudentRosterTableProps {
  studentsQuery: StudentsQueryState
  page: number
  onPageChange: (page: number) => void
  includeArchived: boolean
  onIncludeArchivedChange: (value: boolean) => void
  emptyMessage: string
}

// Item 10 tier 2 — was duplicated near-verbatim between StudentListPage.tsx
// (college-scoped) and MyBatchesPage.tsx (batch-scoped) before this;
// extracted here once BOTH needed the identical new Edit/Archive actions,
// rather than forking the addition into two copies. The two pages still
// own their own useStudentProfiles(...) call (different scope params —
// collegeId vs batchId — that's genuinely page-specific) and just hand the
// resulting query state in as a prop, along with their own page/
// includeArchived state (so pagination/filter resets when the parent's
// selected college/batch changes stay each page's own concern, unchanged
// from before).
//
// Archive/Reactivate orphaning read (item 10 tier 2's explicit ask):
// student_profiles has NO deleted_at column at all (confirmed directly
// against schema.sql) — "deleting" a student (DELETE /student-profiles/:id)
// is a plain status='archived' UPDATE (students.repository.ts's
// archiveStudentProfile), not a row hide. Every FK that references a
// student (assessment_attempts.student_id, attempt_responses via the
// attempt, training_program_students.student_id) keeps pointing at the
// SAME row, which never disappears — so a student's attempt history,
// scores, and reports stay fully intact and queryable after archiving,
// unlike colleges/departments/batches where deleted_at genuinely hides the
// row from every join. This is why Archive is wired here as a plain
// one-click toggle (matching FacultyListPage's isActive
// Deactivate/Reactivate button) instead of DeleteCollegeDialog's blocking
// dependent-count guard — there is no dependent-orphaning risk to guard
// against.
export function StudentRosterTable({
  studentsQuery,
  page,
  onPageChange,
  includeArchived,
  onIncludeArchivedChange,
  emptyMessage,
}: StudentRosterTableProps) {
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null)
  const archiveStudentProfile = useArchiveStudentProfile()
  const updateStudentProfile = useUpdateStudentProfile()
  const isTogglingId =
    (archiveStudentProfile.isPending ? archiveStudentProfile.variables : undefined) ??
    (updateStudentProfile.isPending ? updateStudentProfile.variables?.id : undefined)

  function handleToggleStatus(student: StudentProfile) {
    if (student.status === 'active') {
      archiveStudentProfile.mutate(student.id)
    } else {
      updateStudentProfile.mutate({ id: student.id, input: { status: 'active' } })
    }
  }

  const totalPages = studentsQuery.data
    ? Math.max(1, Math.ceil(studentsQuery.data.total / studentsQuery.data.pageSize))
    : 1
  const toggleError = archiveStudentProfile.error ?? updateStudentProfile.error

  return (
    <div className="space-y-3">
      <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => onIncludeArchivedChange(event.target.checked)}
          className="accent-brand-accent"
        />
        Show archived students
      </label>

      {studentsQuery.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading students">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {studentsQuery.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {studentsQuery.error instanceof ApiError
            ? studentsQuery.error.message
            : 'Failed to load students. Please try again.'}
        </div>
      )}

      {studentsQuery.data && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Roll Number</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>College</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsQuery.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                studentsQuery.data.items.map((student) => (
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
                    <TableCell>
                      <StatusBadge status={student.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingStudent(student)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isTogglingId === student.id}
                          onClick={() => handleToggleStatus(student)}
                          className={
                            student.status === 'active'
                              ? 'border-destructive text-destructive hover:bg-destructive/5'
                              : 'border-brand-primary text-brand-primary hover:bg-brand-primary/5'
                          }
                        >
                          {student.status === 'active' ? 'Archive' : 'Reactivate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {toggleError ? (
            <p className="px-4 py-2 text-sm text-destructive">
              {toggleError instanceof ApiError
                ? toggleError.message
                : 'Failed to update student status.'}
            </p>
          ) : null}

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {studentsQuery.data.page} of {totalPages} &middot; {studentsQuery.data.total}{' '}
              student
              {studentsQuery.data.total === 1 ? '' : 's'}
              {studentsQuery.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || studentsQuery.isFetching}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || studentsQuery.isFetching}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingStudent && (
        <EditStudentDialog
          student={editingStudent}
          open={editingStudent !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditingStudent(null)
          }}
        />
      )}
    </div>
  )
}
