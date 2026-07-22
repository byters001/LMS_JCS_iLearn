import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/Combobox'
import { cn } from '@/lib/utils'
import { useBatches, useColleges, useMyBatches } from '@/features/organization/api'
import { useAuthStore } from '@/store/authStore'
import { useUpdateAssessmentBatches } from '../api'
import type { AssessmentStatus } from '../types'

const BATCH_LOCKED_STATUSES: AssessmentStatus[] = ['live', 'completed', 'archived']

// Order-independent comparison — selectedIds accumulates in whatever order
// batches were picked in, which has no relation to batchIds' (the
// persisted prop's) order, so a plain array/JSON comparison would false-
// positive "unsaved changes" on nothing but ordering.
function haveSameBatchIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((id) => setA.has(id))
}

// No trainingProgramId filter here — listBatchesQuerySchema supports one,
// but resolving "the training program this assessment's training session
// belongs to" would need a single-session lookup the trainers module
// doesn't expose (GET /training-sessions is list-only, no /:id route this
// phase — see trainers.routes.ts). Listing all batches for the resolved
// college, paginated, mirrors the same unscoped-discovery precedent
// CreateAssessmentPage's trainingSessionId dropdown already established.
const BATCH_PICKER_PAGE_SIZE = 100
const COLLEGE_PICKER_PAGE_SIZE = 100
// A trainer is realistically assigned to a handful of batches — same
// "just fetch it all in one page" call as the two picker sizes above, not
// real pagination for a dropdown.
const MY_BATCHES_PICKER_PAGE_SIZE = 100

interface BatchesEditorProps {
  assessmentId: string
  status: AssessmentStatus
  batchIds: string[]
}

