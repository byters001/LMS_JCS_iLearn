import type {
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
// question_images key off question_version_id, not question_id).
export interface QuestionVersionWithContent extends QuestionVersion {
  options: QuestionOption[];
  images: QuestionImage[];
}

// The "give me everything about this question" view: the questions row
// plus its current version's full content. currentVersion is null only if
// current_version_id hasn't been set — shouldn't happen given createQuestion
// sets it atomically, but the FK is nullable so the type reflects that.
export interface QuestionWithCurrentVersion extends Question {
  currentVersion: QuestionVersionWithContent | null;
}
