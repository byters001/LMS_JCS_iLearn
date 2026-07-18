import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBatchAssessmentParticipation } from '@/features/analytics/api'
import { AssessmentStatusBadge } from '@/features/assessments/components/AssessmentStatusBadge'
import type { AssessmentStatus } from '@/features/assessments/types'
import { AddStudentsDialog } from '@/features/students/components/AddStudentsDialog'
import { DownloadCsvDialog } from '@/features/students/components/DownloadCsvDialog'
import { StudentRosterTable } from '@/features/students/components/StudentRosterTable'
import { useStudentProfiles } from '@/features/students/api'
import { useMyBatches } from '../api'
import { BatchCard } from '../components/BatchCard'
import type { Batch } from '../types'

const PAGE_SIZE = 20
const STUDENTS_PAGE_SIZE = 20

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
//
// item 10 part 1 — the selected-batch reveal now holds TWO views (its
// student roster, already built above, and its assessment participation,
// new here), so it's switched to Tabs rather than stacking both under one
// heading — a real "pick one of two parallel views for the same batch"
// choice, unlike QuestionListPage's type->difficulty->list drill-down
// (that one is genuinely sequential/hierarchical, so Collapsible-reveal
// stayed right there). Clicking a participation row navigates to
// BatchPerformancePage (features/analytics) with ?batchId=&assessmentId=
// pre-filled — same query-param pre-fill pattern CreateQuestionPage's
// ?type=&difficulty= already established, reusing that page's existing
// per-student table + charts instead of duplicating them here.
//
// item 10 tier 2 — the Students tab's table (Edit/Archive actions) is now
// StudentRosterTable, shared verbatim with StudentListPage.tsx rather than
// forked a second time (see that component's own module comment for the
// full "why one shared component" + archive-safety reasoning).
export default function MyBatchesPage() {
  const [page, setPage] = useState(1)
  const [addStudentsBatch, setAddStudentsBatch] = useState<Batch | null>(null)
  const [downloadCsvBatch, setDownloadCsvBatch] = useState<Batch | null>(null)
  // Batch-scoped student drill-down (fix-doc item 6) — same
  // selectedId/page state shape as StudentListPage's college browser.
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [studentsPage, setStudentsPage] = useState(1)
  const [includeArchivedStudents, setIncludeArchivedStudents] = useState(false)
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
    {
      batchId: selectedBatchId ?? '',
      page: studentsPage,
      pageSize: STUDENTS_PAGE_SIZE,
      includeArchived: includeArchivedStudents,
    },
    { enabled: selectedBatchId !== null },
  )

  // item 10 part 1 — participation ratio per assessment assigned to the
  // selected batch (analytics.service.ts's new getBatchAssessmentParticipation,
  // GET /analytics/batches/:batchId/assessments).
  const participation = useBatchAssessmentParticipation(selectedBatchId ?? undefined)

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
            <Tabs defaultValue="students">
              <TabsList>
                <TabsTrigger value="students">Students</TabsTrigger>
                <TabsTrigger value="assessments">Assessment Participation</TabsTrigger>
              </TabsList>

              <TabsContent value="students" className="space-y-4 pt-4">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Students in {selectedBatch.name}
                </h2>

                <StudentRosterTable
                  studentsQuery={students}
                  page={studentsPage}
                  onPageChange={setStudentsPage}
                  includeArchived={includeArchivedStudents}
                  onIncludeArchivedChange={setIncludeArchivedStudents}
                  emptyMessage="No students enrolled in this batch yet."
                />
              </TabsContent>

              {/* item 10 part 1 — one row per scheduled/live/completed
                  assessment assigned to this batch, with its participation
                  ratio (analytics.service.ts's getBatchAssessmentParticipation).
                  Clicking a row is the "drill into one assessment" step:
                  navigates to BatchPerformancePage pre-filled via
                  ?batchId=&assessmentId=, which reuses getBatchPerformance's
                  existing per-student table + Pass/Fail pie chart + score
                  histogram — none of that is rebuilt here. */}
              <TabsContent value="assessments" className="space-y-4 pt-4">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Assessment Participation — {selectedBatch.name}
                </h2>

                {participation.isPending && (
                  <div className="space-y-2" role="status" aria-label="Loading assessment participation">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                )}

                {participation.isError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {participation.error instanceof ApiError
                      ? participation.error.message
                      : 'Failed to load assessment participation. Please try again.'}
                  </div>
                )}

                {participation.data && (
                  <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="pl-4">Assessment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Attempted / Total</TableHead>
                          <TableHead className="pr-4">Participation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {participation.data.assessments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                              No scheduled, live, or completed assessments assigned to this batch yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          participation.data.assessments.map((row) => (
                            <TableRow key={row.assessmentId} className="hover:bg-muted/30">
                              <TableCell className="pl-4 font-medium">
                                <Link
                                  to={`/trainer/analytics?batchId=${selectedBatch.id}&assessmentId=${row.assessmentId}`}
                                  className="text-brand-primary hover:underline"
                                >
                                  {row.assessmentTitle}
                                </Link>
                              </TableCell>
                              <TableCell>
                                <AssessmentStatusBadge status={row.status as AssessmentStatus} />
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {row.studentsAttempted} / {row.totalStudents}
                              </TableCell>
                              <TableCell className="pr-4 text-muted-foreground">
                                {row.participationRate !== null
                                  ? `${Math.round(row.participationRate * 100)}%`
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
