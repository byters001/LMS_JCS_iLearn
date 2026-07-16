import type { TrainerProfile, TrainingSession } from '../../db/types';
import type { TrainerPerformanceTrendPoint } from '../analytics/analytics.types';

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

// --- Trainers overview / performance (Phase 5) ---
// Type-only import of analytics' own TrainerPerformanceTrendPoint above —
// no runtime coupling (analytics.service.ts never imports anything from
// this module, so there's no circular-import risk), and reusing that
// exact shape here avoids redefining it a second time for
// TrainerPerformanceResult below.

// "Trainer" in this codebase means "a user holding the 'faculty' role"
// (see trainers.service.ts's TRAINER_ROLE_SLUG) — trainer_profiles is
// optional bio/specialization metadata a faculty user may or may not
// have, not the source of trainer identity, so this row is built from
// users + batch_trainers, not trainer_profiles.
export interface TrainerOverviewRow {
  trainerId: string;
  fullName: string;
  email: string;
  isActive: boolean;
  batchCount: number;
  colleges: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}

export interface ListTrainersOverviewResult {
  items: TrainerOverviewRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrainerPerformanceBatchSummary {
  id: string;
  name: string;
  collegeName: string;
  departmentName: string;
}

export interface TrainerPerformanceResult {
  trainerId: string;
  fullName: string;
  batches: TrainerPerformanceBatchSummary[];
  trend: TrainerPerformanceTrendPoint[];
}