// Two genuinely different flows by role, not one flow with a conditional
// field:
//
// - Super Admin: UNCHANGED college-then-batch browse, same data scope as
//   before (every batch, every college) — GET /batches requires a real
//   collegeId server-side (listBatchesQuerySchema has no optional variant,
//   confirmed by reading it directly) and there's no unscoped/all-colleges
//   batch-listing endpoint to switch to instead, so there's no "cleaner
//   single picker" actually available for this role without inventing new
//   backend surface. Left as-is rather than faking a single-picker UX that
//   would either silently narrow Super Admin's real scope or require that
//   new endpoint — out of scope for this fix.
//
// - Faculty: single picker over GET /batches/mine (self-scoped from the
//   caller's own JWT id, permission-free — organization.routes.ts, not
//   gated by colleges.view at all) instead of the old college-picker ->
//   GET /batches?collegeId=... two-step. This is what was actually 403ing
//   for Faculty (colleges.view was only ever granted to super_admin — see
//   this fix's own writeup) — GET /batches/mine sidesteps that gap
//   entirely rather than patching it, per the brief. Its query
//   (organization.repository.ts's listMyBatches) already joins
//   batches -> training_programs -> colleges/departments, the same chain
//   organizationService.listBatchAssignmentsForTrainers performs, so
//   collegeName arrives resolved with no separate lookup and no new
//   endpoint was needed on top of the existing self-service one.
export function BatchesEditor({ assessmentId, status, batchIds }: BatchesEditorProps) {
  const updateBatches = useUpdateAssessmentBatches(assessmentId)
  const isLocked = BATCH_LOCKED_STATUSES.includes(status)

  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false

  const [pickedCollegeId, setPickedCollegeId] = useState<string | null>(null)
  const colleges = useColleges(
    { page: 1, pageSize: COLLEGE_PICKER_PAGE_SIZE },
    { enabled: isSuperAdmin },
  )
  const collegeOptions = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))
  const adminBatches = useBatches(
    { collegeId: pickedCollegeId ?? '', page: 1, pageSize: BATCH_PICKER_PAGE_SIZE },
    { enabled: isSuperAdmin && pickedCollegeId !== null },
  )

  const myBatches = useMyBatches(
    { page: 1, pageSize: MY_BATCHES_PICKER_PAGE_SIZE },
    { enabled: !isSuperAdmin },
  )

  // Whichever source is actually active for this caller's role — the rest
  // of this component (chips, add-picker options) reads from this single
  // list rather than branching on isSuperAdmin a second time.
  const availableBatches = isSuperAdmin ? (adminBatches.data?.items ?? []) : (myBatches.data?.items ?? [])
  const isBatchListPending = isSuperAdmin ? adminBatches.isPending : myBatches.isPending
  const isBatchListError = isSuperAdmin ? adminBatches.isError : myBatches.isError

  // Initialized once from the incoming prop, same convention as every other
  // form on this page (e.g. CreateAssessmentPage's useForm defaultValues) —
  // this component doesn't re-sync mid-session if the parent refetches.
  const [selectedIds, setSelectedIds] = useState<string[]>(batchIds)

  // Item 8A follow-up: picking a batch only ever updated this local state —
  // nothing persisted until "Save Batches" was clicked separately, and
  // there was no visual difference between "picked, not yet saved" and
  // "actually saved." That's exactly how two real assessments went live
  // with zero batches attached (confirmed against the live DB). Comparing
  // against the CURRENT batchIds prop (not a frozen initial snapshot)
  // means this correctly clears itself once useUpdateAssessmentBatches's
  // onSuccess invalidates the assessment query and the parent re-renders
  // with the just-saved batchIds.
  const hasUnsavedChanges = !haveSameBatchIds(selectedIds, batchIds)

  const batchesById = new Map(availableBatches.map((batch) => [batch.id, batch]))

  const addOptions = availableBatches
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
            {isSuperAdmin
              ? 'Search and add every batch authorized to take this assessment. Saving replaces the entire current list.'
              : 'Add from your own assigned batches. Saving replaces the entire current list.'}
          </p>

          {selectedIds.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {selectedIds.map((id) => {
                const batch = batchesById.get(id)
                return (
                  <li
                    key={id}
                    className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-brand-primary"
                  >
                    {/* College name shown automatically alongside the batch,
                        read-only, derived from the batch's own
                        training_program -> college relationship — not a
                        separate field the caller has to pick. */}
                    <span>
                      {batch?.name ?? id}
                      {batch?.collegeName && (
                        <span className="font-normal text-muted-foreground"> · {batch.collegeName}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${batch?.name ?? id}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setSelectedIds((prev) => prev.filter((existing) => existing !== id))}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {isSuperAdmin ? (
            <>
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

              <Combobox
                id="batchPicker"
                options={addOptions}
                value={null}
                onSelect={(value) => setSelectedIds((prev) => [...prev, value])}
                placeholder={pickedCollegeId ? 'Search batches by name to add…' : 'Select a college first'}
                disabled={pickedCollegeId === null}
                isLoading={isBatchListPending}
                isError={isBatchListError}
                errorMessage="Failed to load batches."
                emptyMessage={
                  pickedCollegeId === null
                    ? 'Select a college first.'
                    : isBatchListPending
                      ? 'Loading…'
                      : addOptions.length === 0 && availableBatches.length > 0
                        ? 'All available batches are already added.'
                        : 'No batches found.'
                }
              />
            </>
          ) : (
            // Single picker over the caller's own assigned batches — no
            // college browse step (see this component's module comment).
            <Combobox
              id="batchPicker"
              options={addOptions}
              value={null}
              onSelect={(value) => setSelectedIds((prev) => [...prev, value])}
              placeholder="Search your assigned batches to add…"
              isLoading={isBatchListPending}
              isError={isBatchListError}
              errorMessage="Failed to load your assigned batches."
              emptyMessage={
                isBatchListPending
                  ? 'Loading…'
                  : addOptions.length === 0 && availableBatches.length > 0
                    ? 'All your assigned batches are already added.'
                    : 'You have no assigned batches yet — contact an admin to get assigned to one.'
              }
            />
          )}

          {updateBatches.isError && (
            <p className="text-xs text-destructive">
              {updateBatches.error instanceof ApiError
                ? updateBatches.error.message
                : 'Failed to save batches.'}
            </p>
          )}
          {/* Suppressed once new unsaved edits exist — otherwise a stale
              "Saved" from a previous save would sit next to the warning
              below, claiming the CURRENT (not-yet-persisted) selection is
              already saved when it isn't. */}
          {updateBatches.isSuccess && !hasUnsavedChanges && (
            <p className="text-xs font-medium text-green-600 dark:text-green-500">Saved</p>
          )}
          {hasUnsavedChanges && !updateBatches.isPending && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
              You have unsaved batch changes — click &quot;Save Batches&quot; to apply them.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={updateBatches.isPending}
            onClick={onSave}
            className={cn(
              hasUnsavedChanges &&
                !updateBatches.isPending &&
                'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500/50',
            )}
          >
            {updateBatches.isPending ? 'Saving…' : hasUnsavedChanges ? 'Save Batches *' : 'Save Batches'}
          </Button>
        </div>
      )}
    </div>
  )
}
