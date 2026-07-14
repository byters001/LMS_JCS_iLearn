import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/Combobox'
import { useQuestionsForPicker } from '@/features/question-bank/api'
import { useAttachQuestion } from '../api'
import type { TestCategory } from '../types'

// Kept as a validated string, not z.coerce.number()/z.preprocess — see
// CreateAssessmentPage.tsx's comment on why that combination breaks
// useForm<T>'s generic inference against zodResolver.
const optionalPositiveNumberString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+(\.\d+)?$/.test(value), 'Must be a positive number')

const attachQuestionFormSchema = z.object({
  questionVersionId: z.string().uuid('Pick a question from the list'),
  marksOverride: optionalPositiveNumberString,
})

type AttachQuestionFormValues = z.infer<typeof attachQuestionFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

// A small, bounded page — this feeds AttachQuestionForm's combobox, which
// enriches every row with a per-question detail fetch to get real text (see
// useQuestionsForPicker's comment on why). Larger than this and the
// resulting fan-out stops being reasonable for a picker; a real catalog
// browser with server-side search is a larger, separate future phase.
const QUESTION_PICKER_PAGE_SIZE = 30

interface AttachQuestionFormProps {
  assessmentId: string
  sectionId: string
  testCategory: TestCategory
}

// Only approved questions are attachable (assessments.service.ts's
// createAssessmentQuestion rejects anything else), and — unless the
// assessment is 'mixed' — only questions whose type matches the
// assessment's testCategory (assertMatchesTestCategory). Both filters are
// applied up front so the picker only ever offers choices the backend will
// actually accept, rather than letting the user pick something and then
// discover the rejection after submitting.
export function AttachQuestionForm({ assessmentId, sectionId, testCategory }: AttachQuestionFormProps) {
  const attachQuestion = useAttachQuestion(assessmentId)
  const picker = useQuestionsForPicker({
    status: 'approved',
    type: testCategory === 'mixed' ? undefined : testCategory,
    page: 1,
    pageSize: QUESTION_PICKER_PAGE_SIZE,
  })

  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AttachQuestionFormValues>({
    resolver: zodResolver(attachQuestionFormSchema),
    defaultValues: { questionVersionId: '' },
  })

  const questionVersionId = watch('questionVersionId')

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
        <Combobox
          id="questionVersionId"
          options={picker.items.map((item) => ({ value: item.questionVersionId, label: item.label }))}
          value={questionVersionId || null}
          onSelect={(value) => setValue('questionVersionId', value, { shouldValidate: true })}
          placeholder="Search approved questions by text…"
          isLoading={picker.isLoading}
          isError={picker.isError}
          errorMessage="Failed to load questions."
          emptyMessage={
            picker.isLoading ? 'Loading…' : 'No matching approved questions for this type.'
          }
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
