import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { organizationController } from './organization.controller';
import {
  academicYearIdParamsSchema,
  assignBatchTrainerSchema,
  assignTrainingProgramTrainerSchema,
  batchIdParamsSchema,
  batchTrainerParamsSchema,
  collegeIdParamsSchema,
  createAcademicYearSchema,
  createBatchSchema,
  createCollegeSchema,
  createDepartmentSchema,
  createTrainingProgramSchema,
  departmentIdParamsSchema,
  listAcademicYearsQuerySchema,
  listBatchesQuerySchema,
  listBatchTrainersQuerySchema,
  listCollegesQuerySchema,
  listDepartmentsQuerySchema,
  listMyBatchesQuerySchema,
  listTrainingProgramTrainersQuerySchema,
  listTrainingProgramsQuerySchema,
  trainingProgramIdParamsSchema,
  trainingProgramTrainerParamsSchema,
  updateAcademicYearSchema,
  updateBatchSchema,
  updateCollegeSchema,
  updateDepartmentSchema,
  updateTrainingProgramSchema,
  type AcademicYearIdParams,
  type AssignBatchTrainerInput,
  type AssignTrainingProgramTrainerInput,
  type BatchIdParams,
  type BatchTrainerParams,
  type CollegeIdParams,
  type CreateAcademicYearInput,
  type CreateBatchInput,
  type CreateCollegeInput,
  type CreateDepartmentInput,
  type CreateTrainingProgramInput,
  type DepartmentIdParams,
  type ListAcademicYearsQuery,
  type ListBatchesQuery,
  type ListBatchTrainersQuery,
  type ListCollegesQuery,
  type ListDepartmentsQuery,
  type ListMyBatchesQuery,
  type ListTrainingProgramTrainersQuery,
  type ListTrainingProgramsQuery,
  type TrainingProgramIdParams,
  type TrainingProgramTrainerParams,
  type UpdateAcademicYearInput,
  type UpdateBatchInput,
  type UpdateCollegeInput,
  type UpdateDepartmentInput,
  type UpdateTrainingProgramInput,
} from './organization.schema';

function validateQuery(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten());
    }
    request.query = parsed.data;
  };
}

function validateParams(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid route parameters', parsed.error.flatten());
    }
    request.params = parsed.data;
  };
}

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

