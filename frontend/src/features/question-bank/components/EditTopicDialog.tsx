import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import { useUpdateTopic } from '../api'
import type { QuestionTopic } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

const editTopicFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

type EditTopicFormValues = z.infer<typeof editTopicFormSchema>

interface EditTopicDialogProps {
  topic: QuestionTopic
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Name only — this page never re-parents a topic to a different category
// (that's a separate concern from renaming), matching EditPoolDialog.tsx's
// same "narrower than the backend's real schema" precedent.
export function EditTopicDialog({ topic, open, onOpenChange }: EditTopicDialogProps) {
  const updateTopic = useUpdateTopic()

  const { handleSubmit, register, reset } = useForm<EditTopicFormValues>({
    resolver: zodResolver(editTopicFormSchema),
    defaultValues: { name: topic.name },
  })

  useEffect(() => {
    if (open) {
      reset({ name: topic.name })
    }
  }, [open, topic, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateTopic.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateTopic.mutate(
      { id: topic.id, input: { name: values.name } },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Topic</DialogTitle>
          <DialogDescription>Updates the topic's name.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="editTopicName" className="text-sm font-medium text-foreground">
              Name
            </label>
            <input id="editTopicName" className={inputClassName} {...register('name')} />
          </div>

          {updateTopic.isError && (
            <p className="text-sm text-destructive">
              {updateTopic.error instanceof ApiError
                ? updateTopic.error.message
                : 'Failed to update topic. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateTopic.isPending}>
              {updateTopic.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
