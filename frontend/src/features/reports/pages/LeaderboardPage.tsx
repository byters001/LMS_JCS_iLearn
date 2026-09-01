import { PageHeader } from '@/components/ui/PageHeader'
import LeaderboardSection from '../components/LeaderboardSection'

// New dedicated route (/student/leaderboard) — LeaderboardSection itself is
// reused entirely as-is (its own card chrome, heading, table). Previously
// this same component was embedded directly inside StudentAssessmentsPage.tsx
// ("Your Assessments") below the assessment grid; it's been MOVED here, not
// duplicated — removed from that page in the same change that added this
// one, since showing the same leaderboard in two places once it has its own
// nav link would just be redundant clutter on the assessments dashboard.
//
// Phase 3a — swapped the raw h1/p header block for the shared PageHeader
// (same shape it was already hand-copying). No stat row exists on this page
// (LeaderboardSection is a single table, not a StatCard grid), so no
// entrance animation is added here — Phase 2's "only if a genuine stat row
// already exists" applies.
export default function LeaderboardPage() {
  return (
    <div className="p-4">
      <PageHeader title="Leaderboard" description="See how you rank against your batch." />
      <div className="mt-4">
        <LeaderboardSection />
      </div>
    </div>
  )
}
