import type {
  AcademicYear,
  BatchTrainer,
  College,
  Department,
  TrainingProgram,
  TrainingProgramTrainer,
} from '../../db/types';
import type { BatchWithDetails, TrainerBatchAssignmentRow } from './organization.repository';

// Re-exported so cross-module callers (trainers.service.ts's Phase 5
// overview/performance endpoints) import this module's public *.types.ts
// contract, not its repository.ts directly — same precedent as
// BatchWithDetails below.
export type { TrainerBatchAssignmentRow };

export interface ListCollegesResult {
  items: College[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListDepartmentsResult {
  items: Department[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListAcademicYearsResult {
  items: AcademicYear[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListTrainingProgramsResult {
  items: TrainingProgram[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListTrainingProgramTrainersResult {
  items: TrainingProgramTrainer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListBatchesResult {
  items: BatchWithDetails[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListBatchTrainersResult {
  items: BatchTrainer[];
  total: number;
  page: number;
  pageSize: number;
}
