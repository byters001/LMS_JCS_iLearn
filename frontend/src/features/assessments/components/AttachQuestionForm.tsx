import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAttachQuestion } from '../api'

// Kept as a validated string, not z.coerce.number()/z.preprocess — see
// CreateAssessmentPage.tsx's comment on why that combination breaks
// useForm<T>'s generic inference against zodResolver.
const optionalPositiveNumberString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+(\.\d+)?$/.test(value), 'Must be a positive number')

const attachQuestionFormSchema = z.object({
  questionVersionId: z.string().uuid('Must be a valid question version UUID'),
  marksOverride: optionalPositiveNumberString,
})

type AttachQuestionFormValues = z.infer<typeof attachQuestionFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

interface AttachQuestionFormProps {
  assessmentId: string
  sectionId: string
}

// No question-bank browsing/search UI this phase — paste a real
// questionVersionId directly. A real question-picker (search by text/type/
// topic) is a larger future phase, stated here in the UI itself rather than
// silently limiting what this form can do.
export function AttachQuestionForm({ assessmentId, sectionId }: AttachQuestionFormProps) {
  const attachQuestion = useAttachQuestion(assessmentId)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AttachQuestionFormValues>({
    resolver: zodResolver(attachQuestionFormSchema),
    defaultValues: { questionVersionId: '' },
  })

  const onSubmit = handleSubmit((values) => {
    attachQuestion.mutate(
      {
        sectionId,
        questionVersionId: values.questionVersionId,
        marksOverride: values.marksOverride ? Number.parseFloat(values.marksOverride) : undefined,
      },
      { onSuccess: () => reset({ questionVersionId: '' }) },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1 space-y-1">
        <input
          placeholder="questionVersionId (UUID)"
          className={cn(inputClassName, 'font-mono text-xs')}
          {...register('questionVersionId')}
        />
        {errors.questionVersionId && (
          <p className="text-xs text-destructive">{errors.questionVersionId.message}</p>
        )}
      </div>
      <div className="w-28 space-y-1">
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Marks override"
          className={inputClassName}
          {...register('marksOverride')}
        />
      </div>
      <Button type="submit" size="sm" disabled={attachQuestion.isPending}>
        {attachQuestion.isPending ? 'Attaching…' : 'Attach Question'}
      </Button>
      {attachQuestion.isError && (
        <p className="w-full text-xs text-destructive">
          {attachQuestion.error instanceof ApiError
            ? attachQuestion.error.message
            : 'Failed to attach question.'}
        </p>
      )}
    </form>
  )
}
