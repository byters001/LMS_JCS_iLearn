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
import { useCreateTopic } from '../api'
import type { QuestionTopic } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

const createTopicFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

type CreateTopicFormValues = z.infer<typeof createTopicFormSchema>

interface CreateTopicDialogProps {
  // Fixed for the lifetime of the dialog — always opened from
  // CreateQuestionPage's already-selected category, since a topic only
  // makes sense scoped to a category in this flow (question_topics.category_id
  // is nullable at the schema level, but nothing in this UI ever creates an
  // uncategorized topic).
  categoryId: string
  categoryName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (topic: QuestionTopic) => void
}

export function CreateTopicDialog({
  categoryId,
  categoryName,
  open,
  onOpenChange,
  onCreated,
}: CreateTopicDialogProps) {
  const createTopic = useCreateTopic()

  const { handleSubmit, register, reset } = useForm<CreateTopicFormValues>({
    resolver: zodResolver(createTopicFormSchema),
    defaultValues: { name: '' },
  })

  useEffect(() => {
    if (open) {
      reset({ name: '' })
      createTopic.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) createTopic.reset()
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    createTopic.mutate(
      { name: values.name, categoryId },
      {
        onSuccess: (topic) => {
          onCreated(topic)
          handleClose(false)
        },
      },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Topic</DialogTitle>
          <DialogDescription>Creates a new topic under “{categoryName}”.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="newTopicName" className="text-sm font-medium text-foreground">
              Name
            </label>
            <input id="newTopicName" className={inputClassName} autoFocus {...register('name')} />
          </div>

          {createTopic.isError && (
            <p className="text-sm text-destructive">
              {createTopic.error instanceof ApiError
                ? createTopic.error.message
                : 'Failed to create topic. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTopic.isPending}>
              {createTopic.isPending ? 'Creating…' : 'Create Topic'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
