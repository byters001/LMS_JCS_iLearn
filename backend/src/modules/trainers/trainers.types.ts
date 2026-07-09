import type { TrainerProfile } from '../../db/types';

export interface ListTrainerProfilesResult {
  items: TrainerProfile[];
  total: number;
  page: number;
  pageSize: number;
}
