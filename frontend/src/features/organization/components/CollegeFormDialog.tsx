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
import { Input } from '@/components/ui/input'
import { useCreateCollege, useUpdateCollege } from '../api'
import type { College, CollegeStatus } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

// Same "validated-but-blankable optional string" convention CreateQuestionPage.tsx's
// optionalPositiveNumberString established — react-hook-form's registered
// inputs are always strings, so an unset optional field is '', not
// undefined, and a plain z.string().url().optional() would reject '' outright.
const optionalUrlString = z
  .string()
  .optional()
  .refine((value) => !value || /^https?:\/\/.+/.test(value), 'Must be a valid URL (http/https)')
const optionalEmailString = z
  .string()
  .optional()
  .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Must be a valid email')
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const optionalDateString = z
  .string()
  .optional()
  .refine((value) => !value || DATE_PATTERN.test(value), 'Must be a valid date')

const STATUS_OPTIONS: Array<{ value: CollegeStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'archived', label: 'Archived' },
]

// status is unconditionally in the schema (not .optional()) because the
// form always has a real value for it once mounted (defaultValues below
// sets 'active' even in create mode) — the CREATE payload builder in
// onSubmit is what actually drops it before calling useCreateCollege,
// matching createCollegeSchema's real shape (no status field at all, see
// backend/organization.schema.ts) rather than the form itself needing an
// undefined branch.
const collegeFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  logoUrl: optionalUrlString,
  address: z.string().optional(),
  contactEmail: optionalEmailString,
  contactPhone: z.string().optional(),
  contractStartDate: optionalDateString,
  contractEndDate: optionalDateString,
  status: z.enum(['active', 'expired', 'archived']),
})

type CollegeFormValues = z.infer<typeof collegeFormSchema>

const EMPTY_VALUES: CollegeFormValues = {
  name: '',
  code: '',
  logoUrl: '',
  address: '',
  contactEmail: '',
  contactPhone: '',
  contractStartDate: '',
  contractEndDate: '',
  status: 'active',
}

function collegeToFormValues(college: College): CollegeFormValues {
  return {
    name: college.name,
    code: college.code,
    logoUrl: college.logoUrl ?? '',
    address: college.address ?? '',
    contactEmail: college.contactEmail ?? '',
    contactPhone: college.contactPhone ?? '',
    contractStartDate: college.contractStartDate ?? '',
    contractEndDate: college.contractEndDate ?? '',
    status: college.status,
  }
}

interface CollegeFormDialogProps {
  // null = create mode, a College = edit mode (pre-filled, PATCHes that
  // college's id). One component instead of two (AddCollegeDialog/
  // EditCollegeDialog) — the form is identical field-for-field, only the
  // submit payload shape and mutation differ, matching this file's own
  // "don't duplicate a form for two call sites that don't actually differ"
  // precedent elsewhere in the codebase (CreateQuestionPage's single flat
  // schema instead of a discriminated union per type).
  college: College | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CollegeFormDialog({ college, open, onOpenChange }: CollegeFormDialogProps) {
  const isEditMode = college !== null
  const createCollege = useCreateCollege()
  const updateCollege = useUpdateCollege()
  const mutation = isEditMode ? updateCollege : createCollege

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CollegeFormValues>({
    resolver: zodResolver(collegeFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  // Re-syncs the form whenever a different college is opened for editing
  // (or the dialog reopens in create mode) — the dialog component instance
  // persists across opens (CollegeListPage renders it once, toggling
  // `open`), so defaultValues alone (only read on first mount) isn't
  // enough here.
  useEffect(() => {
    if (open) {
      reset(college ? collegeToFormValues(college) : EMPTY_VALUES)
    }
  }, [open, college, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      mutation.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    const shared = {
      name: values.name,
      code: values.code,
      logoUrl: values.logoUrl || undefined,
      address: values.address || undefined,
      contactEmail: values.contactEmail || undefined,
      contactPhone: values.contactPhone || undefined,
      contractStartDate: values.contractStartDate || undefined,
      contractEndDate: values.contractEndDate || undefined,
    }

    if (isEditMode) {
      updateCollege.mutate(
        { id: college.id, input: { ...shared, status: values.status } },
        { onSuccess: () => handleClose(false) },
      )
    } else {
      createCollege.mutate(shared, { onSuccess: () => handleClose(false) })
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit College' : 'Add College'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? `Update ${college.name}'s details.`
              : 'Creates a new college. Only name and code are required — the rest can be filled in later.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="collegeName" className="text-sm font-medium text-brand-primary">
                Name
              </label>
              <Input id="collegeName" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="collegeCode" className="text-sm font-medium text-brand-primary">
                Code
              </label>
              <Input id="collegeCode" {...register('code')} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
          </div>

          {isEditMode && (
            <div className="space-y-1.5">
              <label htmlFor="collegeStatus" className="text-sm font-medium text-brand-primary">
                Status
              </label>
              <select id="collegeStatus" className={inputClassName} {...register('status')}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="collegeAddress" className="text-sm font-medium text-brand-primary">
              Address <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="collegeAddress" {...register('address')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="collegeContactEmail" className="text-sm font-medium text-brand-primary">
                Contact Email <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="collegeContactEmail" type="email" {...register('contactEmail')} />
              {errors.contactEmail && (
                <p className="text-xs text-destructive">{errors.contactEmail.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="collegeContactPhone" className="text-sm font-medium text-brand-primary">
                Contact Phone <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="collegeContactPhone" {...register('contactPhone')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="collegeLogoUrl" className="text-sm font-medium text-brand-primary">
              Logo URL <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="collegeLogoUrl" type="url" {...register('logoUrl')} />
            {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="collegeContractStart"
                className="text-sm font-medium text-brand-primary"
              >
                Contract Start <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="collegeContractStart" type="date" {...register('contractStartDate')} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="collegeContractEnd" className="text-sm font-medium text-brand-primary">
                Contract End <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input id="collegeContractEnd" type="date" {...register('contractEndDate')} />
            </div>
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : `Failed to ${isEditMode ? 'update' : 'create'} college. Please try again.`}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? isEditMode
                  ? 'Saving…'
                  : 'Creating…'
                : isEditMode
                  ? 'Save Changes'
                  : 'Add College'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
