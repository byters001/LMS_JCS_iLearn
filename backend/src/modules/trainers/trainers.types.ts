import type { TrainerProfile, TrainingSession } from '../../db/types';

export interface ListTrainerProfilesResult {
  items: TrainerProfile[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListTrainingSessionsResult {
  items: TrainingSession[];
  total: number;
  page: number;
  pageSize: number;
}
