import { AlertTriangle } from 'lucide-react'
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
import { useDeleteCategory } from '../api'
import type { QuestionCategory } from '../types'

interface DeleteCategoryDialogProps {
  category: QuestionCategory
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

// My read on DELETE /question-categories/:id before wiring this up
// (confirmed against db/schema/question-bank.schema.ts directly, not
// assumed): questions.category_id and child categories' parent_category_id
// are both ON DELETE SET NULL, so this never deletes a question or another
// category — it un-categorizes any question filed under it and orphans
// (un-parents) any child category. No blocking dependent-check guard is
// needed, unlike pools (see DeletePoolDialog.tsx) — nothing here can break
// an in-progress or live assessment/attempt.
export function DeleteCategoryDialog({
  category,
  open,
  onOpenChange,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const deleteCategory = useDeleteCategory()

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteCategory.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteCategory.mutate(category.id, {
      onSuccess: () => {
        handleClose(false)
        onDeleted?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-status-danger-bg">
              <AlertTriangle className="size-4.5 text-status-danger-fg" />
            </div>
            <div className="space-y-1 pt-0.5">
              <DialogTitle>Delete {category.name}?</DialogTitle>
              <DialogDescription>
                Any question currently filed under this category becomes uncategorized — it is not
                deleted. Any child category under this one becomes a top-level category instead of
                being deleted. This action cannot be undone from the UI.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {deleteCategory.isError && (
          <p className="text-sm text-destructive">
            {deleteCategory.error instanceof ApiError
              ? deleteCategory.error.message
              : 'Failed to delete category. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteCategory.isPending}
            onClick={handleConfirm}
          >
            {deleteCategory.isPending ? 'Deleting…' : 'Delete Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
