import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { permissions, rolePermissions, roles, userRoles, users } from './schema/identity.schema';
import type {
  academicYears,
  batches,
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
  questionCategories,
  questionImages,
  questionOptions,
  questionTagMap,
  questionTags,
  questionTopicMap,
  questionTopics,
  questionVersions,
  questions,
} from './schema/question-bank.schema';

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
