import type {
  Assessment,
  AssessmentApprovalHistory,
  AssessmentAttempt,
  AssessmentQuestion,
  AssessmentSection,
  AssessmentSectionPool,
} from '../../db/types';
import type { ResolvedQuestionPool } from '../question-bank/question-bank.types';

export interface ListAssessmentsResult {
  items: Assessment[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Available assessments (student-facing) — layout/button-state phase ---
//
// The caller's own most recent attempt for one assessment, or absent
// entirely if they've never started one. See assessments.repository.ts's
// listAvailableAssessments for exactly how this is derived (a LEFT JOIN
// against a DISTINCT ON (assessment_id) subquery of assessment_attempts,
// ordered by attempt_number DESC — the highest-numbered row is the most
// recent). Deliberately NOT the full AssessmentAttempt row — id/status/
// attemptNumber is exactly what the frontend needs to derive a Start/
// Continue/Completed button state and link to either the instructions flow
// or the results page; everything else (ipAddress, browserInfo, totalScore,
// etc.) is either irrelevant here or already covered by GET
// /reports/my-attempts for a student who wants their actual score history.
export interface MyLatestAttemptSummary {
  id: string;
  status: AssessmentAttempt['status'];
  attemptNumber: number;
}

// GET /assessments/available's actual per-item shape — the bare assessment
// row plus the caller's own myLatestAttempt. Deliberately a DIFFERENT type
// from the plain Assessment[] the staff-facing listAssessments/
// ListAssessmentsResult above returns: "my own attempt" only means
// something for the student calling THIS route, not for a trainer/admin
// browsing the platform-wide list.
export interface AvailableAssessment extends Assessment {
  myLatestAttempt: MyLatestAttemptSummary | null;
}

export interface ListAvailableAssessmentsResult {
  items: AvailableAssessment[];
  total: number;
  page: number;
  pageSize: number;
}

// batchIds surfaced alongside the bare assessment row — assessment_batches
// is modeled as part of create/update (see assessments.service.ts's module
// comment), not its own CRUD resource, but callers still need to see which
// batches are currently linked.
export interface AssessmentWithBatches extends Assessment {
  batchIds: string[];
}

export interface ListQuestionApprovalHistoryResult {
  items: AssessmentApprovalHistory[];
  total: number;
  page: number;
  pageSize: number;
}

// One question as it will actually appear to a test-taker, regardless of
// which selection_mode produced it — manual rows (assessment_questions) and
// pool-resolved rows (via question-bank's resolveQuestionPool) are
// normalized to this same shape so resolveSectionQuestions' caller never
// has to branch on source. marks is a numeric-column string (this
// codebase's standing convention, see question-bank.types.ts's
// ResolvedPoolQuestion), already resolved to the effective value —
// marksOverride ?? version.marks for manual, version.marks for pool (pool
// picks have no override concept).
export interface ResolvedAssessmentQuestion {
  questionVersionId: string;
  questionText: string;
  marks: string;
  sortOrder: number;
  source: 'manual' | 'pool';
}

// The result of "get this section's actual questions right now" — the
// operation item 1 asked about explicitly. For a 'manual' section this is a
// simple join (assessment_questions -> question_versions); for a 'pool'
// section, `questions` is the flattened union of every attached pool's
// current random draw, and `poolResolutions` carries the full per-pool,
// per-criterion detail (including the eligibleTotal/isFullySatisfied
// shortage signal from question-bank Part 3) so a caller can tell WHY a
// pool section came up short, not just that it did.
export interface ResolvedSectionQuestions {
  section: AssessmentSection;
  questions: ResolvedAssessmentQuestion[];
  poolResolutions?: ResolvedQuestionPool[];
}

// A section as returned by GET /assessments/:id/full — the section's own
// fields (spread) plus whatever resolveSectionQuestions already produces for
// it, renamed questions -> resolvedQuestions at this composed level to read
// unambiguously next to the section's own fields. poolResolutions is only
// present for 'pool' sections, same optionality as ResolvedSectionQuestions.
export interface AssessmentSectionWithResolvedQuestions extends AssessmentSection {
  resolvedQuestions: ResolvedAssessmentQuestion[];
  poolResolutions?: ResolvedQuestionPool[];
}

// GET /assessments/:id/full's response shape: the assessment (with
// batchIds, same as GET /assessments/:id) plus every section in order, each
// carrying its resolved questions. Pure composition of
// findAssessmentWithBatches + listAssessmentSections + resolveSectionQuestions
// — no new query.
export interface FullAssessment extends AssessmentWithBatches {
  sections: AssessmentSectionWithResolvedQuestions[];
}

export type { AssessmentQuestion, AssessmentSection, AssessmentSectionPool };
