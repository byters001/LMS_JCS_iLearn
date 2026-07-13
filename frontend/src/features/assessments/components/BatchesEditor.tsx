import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useUpdateAssessmentBatches } from '../api'
import type { AssessmentStatus } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// batchIds replaces the whole set server-side, so the form's only field is
// the full desired list, parsed from one newline/comma-separated textarea
// rather than a real multi-select (no batches-browsing UI this phase,
// same "paste the ID" limitation as questions/pools — GET /batches does
// exist on the backend, but building a picker fed by it is out of this
// phase's scope alongside the other two).
const batchesFormSchema = z.object({
  batchIdsText: z.string().refine(
    (value) => {
      const tokens = parseTokens(value)
      return tokens.every((token) => UUID_RE.test(token))
    },
    { message: 'Every non-empty line/entry must be a valid UUID' },
  ),
})

type BatchesFormValues = z.infer<typeof batchesFormSchema>

function parseTokens(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

const BATCH_LOCKED_STATUSES: AssessmentStatus[] = ['live', 'completed', 'archived']

interface BatchesEditorProps {
  assessmentId: string
  status: AssessmentStatus
  batchIds: string[]
}

export function BatchesEditor({ assessmentId, status, batchIds }: BatchesEditorProps) {
  const updateBatches = useUpdateAssessmentBatches(assessmentId)
  const isLocked = BATCH_LOCKED_STATUSES.includes(status)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BatchesFormValues>({
    resolver: zodResolver(batchesFormSchema),
    defaultValues: { batchIdsText: batchIds.join('\n') },
  })

  const onSubmit = handleSubmit((values) => {
    updateBatches.mutate(parseTokens(values.batchIdsText))
  })

  return (
    <div>
      {isLocked ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Batches can only be changed before an assessment goes live — this assessment&apos;s
          status is &quot;{status}&quot;.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            One batch UUID per line (or comma-separated). No batch picker exists yet — paste real
            batch IDs directly. Saving replaces the entire current list.
          </p>
          <form onSubmit={onSubmit} noValidate className="mt-2 space-y-2">
            <textarea
              rows={4}
              disabled={isLocked}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              {...register('batchIdsText')}
            />
            {errors.batchIdsText && (
              <p className="text-xs text-destructive">{errors.batchIdsText.message}</p>
            )}
            {updateBatches.isError && (
              <p className="text-xs text-destructive">
                {updateBatches.error instanceof ApiError
                  ? updateBatches.error.message
                  : 'Failed to save batches.'}
              </p>
            )}
            {updateBatches.isSuccess && (
              <p className="text-xs font-medium text-green-600 dark:text-green-500">Saved</p>
            )}
            <Button type="submit" size="sm" disabled={updateBatches.isPending}>
              {updateBatches.isPending ? 'Saving…' : 'Save Batches'}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
