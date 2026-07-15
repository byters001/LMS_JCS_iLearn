import type {
  AcademicYear,
  College,
  Department,
  TrainingProgram,
  TrainingProgramTrainer,
} from '../../db/types';
import type { BatchWithDetails } from './organization.repository';

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
