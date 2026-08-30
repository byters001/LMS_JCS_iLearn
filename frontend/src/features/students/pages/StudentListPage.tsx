import { motion } from 'framer-motion'
import { Building2, ChevronDown, Search, UserCheck, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { useBatchCountsByCollege, useColleges } from '@/features/organization/api'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { STAT_CONTAINER_VARIANTS, STAT_ITEM_VARIANTS, STATIC_VARIANTS } from '@/lib/motion'
import { CARD_GRADIENT, cn } from '@/lib/utils'
import { useStudentCountsByCollege, useStudentProfiles } from '../api'
import { StudentRosterTable } from '../components/StudentRosterTable'

const PAGE_SIZE = 20
// Colleges are a platform-wide, slow-growing entity, not paginated in the UI
// anywhere else either — same "small enough to just fetch in one page" call
// as BatchListPage.tsx's own COLLEGE_PICKER_PAGE_SIZE.
const COLLEGE_PAGE_SIZE = 100

export default function StudentListPage() {
  const [selectedCollegeId, setSelectedCollegeId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [collegeSearch, setCollegeSearch] = useState('')
  const prefersReducedMotion = usePrefersReducedMotion()

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
  const { batchCountsByCollegeId } = useBatchCountsByCollege(collegeItems.map((college) => college.id))
  const selectedCollege = collegeItems.find((college) => college.id === selectedCollegeId)

  const normalizedSearch = collegeSearch.trim().toLowerCase()
  const filteredCollegeItems = normalizedSearch
    ? collegeItems.filter((college) => college.name.toLowerCase().includes(normalizedSearch))
    : collegeItems

  // "Students by college" ranked list — only worth showing once there's
  // more than one college to compare, and only once every college's count
  // has actually loaded (rendering zeros while useStudentCountsByCollege's
  // per-college queries are still in flight would flash a misleading
  // all-zero list before the real numbers pop in). Previously filtered out
  // a set of known dev-DB test colleges by name heuristic; that's gone now
  // that those rows (BYTER, Test College 54206b79, Test College c8572698)
  // were actually deleted from the database — every college returned here
  // is real, so it just shows all of them.
  const chartData = collegeItems
    .map((college) => ({ id: college.id, name: college.name, students: countsByCollegeId.get(college.id) }))
    .sort((a, b) => (b.students ?? 0) - (a.students ?? 0))
  const chartReady = chartData.every((row) => row.students !== undefined)
  // Each row's mini-bar is scaled against the actual largest value in THIS
  // (filtered) set, not a fixed/default axis range — so the largest college
  // always fills the full width and there's no artificial dead space, the
  // same "domain=dataMax, not a hardcoded max" principle a Recharts axis
  // would need, just expressed as a width percentage instead of an axis
  // domain since this isn't an axis chart anymore (see the widget's own
  // comment below for why).
  const chartMax = Math.max(1, ...chartData.map((row) => row.students ?? 0))

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
      <PageHeader
        title="Students"
        description="Every student profile across your platform, browsable college by college."
      >
        <motion.div
          initial="hidden"
          animate="show"
          variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_CONTAINER_VARIANTS}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Total students"
              value={totalCount}
              icon={Users}
              iconClassName="bg-brand-primary/10 text-brand-primary"
              accent="indigo"
              progress={
                activeCount !== undefined && totalCount !== undefined
                  ? { value: activeCount, total: totalCount }
                  : undefined
              }
            />
          </motion.div>
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Active"
              value={activeCount}
              icon={UserCheck}
              iconClassName="bg-brand-accent/10 text-brand-accent"
              accent="teal"
            />
          </motion.div>
          <motion.div variants={prefersReducedMotion ? STATIC_VARIANTS : STAT_ITEM_VARIANTS}>
            <StatCard
              label="Archived"
              value={archivedCount}
              icon={UserX}
              iconClassName="bg-muted text-muted-foreground"
              accent="coral"
            />
          </motion.div>
        </motion.div>
      </PageHeader>

      {/* Ranked list + inline mini-bar (GitHub language-breakdown style),
          not a full Recharts axis chart — this is 3-6 categories with a
          huge value disparity (real colleges in the 180s, next to
          near-zero ones once test colleges are filtered out below). An
          axis/gridline chart forces every bar to fight for legibility
          against the same linear scale, so a real-but-small college would
          STILL read as "basically zero, probably broken" even with a
          correct domain — a plain number next to a proportional bar
          doesn't have that problem, since the exact count is always
          directly readable regardless of bar length. */}
      {chartData.length > 1 && (
        <Card className="p-4">
          <h2 className="font-heading text-sm font-semibold text-brand-primary">Students by college</h2>
          {chartReady ? (
            <div className="mt-3 space-y-2.5">
              {chartData.map((row) => (
                <div key={row.id} className="flex items-center gap-3">
                  <p className="w-36 shrink-0 truncate text-sm text-foreground" title={row.name}>
                    {row.name}
                  </p>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand-accent"
                      style={{ width: `${((row.students ?? 0) / chartMax) * 100}%` }}
                    />
                  </div>
                  <p className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                    {row.students}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="mt-3 h-24 animate-pulse rounded-lg bg-muted"
              role="status"
              aria-label="Loading chart"
            />
          )}
        </Card>
      )}

      <div>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Colleges
          </h2>
          <div className="relative w-full max-w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter colleges…"
              className="w-full pl-8"
              value={collegeSearch}
              onChange={(event) => setCollegeSearch(event.target.value)}
            />
          </div>
        </div>

        {colleges.isPending && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
            aria-label="Loading colleges"
          >
            {Array.from({ length: 4 }).map((_, i) => (
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
          <EmptyState icon={Building2} message="No colleges found." />
        )}

        {colleges.data && collegeItems.length > 0 && filteredCollegeItems.length === 0 && (
          <EmptyState icon={Search} message={`No colleges match "${collegeSearch}".`} />
        )}

        {colleges.data && filteredCollegeItems.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCollegeItems.map((college) => {
              const isSelected = selectedCollegeId === college.id
              const count = countsByCollegeId.get(college.id)
              const batchCount = batchCountsByCollegeId.get(college.id)
              return (
                <button
                  key={college.id}
                  type="button"
                  aria-expanded={isSelected}
                  onClick={() => handleSelectCollege(college.id)}
                  className={cn(
                    'rounded-lg border bg-card p-3.5 text-left shadow-sm transition-shadow hover:shadow-md',
                    CARD_GRADIENT,
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {batchCount === undefined ? (
                      <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted align-middle" />
                    ) : (
                      `${batchCount} batch${batchCount === 1 ? '' : 'es'}`
                    )}
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
