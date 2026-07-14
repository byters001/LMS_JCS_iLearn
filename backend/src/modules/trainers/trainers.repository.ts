import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { trainingProgramTrainers, trainingPrograms } from '../../db/schema/organization.schema';
import { trainerProfiles, trainingSessions } from '../../db/schema/trainers.schema';
import type { TrainerProfile, TrainingSession } from '../../db/types';

// Hard delete: schema.sql gives trainer_profiles no deleted_at column
// (checked directly, not assumed). Distinct from the join-table hard-delete
// precedent elsewhere (user_roles, training_program_trainers): this isn't a
// join table, it's a substantive profile record — the schema just gives it
// no soft-delete mechanism to use. Safe and non-cascading either way:
// training_program_trainers.trainer_id and training_session_trainers.
// trainer_id both reference users(id) directly, never trainer_profiles(id)
// — removing a trainer's *profile* never touches their assignment records.

export interface ListTrainerProfilesParams {
  collegeId?: string;
  departmentId?: string;
  page: number;
  pageSize: number;
}

export interface ListTrainerProfilesResult {
  items: TrainerProfile[];
  total: number;
}

// collegeId/departmentId are NOT columns on trainer_profiles — checked
// schema.sql directly; unlike student_profiles, trainer_profiles has no
// college_id/department_id at all. The only way to relate a trainer to a
// college/department is indirectly, through which training_programs they're
// staffed on via training_program_trainers. So this filter really means
// "trainers with at least one program assignment in this college/
// department," not "trainers whose profile belongs to this college" — no
// such fact is stored anywhere. A trainer assigned to programs in multiple
// colleges will appear under each. DISTINCT is required since a trainer can
// have more than one matching assignment row.
async function listTrainerProfiles(
  params: ListTrainerProfilesParams,
): Promise<ListTrainerProfilesResult> {
  const { collegeId, departmentId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  if (!collegeId && !departmentId) {
    const [items, totalRows] = await Promise.all([
      db
        .select()
        .from(trainerProfiles)
        .orderBy(asc(trainerProfiles.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(trainerProfiles),
    ]);
    return { items, total: Number(totalRows[0]?.count ?? 0) };
  }

  const conditions = [];
  if (collegeId) conditions.push(eq(trainingPrograms.collegeId, collegeId));
  if (departmentId) conditions.push(eq(trainingPrograms.departmentId, departmentId));
  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .selectDistinct({ trainerProfile: trainerProfiles })
      .from(trainerProfiles)
      .innerJoin(
        trainingProgramTrainers,
        eq(trainingProgramTrainers.trainerId, trainerProfiles.userId),
      )
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, trainingProgramTrainers.trainingProgramId))
      .where(where)
      .orderBy(asc(trainerProfiles.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(distinct ${trainerProfiles.id})` })
      .from(trainerProfiles)
      .innerJoin(
        trainingProgramTrainers,
        eq(trainingProgramTrainers.trainerId, trainerProfiles.userId),
      )
      .innerJoin(trainingPrograms, eq(trainingPrograms.id, trainingProgramTrainers.trainingProgramId))
      .where(where),
  ]);

  return {
    items: items.map((row) => row.trainerProfile),
    total: Number(totalRows[0]?.count ?? 0),
  };
}

async function findTrainerProfileById(id: string): Promise<TrainerProfile | undefined> {
  const [trainerProfile] = await db
    .select()
    .from(trainerProfiles)
    .where(eq(trainerProfiles.id, id))
    .limit(1);
  return trainerProfile;
}

// Used for the pre-insert uniqueness check (trainer_profiles.user_id is
// UNIQUE in schema.sql — one profile per user).
async function findTrainerProfileByUserId(userId: string): Promise<TrainerProfile | undefined> {
  const [trainerProfile] = await db
    .select()
    .from(trainerProfiles)
    .where(eq(trainerProfiles.userId, userId))
    .limit(1);
  return trainerProfile;
}

export interface CreateTrainerProfileData {
  userId: string;
  specialization?: string | null;
  bio?: string | null;
}

async function createTrainerProfile(data: CreateTrainerProfileData): Promise<TrainerProfile> {
  const [trainerProfile] = await db.insert(trainerProfiles).values(data).returning();
  return trainerProfile;
}

// userId not part of the update surface — same reasoning as every other
// structural-anchor FK elsewhere in this codebase: it's set at creation,
// not a profile field you'd casually reassign to a different user.
export interface UpdateTrainerProfileData {
  specialization?: string | null;
  bio?: string | null;
}

async function updateTrainerProfile(
  id: string,
  data: UpdateTrainerProfileData,
): Promise<TrainerProfile | undefined> {
  const [updated] = await db
    .update(trainerProfiles)
    .set(data)
    .where(eq(trainerProfiles.id, id))
    .returning();
  return updated;
}

async function deleteTrainerProfile(id: string): Promise<boolean> {
  const deleted = await db
    .delete(trainerProfiles)
    .where(eq(trainerProfiles.id, id))
    .returning({ id: trainerProfiles.id });
  return deleted.length > 0;
}

// --- Training sessions ---
// Added for the assessments module (Part 4): assessments.training_session_id
// references training_sessions(id) ON DELETE RESTRICT in schema.sql, and
// nothing in this codebase exposed a lookup for that table until now —
// trainers.schema.ts already owns the training_sessions/
// training_session_trainers tables (see that file's own module comment), so
// this is the natural home for the read, not a new one-off in assessments'
// own repository. No deleted_at column on training_sessions (checked
// directly) — existence is the whole check, nothing to soft-delete-filter.
async function findTrainingSessionById(id: string): Promise<TrainingSession | undefined> {
  const [session] = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.id, id))
    .limit(1);
  return session;
}

export interface ListTrainingSessionsParams {
  trainingProgramId?: string;
  page: number;
  pageSize: number;
}

export interface ListTrainingSessionsResult {
  items: TrainingSession[];
  total: number;
}

// List-only read for this phase (see this file's module comment on
// training_sessions ownership being unsettled) — added so the frontend has
// a way to discover valid trainingSessionId values for assessment creation.
// Ordered by session_date then session_number: session_date is the field a
// person actually schedules around (chronological, matches idx_training_
// sessions_date), session_number is the tiebreaker for same-day sessions
// rather than the primary sort — a program's sessions aren't guaranteed to
// be numbered in date order.
async function listTrainingSessions(
  params: ListTrainingSessionsParams,
): Promise<ListTrainingSessionsResult> {
  const { trainingProgramId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = trainingProgramId
    ? eq(trainingSessions.trainingProgramId, trainingProgramId)
    : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(trainingSessions)
      .where(where)
      .orderBy(asc(trainingSessions.sessionDate), asc(trainingSessions.sessionNumber))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(trainingSessions).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

export const trainersRepository = {
  listTrainerProfiles,
  findTrainerProfileById,
  findTrainerProfileByUserId,
  createTrainerProfile,
  updateTrainerProfile,
  deleteTrainerProfile,
  findTrainingSessionById,
  listTrainingSessions,
};
