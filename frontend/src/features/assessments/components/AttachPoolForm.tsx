import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAttachPool } from '../api'

const attachPoolFormSchema = z.object({
  questionPoolId: z.string().uuid('Must be a valid question pool UUID'),
})

type AttachPoolFormValues = z.infer<typeof attachPoolFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

interface AttachPoolFormProps {
  assessmentId: string
  sectionId: string
}

// Same limitation as AttachQuestionForm — no pool-browsing UI this phase,
// paste a real questionPoolId directly.
export function AttachPoolForm({ assessmentId, sectionId }: AttachPoolFormProps) {
  const attachPool = useAttachPool(assessmentId)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AttachPoolFormValues>({
    resolver: zodResolver(attachPoolFormSchema),
    defaultValues: { questionPoolId: '' },
  })

  const onSubmit = handleSubmit((values) => {
    attachPool.mutate(
      { sectionId, questionPoolId: values.questionPoolId },
      { onSuccess: () => reset({ questionPoolId: '' }) },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1 space-y-1">
        <input
          placeholder="questionPoolId (UUID)"
          className={cn(inputClassName, 'font-mono text-xs')}
          {...register('questionPoolId')}
        />
        {errors.questionPoolId && (
          <p className="text-xs text-destructive">{errors.questionPoolId.message}</p>
        )}
      </div>
      <Button type="submit" size="sm" disabled={attachPool.isPending}>
        {attachPool.isPending ? 'Attaching…' : 'Attach Pool'}
      </Button>
      {attachPool.isError && (
        <p className="w-full text-xs text-destructive">
          {attachPool.error instanceof ApiError ? attachPool.error.message : 'Failed to attach pool.'}
        </p>
      )}
    </form>
  )
}
