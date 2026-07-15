import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/Combobox'
import { useBatches, useColleges } from '@/features/organization/api'
import { useAuthStore } from '@/store/authStore'
import { useUpdateAssessmentBatches } from '../api'
import type { AssessmentStatus } from '../types'

const BATCH_LOCKED_STATUSES: AssessmentStatus[] = ['live', 'completed', 'archived']

// No trainingProgramId filter here — listBatchesQuerySchema supports one,
// but resolving "the training program this assessment's training session
// belongs to" would need a single-session lookup the trainers module
// doesn't expose (GET /training-sessions is list-only, no /:id route this
// phase — see trainers.routes.ts). Listing all batches for the resolved
// college, paginated, mirrors the same unscoped-discovery precedent
// CreateAssessmentPage's trainingSessionId dropdown already established.
const BATCH_PICKER_PAGE_SIZE = 100
const COLLEGE_PICKER_PAGE_SIZE = 100

interface BatchesEditorProps {
  assessmentId: string
  status: AssessmentStatus
  batchIds: string[]
}

export function BatchesEditor({ assessmentId, status, batchIds }: BatchesEditorProps) {
  const updateBatches = useUpdateAssessmentBatches(assessmentId)
  const isLocked = BATCH_LOCKED_STATUSES.includes(status)

  // GET /batches now requires collegeId, enforced server-side (Phase 2 of
  // the batches work) — a Faculty caller's own activeCollegeId already
  // resolves this with no extra step (they're scoped to one college), but
  // Super Admin's activeCollegeId is null (a global grant, per
  // auth.service.ts's resolveActiveCollegeId), so there's no single default
  // college to fall back to. For that case only, this shows a college
  // picker first — same temporary-stand-in reasoning as
  // BatchListPage.tsx's own picker (no top-bar college switcher exists yet).
  const user = useAuthStore((state) => state.user)
  const [pickedCollegeId, setPickedCollegeId] = useState<string | null>(null)
  const collegeId = user?.activeCollegeId ?? pickedCollegeId

  const colleges = useColleges(
    { page: 1, pageSize: COLLEGE_PICKER_PAGE_SIZE },
    // Only fetched when actually needed (no activeCollegeId to fall back
    // on) — a Faculty caller never triggers this extra request.
  )
  const collegeOptions = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))

  const batches = useBatches(
    { collegeId: collegeId ?? '', page: 1, pageSize: BATCH_PICKER_PAGE_SIZE },
    { enabled: collegeId !== null },
  )

  // Initialized once from the incoming prop, same convention as every other
  // form on this page (e.g. CreateAssessmentPage's useForm defaultValues) —
  // this component doesn't re-sync mid-session if the parent refetches.
  const [selectedIds, setSelectedIds] = useState<string[]>(batchIds)

  const batchesById = new Map((batches.data?.items ?? []).map((batch) => [batch.id, batch]))

  const addOptions = (batches.data?.items ?? [])
    .filter((batch) => !selectedIds.includes(batch.id))
    .map((batch) => ({ value: batch.id, label: batch.name }))

  const onSave = () => {
    updateBatches.mutate(selectedIds)
  }

  return (
    <div>
      {isLocked ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Batches can only be changed before an assessment goes live — this assessment&apos;s
          status is &quot;{status}&quot;.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Search and add every batch authorized to take this assessment. Saving replaces the
            entire current list.
          </p>

          {selectedIds.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {selectedIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-brand-primary"
                >
                  <span>{batchesById.get(id)?.name ?? id}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${batchesById.get(id)?.name ?? id}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setSelectedIds((prev) => prev.filter((existing) => existing !== id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Only Super Admin ever sees this — Faculty's own activeCollegeId
              already resolves `collegeId` above with no picker needed. */}
          {user?.activeCollegeId == null && (
            <Combobox
              id="batchesEditorCollegePicker"
              options={collegeOptions}
              value={pickedCollegeId}
              onSelect={setPickedCollegeId}
              placeholder="Select a college to browse its batches…"
              isLoading={colleges.isPending}
              isError={colleges.isError}
              errorMessage="Failed to load colleges."
            />
          )}

          <Combobox
            id="batchPicker"
            options={addOptions}
            value={null}
            onSelect={(value) => setSelectedIds((prev) => [...prev, value])}
            placeholder={collegeId ? 'Search batches by name to add…' : 'Select a college first'}
            disabled={collegeId === null}
            isLoading={batches.isPending}
            isError={batches.isError}
            errorMessage="Failed to load batches."
            emptyMessage={
              collegeId === null
                ? 'Select a college first.'
                : batches.isPending
                  ? 'Loading…'
                  : addOptions.length === 0 && (batches.data?.items.length ?? 0) > 0
                    ? 'All available batches are already added.'
                    : 'No batches found.'
            }
          />

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
          <Button type="button" size="sm" disabled={updateBatches.isPending} onClick={onSave}>
            {updateBatches.isPending ? 'Saving…' : 'Save Batches'}
          </Button>
        </div>
      )}
    </div>
  )
}
