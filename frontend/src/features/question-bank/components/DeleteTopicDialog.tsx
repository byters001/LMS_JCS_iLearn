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
import { useDeleteTopic } from '../api'
import type { QuestionTopic } from '../types'

interface DeleteTopicDialogProps {
  topic: QuestionTopic
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

// My read on DELETE /question-topics/:id before wiring this up (confirmed
// against db/schema/question-bank.schema.ts directly): question_topic_map.
// topic_id is ON DELETE CASCADE, but that only removes the join row linking
// this topic to whatever questions carry it — the questions themselves
// (and their question_versions content) are untouched. No blocking
// dependent-check guard is needed, same reasoning as DeleteCategoryDialog.tsx.
export function DeleteTopicDialog({ topic, open, onOpenChange, onDeleted }: DeleteTopicDialogProps) {
  const deleteTopic = useDeleteTopic()

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteTopic.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteTopic.mutate(topic.id, {
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
              <DialogTitle>Delete {topic.name}?</DialogTitle>
              <DialogDescription>
                This only removes the topic tag from any question that carries it — the questions
                themselves are not deleted. This action cannot be undone from the UI.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {deleteTopic.isError && (
          <p className="text-sm text-destructive">
            {deleteTopic.error instanceof ApiError
              ? deleteTopic.error.message
              : 'Failed to delete topic. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteTopic.isPending}
            onClick={handleConfirm}
          >
            {deleteTopic.isPending ? 'Deleting…' : 'Delete Topic'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
