import type {
  AcademicYear,
  Batch,
  College,
  Department,
  TrainingProgram,
  TrainingProgramTrainer,
} from '../../db/types';

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
  items: Batch[];
  total: number;
  page: number;
  pageSize: number;
}
