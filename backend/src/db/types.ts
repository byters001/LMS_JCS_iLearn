import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { permissions, rolePermissions, roles, userRoles, users } from './schema/identity.schema';
import type {
  academicYears,
  batches,
  batchTrainers,
  colleges,
  departments,
  trainingProgramTrainers,
  trainingPrograms,
} from './schema/organization.schema';
import type {
  trainerProfiles,
  trainingSessionTrainers,
  trainingSessions,
} from './schema/trainers.schema';
import type { studentProfiles, trainingProgramStudents } from './schema/students.schema';
import type {
  codingQuestionDetails,
  codingTestCases,
  psychometricDetails,
  psychometricOptions,
  questionApprovalHistory,
  questionCategories,
  questionImages,
  questionOptions,
  questionPoolCriteria,
  questionPools,
  questionTagMap,
  questionTags,
  questionTopicMap,
  questionTopics,
  questionVersions,
  questions,
} from './schema/question-bank.schema';
import type {
  assessmentApprovalHistory,
  assessmentBatches,
  assessmentQuestions,
  assessmentSectionPools,
  assessmentSections,
  assessments,
} from './schema/assessments.schema';
import type {
  assessmentAttempts,
  assessmentRetakeRequests,
  attemptQuestionSelections,
  attemptResponses,
  proctoringEvents,
} from './schema/attempts.schema';
import type { codingSubmissions } from './schema/coding.schema';
import type { featureFlags, moduleToggles, systemSettings } from './schema/settings.schema';
import type { notifications } from './schema/notifications.schema';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Role = InferSelectModel<typeof roles>;
export type NewRole = InferInsertModel<typeof roles>;

export type Permission = InferSelectModel<typeof permissions>;
export type NewPermission = InferInsertModel<typeof permissions>;

export type RolePermission = InferSelectModel<typeof rolePermissions>;
export type NewRolePermission = InferInsertModel<typeof rolePermissions>;

export type UserRole = InferSelectModel<typeof userRoles>;
export type NewUserRole = InferInsertModel<typeof userRoles>;

export type College = InferSelectModel<typeof colleges>;
export type NewCollege = InferInsertModel<typeof colleges>;

export type Department = InferSelectModel<typeof departments>;
export type NewDepartment = InferInsertModel<typeof departments>;

export type AcademicYear = InferSelectModel<typeof academicYears>;
export type NewAcademicYear = InferInsertModel<typeof academicYears>;

export type TrainingProgram = InferSelectModel<typeof trainingPrograms>;
export type NewTrainingProgram = InferInsertModel<typeof trainingPrograms>;

export type TrainingProgramTrainer = InferSelectModel<typeof trainingProgramTrainers>;
export type NewTrainingProgramTrainer = InferInsertModel<typeof trainingProgramTrainers>;

export type Batch = InferSelectModel<typeof batches>;
export type NewBatch = InferInsertModel<typeof batches>;

export type BatchTrainer = InferSelectModel<typeof batchTrainers>;
export type NewBatchTrainer = InferInsertModel<typeof batchTrainers>;

export type TrainerProfile = InferSelectModel<typeof trainerProfiles>;
export type NewTrainerProfile = InferInsertModel<typeof trainerProfiles>;

export type TrainingSession = InferSelectModel<typeof trainingSessions>;
export type NewTrainingSession = InferInsertModel<typeof trainingSessions>;

export type TrainingSessionTrainer = InferSelectModel<typeof trainingSessionTrainers>;
export type NewTrainingSessionTrainer = InferInsertModel<typeof trainingSessionTrainers>;

export type StudentProfile = InferSelectModel<typeof studentProfiles>;
export type NewStudentProfile = InferInsertModel<typeof studentProfiles>;

export type TrainingProgramStudent = InferSelectModel<typeof trainingProgramStudents>;
export type NewTrainingProgramStudent = InferInsertModel<typeof trainingProgramStudents>;

export type QuestionCategory = InferSelectModel<typeof questionCategories>;
export type NewQuestionCategory = InferInsertModel<typeof questionCategories>;

export type QuestionTopic = InferSelectModel<typeof questionTopics>;
export type NewQuestionTopic = InferInsertModel<typeof questionTopics>;

export type QuestionTag = InferSelectModel<typeof questionTags>;
export type NewQuestionTag = InferInsertModel<typeof questionTags>;

export type Question = InferSelectModel<typeof questions>;
export type NewQuestion = InferInsertModel<typeof questions>;

