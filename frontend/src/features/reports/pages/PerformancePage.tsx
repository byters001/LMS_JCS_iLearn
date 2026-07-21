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
export default function PerformancePage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your score trend over time, and a full history of graded attempts.
        </p>
      </div>
      <PerformanceAnalyticsSection />
      <ScoreHistoryTable />
    </div>
  )
}
