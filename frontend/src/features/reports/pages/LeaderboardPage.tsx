import LeaderboardSection from '../components/LeaderboardSection'

// New dedicated route (/student/leaderboard) — LeaderboardSection itself is
// reused entirely as-is (its own card chrome, heading, table). Previously
// this same component was embedded directly inside StudentAssessmentsPage.tsx
// ("Your Assessments") below the assessment grid; it's been MOVED here, not
// duplicated — removed from that page in the same change that added this
// one, since showing the same leaderboard in two places once it has its own
// nav link would just be redundant clutter on the assessments dashboard.
export default function LeaderboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how you rank against your batch.
        </p>
      </div>
      <LeaderboardSection />
    </div>
  )
}
