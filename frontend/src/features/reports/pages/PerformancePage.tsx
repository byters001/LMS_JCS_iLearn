import { PageHeader } from '@/components/ui/PageHeader'
import PerformanceAnalyticsSection from '../components/PerformanceAnalyticsSection'
import ScoreHistoryTable from '../components/ScoreHistoryTable'

// New dedicated route (/student/performance). Two pieces:
//   a) PerformanceAnalyticsSection — the existing points-over-time chart,
//      reused entirely as-is (same component, same file, untouched). It
//      previously lived embedded at the top of StudentAssessmentsPage.tsx
//      ("Your Assessments"); MOVED here for the same reason
//      LeaderboardPage.tsx's own comment gives — once it has a dedicated
//      nav destination, leaving a duplicate on the assessments dashboard
//      would just be clutter, not a second legitimate surface for it.
//   b) ScoreHistoryTable — new (item 2b): every graded attempt, most
//      recent first, with a %-change-vs-previous column. See that
//      component's own comment for exactly how "previous" is resolved and
//      why the first attempt shows "—" rather than a fabricated 0%.
//
// Phase 3a — swapped the raw h1/p header block for the shared PageHeader.
// Neither section below is a StatCard grid (a chart + a delta callout, a
// table with a %-change column) — no genuine stat row exists on this page,
// so no entrance animation is added.
export default function PerformancePage() {
  return (
    <div className="p-4">
      <PageHeader
        title="Performance"
        description="Your score trend over time, and a full history of graded attempts."
      />
      <div className="mt-4">
        <PerformanceAnalyticsSection />
        <ScoreHistoryTable />
      </div>
    </div>
  )
}