// 'colleges.manage' is seeded in schema.sql's Section 12 (originally for
// this exact domain — colleges/departments/academic_years — even though it
// predates this route file). One key covering all three entities, not split
// finer (e.g. not separate 'departments.manage'): matches the granularity
// schema.sql already uses elsewhere ('batches.manage',
// 'training_programs.manage', 'training_sessions.manage' are each one
// permission per whole sub-domain, not one per CRUD verb or sub-entity).
//
// 'colleges.view' was NOT seeded — an audit of every requirePermission()
// call against schema.sql found this gap (along with users.manage_roles)
// and it was added via drizzle/patches/2026-07-09_add-colleges-view-and-
// users-manage-roles-permissions.sql, granted to super_admin. Deliberately
// separate from 'colleges.manage' rather than reused for read routes too:
// mirrors the view/manage split schema.sql already establishes for `users`
// (users.view exists separately from users.edit/create/delete, and Faculty
// is granted users.view without the mutating keys) — Faculty and similar
// roles will plausibly need to browse org structure without holding the
// more sensitive create/edit/delete-college capability.
export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  // --- Colleges ---

  fastify.get<{ Querystring: ListCollegesQuery }>(
    '/colleges',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.view')],
      preValidation: validateQuery(listCollegesQuerySchema),
    },
    organizationController.listColleges,
  );

  fastify.get<{ Params: CollegeIdParams }>(
    '/colleges/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.view')],
      preValidation: validateParams(collegeIdParamsSchema),
    },
    organizationController.getCollegeById,
  );

  fastify.post<{ Body: CreateCollegeInput }>(
    '/colleges',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: validateBody(createCollegeSchema),
    },
    organizationController.createCollege,
  );

  fastify.patch<{ Params: CollegeIdParams; Body: UpdateCollegeInput }>(
    '/colleges/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: [validateParams(collegeIdParamsSchema), validateBody(updateCollegeSchema)],
    },
    organizationController.updateCollege,
  );

  fastify.delete<{ Params: CollegeIdParams }>(
    '/colleges/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: validateParams(collegeIdParamsSchema),
    },
    organizationController.deleteCollege,
  );

  // --- Departments ---

  fastify.get<{ Querystring: ListDepartmentsQuery }>(
    '/departments',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.view')],
      preValidation: validateQuery(listDepartmentsQuerySchema),
    },
    organizationController.listDepartments,
  );

  fastify.get<{ Params: DepartmentIdParams }>(
    '/departments/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.view')],
      preValidation: validateParams(departmentIdParamsSchema),
    },
    organizationController.getDepartmentById,
  );

  fastify.post<{ Body: CreateDepartmentInput }>(
    '/departments',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: validateBody(createDepartmentSchema),
    },
    organizationController.createDepartment,
  );

  fastify.patch<{ Params: DepartmentIdParams; Body: UpdateDepartmentInput }>(
    '/departments/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: [
        validateParams(departmentIdParamsSchema),
        validateBody(updateDepartmentSchema),
      ],
    },
    organizationController.updateDepartment,
  );

  fastify.delete<{ Params: DepartmentIdParams }>(
    '/departments/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: validateParams(departmentIdParamsSchema),
    },
    organizationController.deleteDepartment,
  );

  // --- Academic years ---
  // No DELETE route: academic_years has no deleted_at column in schema.sql
  // and organization.repository.ts deliberately doesn't implement a delete
  // for it (see that file's comment) — nothing here to wire a route to.

  fastify.get<{ Querystring: ListAcademicYearsQuery }>(
    '/academic-years',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.view')],
      preValidation: validateQuery(listAcademicYearsQuerySchema),
    },
    organizationController.listAcademicYears,
  );

  fastify.get<{ Params: AcademicYearIdParams }>(
    '/academic-years/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.view')],
      preValidation: validateParams(academicYearIdParamsSchema),
    },
    organizationController.getAcademicYearById,
  );

  fastify.post<{ Body: CreateAcademicYearInput }>(
    '/academic-years',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: validateBody(createAcademicYearSchema),
    },
    organizationController.createAcademicYear,
  );

  fastify.patch<{ Params: AcademicYearIdParams; Body: UpdateAcademicYearInput }>(
    '/academic-years/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('colleges.manage')],
      preValidation: [
        validateParams(academicYearIdParamsSchema),
        validateBody(updateAcademicYearSchema),
      ],
    },
    organizationController.updateAcademicYear,
  );

  // --- Training programs ---
  //
  // 'training_programs.manage' is already seeded in schema.sql — reused for
  // both read and write routes here, NOT split into a separate
  // 'training_programs.view'. Different call than colleges.view: schema.sql's
  // own original seed data never split view/manage for training_programs (or
  // batches) in the first place — there's no training_programs.view or
  // batches.view precedent to extend, unlike users.view existing for the
  // users domain. Respecting that existing, intentional design rather than
  // inventing a split the schema's authors chose not to make.
  fastify.get<{ Querystring: ListTrainingProgramsQuery }>(
    '/training-programs',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: validateQuery(listTrainingProgramsQuerySchema),
    },
    organizationController.listTrainingPrograms,
  );

  fastify.get<{ Params: TrainingProgramIdParams }>(
    '/training-programs/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: validateParams(trainingProgramIdParamsSchema),
    },
    organizationController.getTrainingProgramById,
  );

  fastify.post<{ Body: CreateTrainingProgramInput }>(
    '/training-programs',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: validateBody(createTrainingProgramSchema),
    },
    organizationController.createTrainingProgram,
  );

  fastify.patch<{ Params: TrainingProgramIdParams; Body: UpdateTrainingProgramInput }>(
    '/training-programs/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: [
        validateParams(trainingProgramIdParamsSchema),
        validateBody(updateTrainingProgramSchema),
      ],
    },
    organizationController.updateTrainingProgram,
  );

  fastify.delete<{ Params: TrainingProgramIdParams }>(
    '/training-programs/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: validateParams(trainingProgramIdParamsSchema),
    },
    organizationController.deleteTrainingProgram,
  );

  // --- Training program trainers ---
  //
  // No new permission key for trainer assignment — reuses
  // 'training_programs.manage' rather than a hypothetical
  // 'training_programs.manage_trainers'. Different conclusion than
  // users.manage_roles: role assignment there was split out because roles
  // carry PERMISSIONS (a security-sensitive escalation concern). Assigning a
  // trainer to a training program is an operational/staffing concern — who's
  // teaching what — with no comparable security dimension, so it doesn't
  // warrant the same treatment. No update route: role_in_program changes go
  // through remove-then-reassign, matching how the users module's
  // user_roles (also a pure join table, also no deleted_at column) only
  // exposes assign/revoke, never an in-place update.
  fastify.get<{ Params: TrainingProgramIdParams; Querystring: ListTrainingProgramTrainersQuery }>(
    '/training-programs/:id/trainers',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: [
        validateParams(trainingProgramIdParamsSchema),
        validateQuery(listTrainingProgramTrainersQuerySchema),
      ],
    },
    organizationController.listTrainingProgramTrainers,
  );

  fastify.post<{ Params: TrainingProgramIdParams; Body: AssignTrainingProgramTrainerInput }>(
    '/training-programs/:id/trainers',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: [
        validateParams(trainingProgramIdParamsSchema),
        validateBody(assignTrainingProgramTrainerSchema),
      ],
    },
    organizationController.assignTrainingProgramTrainer,
  );

  fastify.delete<{ Params: TrainingProgramTrainerParams }>(
    '/training-programs/:id/trainers/:trainerId',
    {
      preHandler: [fastify.authenticate, requirePermission('training_programs.manage')],
      preValidation: validateParams(trainingProgramTrainerParamsSchema),
    },
    organizationController.removeTrainingProgramTrainer,
  );

  // --- Batches ---
  // 'batches.manage' is already seeded in schema.sql — same reasoning as
  // training_programs.manage above: reused for read and write alike, no new
  // batches.view key, since schema.sql's own seed never split this domain.
  fastify.get<{ Querystring: ListBatchesQuery }>(
    '/batches',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: validateQuery(listBatchesQuerySchema),
    },
    organizationController.listBatches,
  );

  // Self-scoped, permission-free — same model as reports' listMyAttempts:
  // "mine" resolves from the caller's own JWT user id, nothing to
  // authorize beyond fastify.authenticate itself. Registered as a static
  // path ahead of the parametric '/batches/:id' below — find-my-way (this
  // codebase's router) already disambiguates static vs parametric routes
  // correctly regardless of registration order, but this ordering is the
  // clearer read.
  fastify.get<{ Querystring: ListMyBatchesQuery }>(
    '/batches/mine',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateQuery(listMyBatchesQuerySchema),
    },
    organizationController.listMyBatches,
  );

  fastify.get<{ Params: BatchIdParams }>(
    '/batches/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: validateParams(batchIdParamsSchema),
    },
    organizationController.getBatchById,
  );

  fastify.post<{ Body: CreateBatchInput }>(
    '/batches',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: validateBody(createBatchSchema),
    },
    organizationController.createBatch,
  );

  fastify.patch<{ Params: BatchIdParams; Body: UpdateBatchInput }>(
    '/batches/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: [validateParams(batchIdParamsSchema), validateBody(updateBatchSchema)],
    },
    organizationController.updateBatch,
  );

  fastify.delete<{ Params: BatchIdParams }>(
    '/batches/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: validateParams(batchIdParamsSchema),
    },
    organizationController.deleteBatch,
  );

  // Deliberately gated by a DIFFERENT, narrower key than every other
  // batches.* route above: 'batches.manage' is held by both super_admin AND
  // faculty (see schema.sql's seed), but this action is meant to be
  // super_admin only. This codebase has no role-slug-based guard at all
  // (checked rbac/require-permission.ts — only permission-key checks exist,
  // and request.user carries no `roles` array), so "super_admin only" is
  // expressed the same way every other such restriction already is in this
  // codebase: a dedicated permission key granted to just one role — see
  // drizzle/migrations/0018_add-batches-toggle-active-permission.sql.
  fastify.patch<{ Params: BatchIdParams }>(
    '/batches/:id/toggle-active',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.toggle_active')],
      preValidation: validateParams(batchIdParamsSchema),
    },
    organizationController.toggleBatchActive,
  );

  // --- Batch trainers (Phase 4) ---
  // Gated by 'batches.manage' — the SAME key both super_admin and faculty
  // already hold for every other batches.* route, deliberately not a
  // narrower super-admin-only key like toggle-active above: the brief
  // wants faculty able to use this same endpoint. The real restriction
  // (self, or already-assigned-to-this-batch) is enforced at the SERVICE
  // layer instead — see organization.service.ts's assignTrainerToBatch/
  // unassignTrainerFromBatch.
  fastify.get<{ Params: BatchIdParams; Querystring: ListBatchTrainersQuery }>(
    '/batches/:id/trainers',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: [validateParams(batchIdParamsSchema), validateQuery(listBatchTrainersQuerySchema)],
    },
    organizationController.listBatchTrainers,
  );

  fastify.post<{ Params: BatchIdParams; Body: AssignBatchTrainerInput }>(
    '/batches/:id/trainers',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: [validateParams(batchIdParamsSchema), validateBody(assignBatchTrainerSchema)],
    },
    organizationController.assignTrainerToBatch,
  );

  fastify.delete<{ Params: BatchTrainerParams }>(
    '/batches/:id/trainers/:trainerId',
    {
      preHandler: [fastify.authenticate, requirePermission('batches.manage')],
      preValidation: validateParams(batchTrainerParamsSchema),
    },
    organizationController.unassignTrainerFromBatch,
  );
}

export default organizationRoutes;
