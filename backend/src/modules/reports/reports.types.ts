import type { Assessment, AssessmentAttempt } from '../../db/types';

// One row of reports.repository.ts's listMyAttempts/findAttemptSummaryById
// — the attempt's own fields plus its assessment's title/testCategory (a
// plain JOIN done directly in the repository, not a cross-module SERVICE
// call — reports is CLAUDE.md's explicit cross-module-QUERY exception,
// since its whole purpose is cross-cutting aggregation).
export interface MyAttemptSummary {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  testCategory: Assessment['testCategory'];
  status: AssessmentAttempt['status'];
  attemptNumber: number;
  isRetake: boolean;
  totalScore: string | null;
  submissionTime: Date | null;
  createdAt: Date;
}

export interface ListMyAttemptsResult {
  items: MyAttemptSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// Per-question breakdown row for the detail view — deliberately UNIFORM
// across mcq/coding/psychometric (questionText, marksPossible,
// marksObtained, isCorrect only), not the fully type-enriched shape
// attempts.service.ts's getAttemptQuestions returns (options/
// psychometricOptions/coding sample test cases). This is a post-hoc score
// report, not a render-the-test payload — see reports.service.ts's module
// comment for exactly which fields were deliberately excluded and why.
// latestCodingTestCases is the one coding-specific addition: aggregate
// pass/total counts ONLY from the student's most recent coding_submissions
// row for that question — never source_code/compile_error/runtime_error/
// execution_output, and explicitly NOT guaranteed to correspond to the
// submission that produced the recorded marksObtained/isCorrect (see the
// service's comment on why: "best result wins" grading means the
// recorded grade may reflect an earlier, better submission than the
// latest one).
export interface AttemptQuestionBreakdown {
  questionVersionId: string;
  sortOrder: number;
  questionText: string;
  marksPossible: string;
  marksObtained: string | null;
  isCorrect: boolean | null;
  latestCodingTestCases: { passed: number; total: number } | null;
}

export interface MyAttemptDetail {
  attempt: MyAttemptSummary;
  questions: AttemptQuestionBreakdown[];
}

// --- Leaderboard (item 8B) ---
//
// Strictly batch-scoped (never cross-batch/global — see reports.service.ts's
// getLeaderboard) and tiered by rank-within-batch percentile, not a fixed
// score cutoff (schema.sql has no notion of one for this): top 10% =
// platinum, next 25% = gold, next 35% = silver, remaining 30% = bronze.
export type LeaderboardTier = 'platinum' | 'gold' | 'silver' | 'bronze';

// displayName is the student's full name — deliberately exposed here
// (unlike reports's own attempt-detail sanitization elsewhere in this
// file): batch-mates seeing each other's name/score/rank is the entire
// point of a leaderboard, not an incidental leak. Nothing beyond
// name+score+rank+tier is included — no email, roll number, or other
// student_profiles/users column.
export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  displayName: string;
  averageScorePercent: number;
  tier: LeaderboardTier;
  // Computed server-side (compared against the CALLER's own resolved
  // student_profiles id) so the frontend never has to know its own
  // studentId just to highlight "which row is me" — the authenticated
  // user object it already holds only carries users.id, not
  // student_profiles.id.
  isSelf: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
}
