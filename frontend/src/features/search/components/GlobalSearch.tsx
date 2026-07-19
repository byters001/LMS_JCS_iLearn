import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssessments } from '@/features/assessments/api'
import { useQuestionPools, useQuestionsWithText } from '@/features/question-bank/api'
import { useStudentProfiles } from '@/features/students/api'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300
const RESULTS_PER_CATEGORY = 5

interface GlobalSearchProps {
  // /admin or /trainer — assessments/questions/pools are registered under
  // BOTH prefixes with identical relative shapes (routes/index.tsx), so the
  // same component works for both layouts by just varying this. Students
  // has no per-row detail route under EITHER prefix (StudentListPage is a
  // college-wise browser, not a per-student page — confirmed by reading
  // routes/index.tsx directly, not assumed), so student results render as
  // plain info rows, not links, regardless of basePath.
  basePath: '/admin' | '/trainer'
}

// Item 5a — the topbar search input (AdminLayout.tsx/TrainerLayout.tsx) was
// a bare, unwired <Input>, exactly as flagged: no value/onChange/onSubmit,
// a pure visual shell. What it should search was NOT a guess: all four
// nouns in its own placeholder ("Search students, assessments, questions,
// pools…") already have a real, working `search` query param on their
// respective backend list endpoints (GET /student-profiles, /assessments,
// /questions, /question-pools — confirmed directly against each repository:
// ilike() filters on users.fullName/rollNumber, assessments.title,
// question_versions.questionText via join, and question_pools.name,
// respectively). Only the frontend types/hooks and this component were
// missing — some of those types even had comments actively (and, per this
// investigation, wrongly) claiming no search param existed.
export function GlobalSearch({ basePath }: GlobalSearchProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const isSearchActive = debouncedQuery.length >= MIN_QUERY_LENGTH

  const students = useStudentProfiles(
    { search: debouncedQuery, page: 1, pageSize: RESULTS_PER_CATEGORY },
    { enabled: isSearchActive },
  )
  const assessments = useAssessments(
    { search: debouncedQuery, page: 1, pageSize: RESULTS_PER_CATEGORY },
    { enabled: isSearchActive },
  )
  // Enriched (id/type/difficulty/status/questionText), not the bare
  // useQuestions hook — GET /questions never returns question text itself
  // (it lives on question_versions), so a search result with no visible
  // text to confirm the match against would be useless here. Bounded to
  // RESULTS_PER_CATEGORY (5) follow-up detail fetches, same accepted
  // tradeoff QuestionListPage's own useQuestionsWithText already makes in
  // production.
  const questions = useQuestionsWithText(
    { search: debouncedQuery, page: 1, pageSize: RESULTS_PER_CATEGORY },
    { enabled: isSearchActive },
  )
  const pools = useQuestionPools(
    { search: debouncedQuery, page: 1, pageSize: RESULTS_PER_CATEGORY },
    { enabled: isSearchActive },
  )

  // Best-effort, not all-or-nothing: a category a role can't reach (e.g. a
  // permission this caller lacks) simply contributes zero results rather
  // than failing the whole widget — .data is read directly, .isError on any
  // one category is never surfaced as a blocking error here.
  const studentResults = students.data?.items ?? []
  const assessmentResults = assessments.data?.items ?? []
  const questionResults = questions.items
  const poolResults = pools.data?.items ?? []

  const isLoading =
    isSearchActive &&
    (students.isPending || assessments.isPending || questions.isPending || pools.isPending)

  const totalResults =
    studentResults.length + assessmentResults.length + questionResults.length + poolResults.length

  function goTo(path: string) {
    navigate(path)
    setIsOpen(false)
    setQuery('')
    setDebouncedQuery('')
  }

  return (
    <div ref={containerRef} className="relative min-w-96">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search students, assessments, questions, pools…"
        className="w-full pl-8"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
      />

      {isOpen && isSearchActive && (
        <div className="absolute left-0 z-20 mt-2 w-full max-w-2xl rounded-lg border border-border bg-background shadow-lg">
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="space-y-2 p-3" role="status" aria-label="Searching">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            )}

            {!isLoading && totalResults === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No matches for &ldquo;{debouncedQuery}&rdquo;.
              </p>
            )}

            {!isLoading && assessmentResults.length > 0 && (
              <ResultGroup label="Assessments">
                {assessmentResults.map((assessment) => (
                  <ResultRow
                    key={assessment.id}
                    title={assessment.title}
                    subtitle={`${assessment.testCategory} · ${assessment.status}`}
                    onClick={() => goTo(`${basePath}/assessments/${assessment.id}/edit`)}
                  />
                ))}
              </ResultGroup>
            )}

            {!isLoading && questionResults.length > 0 && (
              <ResultGroup label="Questions">
                {questionResults.map((question) => (
                  <ResultRow
                    key={question.id}
                    title={question.questionText ?? '(untitled question)'}
                    subtitle={`${question.type} · ${question.difficulty} · ${question.status}`}
                    onClick={() => goTo(`${basePath}/questions/${question.id}`)}
                  />
                ))}
              </ResultGroup>
            )}

            {!isLoading && poolResults.length > 0 && (
              <ResultGroup label="Pools">
                {poolResults.map((pool) => (
                  <ResultRow
                    key={pool.id}
                    title={pool.name}
                    subtitle={pool.type}
                    onClick={() => goTo(`${basePath}/pools/${pool.id}`)}
                  />
                ))}
              </ResultGroup>
            )}

            {!isLoading && studentResults.length > 0 && (
              <ResultGroup label="Students">
                {/* Not clickable — no per-student detail route exists
                    anywhere in this app under either /admin or /trainer
                    (confirmed against routes/index.tsx: StudentListPage is
                    a college-wise browser, not a per-row page). Shown as
                    plain info so the search still surfaces a real match
                    instead of hiding students entirely. */}
                {studentResults.map((student) => (
                  <div key={student.id} className="px-4 py-2.5">
                    <p className="text-sm text-brand-primary">{student.fullName ?? '(no name)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[student.rollNumber, student.collegeName].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                ))}
              </ResultGroup>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-1.5 last:border-b-0">
      <p className="px-4 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  )
}

function ResultRow({
  title,
  subtitle,
  onClick,
}: {
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full px-4 py-2 text-left transition-colors hover:bg-muted/50',
      )}
    >
      <p className="truncate text-sm text-brand-primary">{title}</p>
      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
    </button>
  )
}
