import type {
  Assessment,
  AssessmentApprovalHistory,
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

export type { AssessmentQuestion, AssessmentSection, AssessmentSectionPool };
