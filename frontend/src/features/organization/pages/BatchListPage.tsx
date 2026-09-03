import { Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Combobox } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { AddStudentsDialog } from '@/features/students/components/AddStudentsDialog'
import { DownloadCsvDialog } from '@/features/students/components/DownloadCsvDialog'
import { useAuthStore } from '@/store/authStore'
import { useBatches, useColleges, useDepartments, useToggleBatchActive } from '../api'
import { AssignTrainerDialog } from '../components/AssignTrainerDialog'
import { BatchCard } from '../components/BatchCard'
import { DeleteBatchDialog } from '../components/DeleteBatchDialog'
import { EditBatchDialog } from '../components/EditBatchDialog'
import type { Batch } from '../types'

const PAGE_SIZE = 20
// Generous upper bound for the college picker below — colleges are a
// platform-wide, slow-growing entity (not paginated in the UI at all here),
// same "small enough to just fetch in one page" call as BatchesEditor.tsx's
// own BATCH_PICKER_PAGE_SIZE.
const COLLEGE_PICKER_PAGE_SIZE = 100

export default function BatchListPage() {
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false

  const [collegeId, setCollegeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [addStudentsBatch, setAddStudentsBatch] = useState<Batch | null>(null)
  const [downloadCsvBatch, setDownloadCsvBatch] = useState<Batch | null>(null)
  const [assignTrainerBatch, setAssignTrainerBatch] = useState<Batch | null>(null)
  const [editBatch, setEditBatch] = useState<Batch | null>(null)
  const [deleteBatch, setDeleteBatch] = useState<Batch | null>(null)

  const colleges = useColleges({ page: 1, pageSize: COLLEGE_PICKER_PAGE_SIZE })
  const collegeOptions = (colleges.data?.items ?? []).map((college) => ({
    value: college.id,
    label: college.name,
  }))

  const batches = useBatches(
    { collegeId: collegeId ?? '', page, pageSize: PAGE_SIZE },
    { enabled: collegeId !== null },
  )
  const toggleActive = useToggleBatchActive()

  // Every batch on this page already belongs to the one selected college,
  // so one departments fetch (for the Download CSV dialog's department
  // filter) covers all of them — no per-card fetch needed.
  const departments = useDepartments(
    { collegeId: collegeId ?? '', page: 1, pageSize: 100 },
    { enabled: collegeId !== null },
  )
  const departmentOptions = (departments.data?.items ?? []).map((department) => ({
    id: department.id,
    name: department.name,
  }))

  const totalPages = batches.data
    ? Math.max(1, Math.ceil(batches.data.total / batches.data.pageSize))
    : 1

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title="Batches"
        description="Training cohorts within a college, grouped by training program."
        actions={
          <Button asChild>
            <Link to="/admin/batches/new">
              <Plus className="size-4" />
              Create Batch
            </Link>
          </Button>
        }
      >
        {/* Temporary stand-in for a real top-bar college switcher —
            explicitly deferred from Phase 1 (it depends on this exact
            scoping work, which didn't exist until now). Once a shared
            switcher exists, this in-page picker goes away and collegeId
            comes from that shared context instead — not a permanent
            design. Total batches is the one number that's both real and
            already fetched for the selected college (same reasoning as
            CollegeListPage's single "Total colleges" card) — null (not 0)
            while no college is picked yet, since that's genuinely no data
            rather than a zero count. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-sm min-w-56 flex-1">
            <p className="mb-1 text-xs font-medium text-muted-foreground">College</p>
            <Combobox
              id="batchListCollegePicker"
              options={collegeOptions}
              value={collegeId}
              onSelect={(value) => {
                setCollegeId(value)
                setPage(1)
              }}
              placeholder="Select a college to view its batches…"
              isLoading={colleges.isPending}
              isError={colleges.isError}
              errorMessage="Failed to load colleges."
            />
          </div>
          <StatCard
            label="Total batches"
            value={collegeId === null ? null : batches.data?.total}
            icon={Layers}
            iconClassName="bg-accent-indigo-bg text-accent-indigo-fg"
            accent="indigo"
            className="max-w-64"
          />
        </div>
      </PageHeader>

      {collegeId === null && <EmptyState message="Select a college above to view its batches." />}

      {collegeId !== null && batches.isPending && (
        <div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading batches"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {collegeId !== null && batches.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          {batches.error instanceof ApiError
            ? batches.error.message
            : 'Failed to load batches. Please try again.'}
        </div>
      )}

      {collegeId !== null && batches.data && batches.data.items.length === 0 && (
        <EmptyState message="No batches found for this college yet." />
      )}

      {collegeId !== null && batches.data && batches.data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {batches.data.items.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                menuItems={[
                  { label: 'Add Students', onSelect: () => setAddStudentsBatch(batch) },
                  { label: 'Download CSV', onSelect: () => setDownloadCsvBatch(batch) },
                  { label: 'Assign Trainer', onSelect: () => setAssignTrainerBatch(batch) },
                  { label: 'Edit', onSelect: () => setEditBatch(batch) },
                  { label: 'Delete', onSelect: () => setDeleteBatch(batch) },
                ]}
                showActiveToggle={isSuperAdmin}
                isTogglingActive={toggleActive.isPending}
                onToggleActive={() => toggleActive.mutate(batch.id)}
              />
            ))}
          </div>

          {toggleActive.isError && (
            <p className="text-sm text-destructive">
              {toggleActive.error instanceof ApiError
                ? toggleActive.error.message
                : 'Failed to update batch status.'}
            </p>
          )}

          <Card className="flex-row items-center justify-between px-3.5 py-2.5">
            <p className="text-sm text-muted-foreground">
              Page {batches.data.page} of {totalPages} &middot; {batches.data.total} batch
              {batches.data.total === 1 ? '' : 'es'}
              {batches.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || batches.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || batches.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </Card>
        </>
      )}

      {addStudentsBatch && (
        <AddStudentsDialog
          batchId={addStudentsBatch.id}
          batchName={addStudentsBatch.name}
          open={addStudentsBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setAddStudentsBatch(null)
          }}
        />
      )}

      {downloadCsvBatch && (
        <DownloadCsvDialog
          batchId={downloadCsvBatch.id}
          batchName={downloadCsvBatch.name}
          departmentOptions={departmentOptions}
          open={downloadCsvBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDownloadCsvBatch(null)
          }}
        />
      )}

      {assignTrainerBatch && (
        <AssignTrainerDialog
          batchId={assignTrainerBatch.id}
          batchName={assignTrainerBatch.name}
          open={assignTrainerBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setAssignTrainerBatch(null)
          }}
        />
      )}

      {editBatch && (
        <EditBatchDialog
          batch={editBatch}
          open={editBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditBatch(null)
          }}
        />
      )}

      {deleteBatch && (
        <DeleteBatchDialog
          batch={deleteBatch}
          open={deleteBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDeleteBatch(null)
          }}
        />
      )}
    </div>
  )
}
