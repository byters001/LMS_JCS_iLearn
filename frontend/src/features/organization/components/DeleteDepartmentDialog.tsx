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
import { useDeleteDepartment, useTrainingPrograms } from '../api'
import type { Department } from '../types'

interface DeleteDepartmentDialogProps {
  department: Department
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Same soft-delete read as DeleteCollegeDialog.tsx (see that file's own
// comment for the full reasoning) — organization.repository.ts's
// deleteDepartment is a deleted_at UPDATE, and organization.service.ts's
// deleteDepartment does no dependent check either. training_programs.
// department_id is the direct NOT NULL dependent here (schema.sql), so
// this guard checks training-program count for the department via
// useTrainingPrograms (already exists, no new query) rather than
// re-deriving a batches count — a department can't have batches without a
// training program under it (batches.training_program_id -> that program's
// own department_id), so zero training programs already implies zero
// batches transitively, same "one check is sufficient" reasoning as the
// college-side guard.
export function DeleteDepartmentDialog({
  department,
  open,
  onOpenChange,
}: DeleteDepartmentDialogProps) {
  const trainingPrograms = useTrainingPrograms(
    { departmentId: department.id, page: 1, pageSize: 1 },
    { enabled: open },
  )
  const deleteDepartment = useDeleteDepartment()

  const programCount = trainingPrograms.data?.total
  const hasDependents = (programCount ?? 0) > 0

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteDepartment.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteDepartment.mutate(department.id, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {department.name}?</DialogTitle>
          {trainingPrograms.isPending ? (
            <DialogDescription>Checking for training programs under this department…</DialogDescription>
          ) : hasDependents ? (
            <DialogDescription>
              This department still has {programCount} training program
              {programCount === 1 ? '' : 's'} — remove or reassign{' '}
              {programCount === 1 ? 'it' : 'them'} first. Deleting a department with active
              training programs would silently hide it from every picker while those programs
              (and their batches) still point at it.
            </DialogDescription>
          ) : (
            <DialogDescription>
              This removes {department.name} from every department picker across the platform.
              This action cannot be undone from the UI.
            </DialogDescription>
          )}
        </DialogHeader>

        {deleteDepartment.isError && (
          <p className="text-sm text-destructive">
            {deleteDepartment.error instanceof ApiError
              ? deleteDepartment.error.message
              : 'Failed to delete department. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={trainingPrograms.isPending || hasDependents || deleteDepartment.isPending}
            onClick={handleConfirm}
          >
            {deleteDepartment.isPending ? 'Deleting…' : 'Delete Department'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
