import { ChevronDown, UserCheck, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useColleges } from '@/features/organization/api'
import { cn } from '@/lib/utils'
import { useStudentCountsByCollege, useStudentProfiles } from '../api'
import { StudentRosterTable } from '../components/StudentRosterTable'

const PAGE_SIZE = 20
// Colleges are a platform-wide, slow-growing entity, not paginated in the UI
// anywhere else either — same "small enough to just fetch in one page" call
// as BatchListPage.tsx's own COLLEGE_PICKER_PAGE_SIZE.
const COLLEGE_PAGE_SIZE = 100

// Reuses the exact accent colors StudentRosterTable's own StatusBadge
// already uses for 'active'/'archived' (brand-accent / muted) — no new
// colors invented, per CLAUDE1.md's "never invent brand colors" rule.
// Total gets brand-primary, matching its role as the headline number.
function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string
  value: number | undefined
  icon: typeof Users
  iconClassName: string
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', iconClassName)}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="font-heading text-2xl font-semibold text-foreground">
            {value === undefined ? (
              <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
            ) : (
              value
            )}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  )
}

export default function StudentListPage() {
  const [selectedCollegeId, setSelectedCollegeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [includeArchived, setIncludeArchived] = useState(false)

  // Platform-wide, not scoped to the selected college: this row is meant to
  // orient the user BEFORE they pick a college (and stays stable while
  // browsing between colleges), rather than duplicate the number already
  // shown on the clicked card itself. A per-college version of this exact
  // row would just repeat what the card grid below already displays.
  const activeCountQuery = useStudentProfiles({ page: 1, pageSize: 1 })
  const allCountQuery = useStudentProfiles({ page: 1, pageSize: 1, includeArchived: true })
  const activeCount = activeCountQuery.data?.total
  const totalCount = allCountQuery.data?.total
  const archivedCount =
    totalCount !== undefined && activeCount !== undefined ? totalCount - activeCount : undefined

  const colleges = useColleges({ page: 1, pageSize: COLLEGE_PAGE_SIZE })
  const collegeItems = colleges.data?.items ?? []
  const { countsByCollegeId } = useStudentCountsByCollege(collegeItems.map((college) => college.id))
  const selectedCollege = collegeItems.find((college) => college.id === selectedCollegeId)

  function handleSelectCollege(collegeId: string) {
    if (selectedCollegeId === collegeId) {
      setSelectedCollegeId(null)
    } else {
      setSelectedCollegeId(collegeId)
      setPage(1)
    }
  }

  const students = useStudentProfiles(
    { collegeId: selectedCollegeId ?? '', page, pageSize: PAGE_SIZE, includeArchived },
    { enabled: selectedCollegeId !== null },
  )

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every student profile across your platform, browsable college by college.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total students"
          value={totalCount}
          icon={Users}
          iconClassName="bg-brand-primary/10 text-brand-primary"
        />
        <StatCard
          label="Active"
          value={activeCount}
          icon={UserCheck}
          iconClassName="bg-brand-accent/10 text-brand-accent"
        />
        <StatCard
          label="Archived"
          value={archivedCount}
          icon={UserX}
          iconClassName="bg-muted text-muted-foreground"
        />
      </div>

      <div>
        <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Colleges
        </h2>

        {colleges.isPending && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Loading colleges"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {colleges.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load colleges. Please try again.
          </div>
        )}

        {colleges.data && collegeItems.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No colleges found.
          </p>
        )}

        {colleges.data && collegeItems.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collegeItems.map((college) => {
              const isSelected = selectedCollegeId === college.id
              const count = countsByCollegeId.get(college.id)
              return (
                <button
                  key={college.id}
                  type="button"
                  aria-expanded={isSelected}
                  onClick={() => handleSelectCollege(college.id)}
                  className={cn(
                    'rounded-xl border bg-card p-3.5 text-left shadow-sm transition-shadow hover:shadow-md',
                    isSelected ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-border',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-foreground">{college.name}</p>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        isSelected && 'rotate-180',
                      )}
                    />
                  </div>
                  <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
                    {count === undefined ? (
                      <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted align-middle" />
                    ) : (
                      count
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    student{count === 1 ? '' : 's'}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Reveals below the card grid rather than inline within a card (the
          existing table needs full page width, not a grid cell) — same
          Collapsible primitive AdminLayout's sidebar "Question Bank" nav
          group already uses for its own expand/collapse, the closest real
          expand-caret precedent actually in this codebase (BatchListPage
          has no expand/caret at all — it's a flat grid gated by a college
          Combobox — and PoolListPage's "detail" is a separate route, not an
          inline split panel; neither of those two referenced patterns
          exists yet, so this reuses the one that genuinely does). */}
      <Collapsible open={selectedCollegeId !== null}>
        <CollapsibleContent className="space-y-4">
          {selectedCollege && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Students at {selectedCollege.name}
              </h2>

              <StudentRosterTable
                studentsQuery={students}
                page={page}
                onPageChange={setPage}
                includeArchived={includeArchived}
                onIncludeArchivedChange={setIncludeArchived}
                emptyMessage="No students found for this college yet."
              />
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
