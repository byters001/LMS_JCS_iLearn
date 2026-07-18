import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeleteCollege, useDepartments } from '../api'
import type { College } from '../types'

interface DeleteCollegeDialogProps {
  college: College
  open: boolean
  onOpenChange: (open: boolean) => void
}

// My read on DELETE /colleges/:id before wiring this up (item 10 tier 1's
// explicit ask): it's a SOFT delete (colleges.deleted_at, confirmed by
// reading organization.repository.ts's deleteCollege directly — an UPDATE,
// never a real SQL DELETE), so the schema.sql-level `ON DELETE RESTRICT`
// on departments.college_id / training_programs.college_id can NEVER
// actually fire — that constraint only guards a literal DELETE statement,
// and this codebase never issues one for colleges. So Postgres itself
// won't stop this. But organization.service.ts's deleteCollege ALSO does
// no dependent check of its own (confirmed by reading it directly) — it
// happily soft-deletes a college that still has real departments/training
// programs/batches under it, which would silently vanish it from every
// Combobox picker platform-wide (useColleges is GET-only-filtered to
// non-deleted rows) while the FK rows underneath still point at it. That's
// a real, not-hypothetical foot-gun, not just an abstract "what if."
//
// This dialog closes that gap client-side rather than exposing the raw
// route unconditionally: it fetches the college's own department count
// (useDepartments, the same hook DepartmentListPage's own picker already
// uses — no new query) and BLOCKS the delete entirely if any exist,
// pointing the admin at removing those first. Departments are the direct
// FK dependent; training_programs/batches are already unreachable without
// an active department (training_programs.department_id is NOT NULL), so
// a zero-department college is provably a zero-dependent college too —
// this one check is sufficient, not a partial guard.
export function DeleteCollegeDialog({ college, open, onOpenChange }: DeleteCollegeDialogProps) {
  const departments = useDepartments(
    { collegeId: college.id, page: 1, pageSize: 1 },
    { enabled: open },
  )
  const deleteCollege = useDeleteCollege()

  const departmentCount = departments.data?.total
  const hasDependents = (departmentCount ?? 0) > 0

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteCollege.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteCollege.mutate(college.id, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {college.name}?</DialogTitle>
          {departments.isPending ? (
            <DialogDescription>Checking for departments under this college…</DialogDescription>
          ) : hasDependents ? (
            <DialogDescription>
              This college still has {departmentCount} department
              {departmentCount === 1 ? '' : 's'} — remove or reassign{' '}
              {departmentCount === 1 ? 'it' : 'them'} first. Deleting a college with active
              departments would silently hide it from every picker across the platform while
              those departments (and anything built on them) still point at it.
            </DialogDescription>
          ) : (
            <DialogDescription>
              This removes {college.name} from every college picker across the platform (batch
              creation, faculty assignment, analytics, etc.). This action cannot be undone from
              the UI.
            </DialogDescription>
          )}
        </DialogHeader>

        {deleteCollege.isError && (
          <p className="text-sm text-destructive">
            {deleteCollege.error instanceof ApiError
              ? deleteCollege.error.message
              : 'Failed to delete college. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={departments.isPending || hasDependents || deleteCollege.isPending}
            onClick={handleConfirm}
          >
            {deleteCollege.isPending ? 'Deleting…' : 'Delete College'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
