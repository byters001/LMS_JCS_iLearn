import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/PageHeader'
import { useColleges, useCreateBatch, useTrainingPrograms } from '../api'
import { TrainingProgramFormDialog } from '../components/TrainingProgramFormDialog'

const PICKER_PAGE_SIZE = 100

const createBatchFormSchema = z.object({
  trainingProgramId: z.string().min(1, 'Select a training program'),
  name: z.string().min(1, 'Name is required'),
  maxStudents: z.string().optional(),
  commonPassword: z.string().min(8, 'Must be at least 8 characters'),
})

type CreateBatchFormValues = z.infer<typeof createBatchFormSchema>

// trainingProgramId, not raw collegeId/departmentId/academicYearId: batches'
// training_program_id is a real, existing NOT NULL FK (batches has no direct
// college/department columns at all — confirmed directly against
// schema.sql), and training_programs already carries college/department/
// academicYear. Rather than inventing an implicit "auto-create a training
// program behind the scenes" mechanism the schema doesn't ask for, this form
// picks an EXISTING one — college first (to narrow the list down to a
// manageable size), then the actual training program. There's no college
// switcher yet (deferred from Phase 1), so the college picker here is a
// temporary stand-in, same reasoning as BatchListPage.tsx's own picker —
// collegeId itself is never submitted to createBatch, it only filters the
// training-program picker below.
export default function CreateBatchPage() {
  const navigate = useNavigate()
  const createBatch = useCreateBatch()

  const [collegeId, setCollegeId] = useState<string | null>(null)
  const [showCreateProgram, setShowCreateProgram] = useState(false)
  const colleges = useColleges({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const collegeOptions: ComboboxOption[] = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))
  const selectedCollegeName =
    colleges.data?.items.find((college) => college.id === collegeId)?.name ?? ''

  const trainingPrograms = useTrainingPrograms(
    { collegeId: collegeId ?? '', page: 1, pageSize: PICKER_PAGE_SIZE },
    { enabled: collegeId !== null },
  )
  const trainingProgramOptions: ComboboxOption[] = (trainingPrograms.data?.items ?? []).map(
    (program) => ({ value: program.id, label: program.name }),
  )

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateBatchFormValues>({
    resolver: zodResolver(createBatchFormSchema),
    defaultValues: { trainingProgramId: '', name: '', maxStudents: '', commonPassword: '' },
  })

  const trainingProgramId = watch('trainingProgramId')

  const onSubmit = handleSubmit((values) => {
    createBatch.mutate(
      {
        trainingProgramId: values.trainingProgramId,
        name: values.name,
        maxStudents: values.maxStudents ? Number(values.maxStudents) : undefined,
        commonPassword: values.commonPassword,
      },
      { onSuccess: () => navigate('..') },
    )
  })

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <Link
        to=".."
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Back to batches
      </Link>

      <PageHeader
        title="Create Batch"
        description="A batch is a training cohort within an existing training program."
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">College</p>
              <Combobox
                options={collegeOptions}
                value={collegeId}
                onSelect={(value) => {
                  setCollegeId(value)
                  setValue('trainingProgramId', '')
                }}
                placeholder="Select a college…"
                isLoading={colleges.isPending}
                isError={colleges.isError}
                errorMessage="Failed to load colleges."
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground" htmlFor="trainingProgramId">
                  Training Program
                </label>
                {/* Item 1 — lets the admin create a training program without
                    leaving this flow, instead of forcing a trip to a separate
                    screen. Disabled until a college is picked since
                    TrainingProgramFormDialog needs a collegeId to scope to. */}
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                  disabled={collegeId === null}
                  onClick={() => setShowCreateProgram(true)}
                >
                  + New Program
                </button>
              </div>
              <Combobox
                id="trainingProgramId"
                options={trainingProgramOptions}
                value={trainingProgramId || null}
                onSelect={(value) => setValue('trainingProgramId', value, { shouldValidate: true })}
                placeholder={collegeId ? 'Search training programs…' : 'Select a college first'}
                disabled={collegeId === null}
                isLoading={trainingPrograms.isPending}
                isError={trainingPrograms.isError}
                errorMessage="Failed to load training programs."
                emptyMessage={
                  collegeId === null
                    ? 'Select a college first.'
                    : trainingPrograms.isPending
                      ? 'Loading…'
                      : 'No training programs found for this college.'
                }
              />
              {errors.trainingProgramId && (
                <p className="text-xs text-destructive">{errors.trainingProgramId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Name
              </label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="maxStudents" className="text-sm font-medium text-foreground">
                Max Students <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="maxStudents" type="number" min={1} {...register('maxStudents')} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="commonPassword" className="text-sm font-medium text-foreground">
                Common Password
              </label>
              {/* Plain text, not masked: this is a shared credential the admin
                  will hand out to students (Phase 3), not a personal secret
                  being typed blind — being able to see what was typed before
                  sharing it matters more here than the usual masking norm. */}
              <Input id="commonPassword" type="text" {...register('commonPassword')} />
              <p className="text-xs text-muted-foreground">
                Shared login password for students created against this batch (a later phase). Stored
                hashed — it can't be retrieved again after creation, so save it somewhere safe now.
              </p>
              {errors.commonPassword && (
                <p className="text-xs text-destructive">{errors.commonPassword.message}</p>
              )}
            </div>

            {createBatch.isError && (
              <p className="text-sm text-destructive">
                {createBatch.error instanceof ApiError
                  ? createBatch.error.message
                  : 'Failed to create batch. Please try again.'}
              </p>
            )}

            <Button type="submit" disabled={createBatch.isPending} className="w-full">
              {createBatch.isPending ? 'Creating…' : 'Create Batch'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {collegeId !== null && (
        <TrainingProgramFormDialog
          collegeId={collegeId}
          collegeName={selectedCollegeName}
          open={showCreateProgram}
          onOpenChange={setShowCreateProgram}
          onCreated={(program) =>
            setValue('trainingProgramId', program.id, { shouldValidate: true })
          }
        />
      )}
    </div>
  )
}
