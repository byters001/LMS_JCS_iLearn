import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AddStudentsDialog } from '@/features/students/components/AddStudentsDialog'
import { DownloadCsvDialog } from '@/features/students/components/DownloadCsvDialog'
import { useStudentProfiles } from '@/features/students/api'
import { useMyBatches } from '../api'
import { BatchCard } from '../components/BatchCard'
import type { Batch } from '../types'

const PAGE_SIZE = 20
const STUDENTS_PAGE_SIZE = 20

// Same active/archived accent colors StudentListPage's own StatusBadge
// uses — not duplicating the component itself since it lives in a
// different feature folder (students/ vs organization/) and this page
// shouldn't reach into another feature's page-local component, but the
// colors/shape are identical per fix-doc item 6's "same columns" requirement.
function StudentStatusBadge({ status }: { status: string }) {
  const isActive = status === 'active'
  return (
    <span
      className={
        isActive
          ? 'rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {status}
    </span>
  )
}

// Trainer's "My Batches" — backed by GET /batches/mine (self-scoped
// server-side by the caller's own id via batch_trainers, not a client-side
// filter of listBatches). Reuses BatchCard, same as BatchListPage — no
// duplicated card markup. Add Students / Download CSV are wired in here the
// same way BatchListPage wires them, now that the backend actually
// authorizes them for a Faculty caller who is personally assigned to the
// batch (organizationService.isTrainerAssignedToBatch — see
// students.service.ts's createStudentsInBatch/exportStudentsCsv). No
// active-toggle here: that stays a Super-Admin-only lifecycle action on
// BatchListPage, matching the backend's batches.toggle_active permission.
export default function MyBatchesPage() {
  const [page, setPage] = useState(1)
  const [addStudentsBatch, setAddStudentsBatch] = useState<Batch | null>(null)
  const [downloadCsvBatch, setDownloadCsvBatch] = useState<Batch | null>(null)
  // Batch-scoped student drill-down (fix-doc item 6) — same
  // selectedId/page state shape as StudentListPage's college browser.
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [studentsPage, setStudentsPage] = useState(1)
  const batches = useMyBatches({ page, pageSize: PAGE_SIZE })

  const totalPages = batches.data
    ? Math.max(1, Math.ceil(batches.data.total / batches.data.pageSize))
    : 1

  const selectedBatch = batches.data?.items.find((batch) => batch.id === selectedBatchId)

  function handleSelectBatch(batchId: string) {
    if (selectedBatchId === batchId) {
      setSelectedBatchId(null)
    } else {
      setSelectedBatchId(batchId)
      setStudentsPage(1)
    }
  }

  // Changing the batches page can scroll the selected batch out of the
  // current `items` page (selectedBatch above would go stale/undefined
  // while the Collapsible stays "open") — clearing selection on page change
  // avoids a blank drill-down gap for a batch no longer on screen.
  function goToBatchesPage(nextPage: number) {
    setPage(nextPage)
    setSelectedBatchId(null)
  }

  // batchId is the scope here — training_program_students is how the
  // backend resolves a batch's roster (see students.repository.ts's
  // listStudentProfiles), no new endpoint needed, useStudentProfiles
  // already accepts batchId alongside collegeId.
  const students = useStudentProfiles(
    { batchId: selectedBatchId ?? '', page: studentsPage, pageSize: STUDENTS_PAGE_SIZE },
    { enabled: selectedBatchId !== null },
  )

  const studentsTotalPages = students.data
    ? Math.max(1, Math.ceil(students.data.total / students.data.pageSize))
    : 1

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold text-brand-primary">My Batches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Batches you're currently assigned to as a trainer.
        </p>
      </div>

      {batches.isPending && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading batches"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {batches.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {batches.error instanceof ApiError
            ? batches.error.message
            : 'Failed to load your batches. Please try again.'}
        </div>
      )}

      {batches.data && batches.data.items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          You're not assigned to any batches yet.
        </p>
      )}

      {batches.data && batches.data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.data.items.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                isSelected={selectedBatchId === batch.id}
                onSelect={() => handleSelectBatch(batch.id)}
                menuItems={[
                  { label: 'Add Students', onSelect: () => setAddStudentsBatch(batch) },
                  { label: 'Download CSV', onSelect: () => setDownloadCsvBatch(batch) },
                ]}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {batches.data.page} of {totalPages} &middot; {batches.data.total} batch
              {batches.data.total === 1 ? '' : 'es'}
              {batches.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || batches.isFetching}
                onClick={() => goToBatchesPage(Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || batches.isFetching}
                onClick={() => goToBatchesPage(Math.min(totalPages, page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Batch-scoped student drill-down (fix-doc item 6) — reveals below
          the card grid rather than inline within a card, same Collapsible
          primitive and layout StudentListPage's college-wise student
          browser already uses for its own expand/collapse (see that file's
          own comment for why Collapsible specifically, over the other
          expand patterns already in this codebase). */}
      <Collapsible open={selectedBatchId !== null}>
        <CollapsibleContent className="space-y-4">
          {selectedBatch && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Students in {selectedBatch.name}
              </h2>

              {students.isPending && (
                <div className="space-y-2" role="status" aria-label="Loading students">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              )}

              {students.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {students.error instanceof ApiError
                    ? students.error.message
                    : 'Failed to load students. Please try again.'}
                </div>
              )}

              {students.data && (
                <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="pl-4">Name</TableHead>
                        <TableHead>Roll Number</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>College</TableHead>
                        <TableHead className="pr-4">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.data.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No students enrolled in this batch yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        students.data.items.map((student) => (
                          <TableRow key={student.id} className="hover:bg-muted/30">
                            <TableCell className="pl-4 font-medium text-brand-primary">
                              {student.fullName ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {student.rollNumber ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {student.departmentName ?? '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {student.collegeName ?? '—'}
                            </TableCell>
                            <TableCell className="pr-4">
                              <StudentStatusBadge status={student.status} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      Page {students.data.page} of {studentsTotalPages} &middot; {students.data.total}{' '}
                      student
                      {students.data.total === 1 ? '' : 's'}
                      {students.isFetching ? ' · refreshing…' : ''}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                        disabled={studentsPage <= 1 || students.isFetching}
                        onClick={() => setStudentsPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                        disabled={studentsPage >= studentsTotalPages || students.isFetching}
                        onClick={() => setStudentsPage((p) => Math.min(studentsTotalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

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
          // Unlike BatchListPage (single college context, one shared
          // departments fetch), a trainer's own batches can span multiple
          // colleges and the Batch type here doesn't carry a raw
          // collegeId/departmentId (only display names) — so there's no
          // single department list to fetch. The department filter simply
          // shows "Any department" here; the export itself still works
          // unfiltered-by-department, which is the actual functionality
          // being restored, not a full parity requirement with the Admin
          // view.
          departmentOptions={[]}
          open={downloadCsvBatch !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDownloadCsvBatch(null)
          }}
        />
      )}
    </div>
  )
}
