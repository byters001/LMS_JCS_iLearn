import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { useCategories, useCreatePool } from '../api'
import type { CreatePoolInput, QuestionType } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const PICKER_PAGE_SIZE = 100

const TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'psychometric', label: 'Psychometric' },
]

const createPoolFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['mcq', 'coding', 'psychometric']),
  categoryId: z.string(),
})

type CreatePoolFormValues = z.infer<typeof createPoolFormSchema>

// Pool creation only — criteria are added afterward on PoolDetailPage,
// editing/deletion of the pool itself is out of scope this phase, same
// incremental-scope discipline CreateQuestionPage.tsx established. collegeId
// is deliberately not exposed by this form either, matching that same
// precedent: omitted => global reusable pool (question_pools.college_id
// NULL, per question-bank.schema.ts's own comment on the column).
export default function CreatePoolPage() {
  const navigate = useNavigate()
  const createPool = useCreatePool()
  const categories = useCategories({ page: 1, pageSize: PICKER_PAGE_SIZE })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreatePoolFormValues>({
    resolver: zodResolver(createPoolFormSchema),
    defaultValues: { name: '', description: '', type: 'mcq', categoryId: '' },
  })

  const categoryId = watch('categoryId')
  const categoryOptions: ComboboxOption[] = (categories.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const onSubmit = handleSubmit((values) => {
    const payload: CreatePoolInput = {
      name: values.name,
      type: values.type,
      description: values.description || undefined,
      categoryId: values.categoryId || undefined,
    }
    createPool.mutate(payload, { onSuccess: (pool) => navigate(`../${pool.id}`) })
  })

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to pools
      </Link>

      <div className="mt-3 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Create Question Pool</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates an empty pool — add criteria rows on the next screen to define what it draws.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-brand-primary">
              Name
            </label>
            <input id="name" className={inputClassName} {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium text-brand-primary">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={2}
              className={inputClassName}
              {...register('description')}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="type" className="text-sm font-medium text-brand-primary">
              Type
            </label>
            <select id="type" className={inputClassName} {...register('type')}>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Every criterion added to this pool draws only from questions of this type — it can't
              be changed once criteria exist.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary" htmlFor="categoryId">
              Category{' '}
              <span className="text-muted-foreground">(optional — any category if unset)</span>
            </label>
            <Combobox
              id="categoryId"
              options={categoryOptions}
              value={categoryId || null}
              onSelect={(value) => setValue('categoryId', value)}
              placeholder="Search categories…"
              isLoading={categories.isPending}
              isError={categories.isError}
              errorMessage="Failed to load categories."
              emptyMessage={categories.isPending ? 'Loading…' : 'No categories found.'}
            />
          </div>

          {createPool.isError && (
            <p className="text-sm text-destructive">
              {createPool.error instanceof ApiError
                ? createPool.error.message
                : 'Failed to create pool. Please try again.'}
            </p>
          )}

          <Button
            type="submit"
            disabled={createPool.isPending}
            className="w-full bg-brand-accent text-white hover:bg-brand-accent/90"
          >
            {createPool.isPending ? 'Creating…' : 'Create Pool'}
          </Button>
        </form>
      </div>
    </div>
  )
}
