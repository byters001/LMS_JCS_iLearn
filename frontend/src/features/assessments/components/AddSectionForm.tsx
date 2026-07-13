import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useCreateSection } from '../api'
import type { SelectionMode } from '../types'

// Kept as a validated string, not z.coerce.number()/z.preprocess — see
// CreateAssessmentPage.tsx's comment on why that combination breaks
// useForm<T>'s generic inference against zodResolver.
const optionalIntString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+$/.test(value), 'Must be a positive whole number')

const addSectionFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  selectionMode: z.enum(['manual', 'pool']),
  timerMinutes: optionalIntString,
})

type AddSectionFormValues = z.infer<typeof addSectionFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

interface AddSectionFormProps {
  assessmentId: string
}

export function AddSectionForm({ assessmentId }: AddSectionFormProps) {
  const createSection = useCreateSection(assessmentId)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddSectionFormValues>({
    resolver: zodResolver(addSectionFormSchema),
    defaultValues: { title: '', selectionMode: 'manual' as SelectionMode },
  })

  const onSubmit = handleSubmit((values) => {
    createSection.mutate(
      {
        title: values.title,
        selectionMode: values.selectionMode,
        timerMinutes: values.timerMinutes ? Number.parseInt(values.timerMinutes, 10) : undefined,
      },
      { onSuccess: () => reset({ title: '', selectionMode: values.selectionMode }) },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1 space-y-1">
        <label className="text-xs font-medium text-brand-primary">Section Title</label>
        <input className={inputClassName} {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-brand-primary">Selection Mode</label>
        <select className={inputClassName} {...register('selectionMode')}>
          <option value="manual">Manual</option>
          <option value="pool">Pool</option>
        </select>
      </div>
      <div className="w-32 space-y-1">
        <label className="text-xs font-medium text-brand-primary">Timer (min)</label>
        <input type="number" min={1} className={inputClassName} {...register('timerMinutes')} />
      </div>
      <Button type="submit" disabled={createSection.isPending}>
        {createSection.isPending ? 'Adding…' : 'Add Section'}
      </Button>
      {createSection.isError && (
        <p className="w-full text-xs text-destructive">
          {createSection.error instanceof ApiError
            ? createSection.error.message
            : 'Failed to add section.'}
        </p>
      )}
    </form>
  )
}
