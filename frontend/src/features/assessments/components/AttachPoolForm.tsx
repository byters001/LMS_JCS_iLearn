import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/Combobox'
import { useQuestionPools } from '@/features/question-bank/api'
import { useAttachPool } from '../api'
import type { TestCategory } from '../types'

const attachPoolFormSchema = z.object({
  questionPoolId: z.string().uuid('Pick a pool from the list'),
})

type AttachPoolFormValues = z.infer<typeof attachPoolFormSchema>

// question_pools.name lives directly on the pool row (unlike questions, no
// version indirection) — GET /question-pools already gives everything the
// combobox needs, so this is a plain client-side filter over one fetched
// page, no per-row enrichment fetch required.
const POOL_PICKER_PAGE_SIZE = 100

interface AttachPoolFormProps {
  assessmentId: string
  sectionId: string
  testCategory: TestCategory
}

// Same testCategory gate as AttachQuestionForm — only pools whose type
// matches the assessment's testCategory are attachable unless the
// assessment is 'mixed' (assertMatchesTestCategory in assessments.service.ts
// applies to pool.type exactly the same way it does to question.type).
export function AttachPoolForm({ assessmentId, sectionId, testCategory }: AttachPoolFormProps) {
  const attachPool = useAttachPool(assessmentId)
  const pools = useQuestionPools({
    type: testCategory === 'mixed' ? undefined : testCategory,
    page: 1,
    pageSize: POOL_PICKER_PAGE_SIZE,
  })

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AttachPoolFormValues>({
    resolver: zodResolver(attachPoolFormSchema),
    defaultValues: { questionPoolId: '' },
  })

  const questionPoolId = watch('questionPoolId')

  const onSubmit = handleSubmit((values) => {
    attachPool.mutate(
      { sectionId, questionPoolId: values.questionPoolId },
      { onSuccess: () => reset({ questionPoolId: '' }) },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1 space-y-1">
        <Combobox
          id="questionPoolId"
          options={(pools.data?.items ?? []).map((pool) => ({ value: pool.id, label: pool.name }))}
          value={questionPoolId || null}
          onSelect={(value) => setValue('questionPoolId', value, { shouldValidate: true })}
          placeholder="Search question pools by name…"
          isLoading={pools.isPending}
          isError={pools.isError}
          errorMessage="Failed to load question pools."
          emptyMessage={pools.isPending ? 'Loading…' : 'No matching pools for this type.'}
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