export type QuestionVersion = InferSelectModel<typeof questionVersions>;
export type NewQuestionVersion = InferInsertModel<typeof questionVersions>;

export type QuestionOption = InferSelectModel<typeof questionOptions>;
export type NewQuestionOption = InferInsertModel<typeof questionOptions>;

export type QuestionImage = InferSelectModel<typeof questionImages>;
export type NewQuestionImage = InferInsertModel<typeof questionImages>;

export type QuestionTopicMap = InferSelectModel<typeof questionTopicMap>;
export type NewQuestionTopicMap = InferInsertModel<typeof questionTopicMap>;

export type QuestionTagMap = InferSelectModel<typeof questionTagMap>;
export type NewQuestionTagMap = InferInsertModel<typeof questionTagMap>;

export type CodingQuestionDetails = InferSelectModel<typeof codingQuestionDetails>;
export type NewCodingQuestionDetails = InferInsertModel<typeof codingQuestionDetails>;

export type CodingTestCase = InferSelectModel<typeof codingTestCases>;
export type NewCodingTestCase = InferInsertModel<typeof codingTestCases>;

export type PsychometricDetails = InferSelectModel<typeof psychometricDetails>;
export type NewPsychometricDetails = InferInsertModel<typeof psychometricDetails>;

export type PsychometricOption = InferSelectModel<typeof psychometricOptions>;
export type NewPsychometricOption = InferInsertModel<typeof psychometricOptions>;

export type QuestionApprovalHistory = InferSelectModel<typeof questionApprovalHistory>;
export type NewQuestionApprovalHistory = InferInsertModel<typeof questionApprovalHistory>;

export type QuestionPool = InferSelectModel<typeof questionPools>;
export type NewQuestionPool = InferInsertModel<typeof questionPools>;

export type QuestionPoolCriteria = InferSelectModel<typeof questionPoolCriteria>;
export type NewQuestionPoolCriteria = InferInsertModel<typeof questionPoolCriteria>;

export type Assessment = InferSelectModel<typeof assessments>;
export type NewAssessment = InferInsertModel<typeof assessments>;

export type AssessmentSection = InferSelectModel<typeof assessmentSections>;
export type NewAssessmentSection = InferInsertModel<typeof assessmentSections>;

export type AssessmentQuestion = InferSelectModel<typeof assessmentQuestions>;
export type NewAssessmentQuestion = InferInsertModel<typeof assessmentQuestions>;

export type AssessmentSectionPool = InferSelectModel<typeof assessmentSectionPools>;
export type NewAssessmentSectionPool = InferInsertModel<typeof assessmentSectionPools>;

export type AssessmentBatch = InferSelectModel<typeof assessmentBatches>;
export type NewAssessmentBatch = InferInsertModel<typeof assessmentBatches>;

export type AssessmentApprovalHistory = InferSelectModel<typeof assessmentApprovalHistory>;
export type NewAssessmentApprovalHistory = InferInsertModel<typeof assessmentApprovalHistory>;

export type AssessmentAttempt = InferSelectModel<typeof assessmentAttempts>;
export type NewAssessmentAttempt = InferInsertModel<typeof assessmentAttempts>;

export type AttemptQuestionSelection = InferSelectModel<typeof attemptQuestionSelections>;
export type NewAttemptQuestionSelection = InferInsertModel<typeof attemptQuestionSelections>;

export type AttemptResponse = InferSelectModel<typeof attemptResponses>;
export type NewAttemptResponse = InferInsertModel<typeof attemptResponses>;

export type ProctoringEvent = InferSelectModel<typeof proctoringEvents>;
export type NewProctoringEvent = InferInsertModel<typeof proctoringEvents>;

export type AssessmentRetakeRequest = InferSelectModel<typeof assessmentRetakeRequests>;
export type NewAssessmentRetakeRequest = InferInsertModel<typeof assessmentRetakeRequests>;

export type CodingSubmission = InferSelectModel<typeof codingSubmissions>;
export type NewCodingSubmission = InferInsertModel<typeof codingSubmissions>;

export type FeatureFlag = InferSelectModel<typeof featureFlags>;
export type NewFeatureFlag = InferInsertModel<typeof featureFlags>;

export type ModuleToggle = InferSelectModel<typeof moduleToggles>;
export type NewModuleToggle = InferInsertModel<typeof moduleToggles>;

export type SystemSetting = InferSelectModel<typeof systemSettings>;
export type NewSystemSetting = InferInsertModel<typeof systemSettings>;

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;
