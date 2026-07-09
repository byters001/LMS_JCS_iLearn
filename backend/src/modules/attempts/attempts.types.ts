import type { AssessmentAttempt, AttemptResponse } from '../../db/types';

export type { AssessmentAttempt, AttemptResponse };

// One row of attempts.repository.ts's listFrozenQuestions — a plain join
// of attempt_question_selections -> question_versions (for display text)
// -> assessment_sections (for section ordering only). Deliberately NOT the
// same shape as assessments module's ResolvedAssessmentQuestion: this is
// read from the FROZEN selections table only (see attempts.service.ts's
// getAttemptQuestions), never from a live resolveSectionQuestions call, so
// it carries no `source`/poolResolutions concept — by the time an attempt
// exists, manual vs pool is no longer a meaningful distinction, only "what
// was frozen" is.
//
// This is the REPOSITORY-level row only — the minimal, always-safe display
// fields. Per-type renderable content (options/psychometricOptions/coding)
// is layered on top in the SERVICE layer (see AttemptQuestionContent below
// and attempts.service.ts's buildRenderableQuestion), by reusing
// question-bank's own content-fetching service functions rather than this
// module querying question_options/psychometric_options/
// coding_question_details/coding_test_cases directly.
export interface FrozenAttemptQuestion {
  id: string;
  assessmentSectionId: string;
  questionVersionId: string;
  questionText: string;
  marks: string;
  sortOrder: number;
}

// MCQ option, sanitized for a test-taker: is_correct is deliberately
// omitted (the whole point of hiding it) — see question-bank's
// QuestionOption for the full row this is derived from.
export interface SanitizedOption {
  id: string;
  optionText: string;
  imageUrl: string | null;
  sortOrder: number;
}

// Psychometric option, sanitized: trait_weight is deliberately omitted.
// Confirmed directly against schema.sql's psychometric_options columns
// (id, question_version_id, option_text, trait_weight, sort_order) — no
// separate "correct" flag exists on this table, but trait_weight is the
// column that maps an answer onto a scored trait, which is exactly as
// revealing as MCQ's is_correct would be if shown (a test-taker could
// reverse-engineer "which option maximizes trait X") — so it gets the same
// treatment.
export interface SanitizedPsychometricOption {
  id: string;
  optionText: string;
  sortOrder: number;
}

// Visible (non-hidden) coding test case, sanitized: `points` is
// deliberately omitted alongside every is_hidden = true row being filtered
// out entirely — points is scoring metadata (same category as is_correct/
// trait_weight), not something a sample test case needs to expose to be
// useful as an example.
export interface SanitizedTestCase {
  id: string;
  input: string | null;
  expectedOutput: string | null;
  sortOrder: number;
}

// coding_question_details' fields are all safe to expose as-is (this is
// literally the problem statement content a test-taker is meant to read) —
// only coding_test_cases needs filtering, via sampleTestCases below.
export interface SanitizedCodingContent {
  problemStatement: string;
  inputFormat: string | null;
  outputFormat: string | null;
  constraints: string | null;
  timeLimitMs: number;
  memoryLimitKb: number;
  supportedLanguages: string[];
  sampleTestCases: SanitizedTestCase[];
}

// getAttemptQuestions' actual per-question response shape: FrozenAttemptQuestion
// plus the question's type and exactly one of options/psychometricOptions/
// coding, matching that type. mcq -> options; psychometric ->
// psychometricOptions; coding -> coding (present only if
// coding_question_details exists for this version — absent otherwise, not
// an error). Never includes is_correct, trait_weight, hidden test cases, or
// test case points.
export interface AttemptQuestionContent extends FrozenAttemptQuestion {
  type: 'mcq' | 'coding' | 'psychometric';
  options?: SanitizedOption[];
  psychometricOptions?: SanitizedPsychometricOption[];
  coding?: SanitizedCodingContent;
}

// attempts.repository.ts's sumResponsesForAttempt result — see
// attempts.service.ts's submitAttempt for how hasUngradedCoding decides
// between 'submitted' and 'pending_evaluation'.
export interface AttemptScoreSummary {
  totalScore: string;
  hasUngradedCoding: boolean;
}
