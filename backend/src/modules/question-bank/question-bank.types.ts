import type {
  CodingQuestionDetails,
  CodingTestCase,
  PsychometricDetails,
  PsychometricOption,
  Question,
  QuestionCategory,
  QuestionImage,
  QuestionOption,
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
