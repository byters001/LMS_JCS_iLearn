import type {
  CodingQuestionDetails,
  CodingTestCase,
  PsychometricDetails,
  PsychometricOption,
  Question,
  QuestionApprovalHistory,
  QuestionCategory,
  QuestionImage,
  QuestionOption,
  QuestionPool,
  QuestionPoolCriteria,
  QuestionTag,
  QuestionTopic,
  QuestionVersion,
} from '../../db/types';

export interface ListQuestionCategoriesResult {
  items: QuestionCategory[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuestionTopicsResult {
  items: QuestionTopic[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuestionTagsResult {
  items: QuestionTag[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuestionsResult {
  items: Question[];
  total: number;
  page: number;
  pageSize: number;
}

// A version plus its version-scoped content (question_options/
// question_images/coding_question_details/coding_test_cases/
// psychometric_details/psychometric_options all key off
// question_version_id, not question_id). The type-specific fields are
// null/empty for versions whose parent question.type doesn't match — e.g.
// an mcq version always has codingDetails: null, testCases: [].
export interface QuestionVersionWithContent extends QuestionVersion {
  options: QuestionOption[];
  images: QuestionImage[];
  codingDetails: CodingQuestionDetails | null;
  testCases: CodingTestCase[];
  psychometricDetails: PsychometricDetails | null;
  psychometricOptions: PsychometricOption[];
}

// The "give me everything about this question" view: the questions row
// plus its current version's full content. currentVersion is null only if
// current_version_id hasn't been set — shouldn't happen given createQuestion
// sets it atomically, but the FK is nullable so the type reflects that.
export interface QuestionWithCurrentVersion extends Question {
  currentVersion: QuestionVersionWithContent | null;
}

// --- Part 3: approval workflow + question pools ---

export interface ListQuestionApprovalHistoryResult {
  items: QuestionApprovalHistory[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuestionPoolsResult {
  items: QuestionPool[];
  total: number;
  page: number;
  pageSize: number;
}

// One resolved question a pool criterion selected — enough to point an
// assessment at a specific frozen version (question_version_id), plus
// enough surfaced metadata (question text, marks) for a reviewer to
// sanity-check the preview, or for a consumer like assessments.service.ts
// to build a ResolvedAssessmentQuestion, without a follow-up lookup per
// question. marks is question_versions.marks (numeric -> string, same
// convention as every other numeric column in this codebase) — pool-drawn
// picks have no per-assessment override concept the way assessment_
// questions.marks_override does, so this is always the version's own marks.
export interface ResolvedPoolQuestion {
  questionId: string;
  questionVersionId: string;
  questionText: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: string;
}

// The "what would this criterion currently draw" result: eligibleTotal is
// how many approved questions satisfy the criterion's filters regardless of
// count_required; selected is the (randomly-ordered) subset actually drawn,
// capped at count_required. selected.length < countRequired iff the pool is
// under-supplied for this criterion — the signal a pool curator needs
// before an assessment section is allowed to depend on it.
export interface ResolvedPoolCriterion extends QuestionPoolCriteria {
  eligibleTotal: number;
  selected: ResolvedPoolQuestion[];
}

export interface ResolvedQuestionPool {
  pool: QuestionPool;
  criteria: ResolvedPoolCriterion[];
  totalRequired: number;
  totalSelected: number;
  isFullySatisfied: boolean;
}
