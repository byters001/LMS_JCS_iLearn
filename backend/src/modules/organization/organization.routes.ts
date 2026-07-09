import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { organizationController } from './organization.controller';
import {
  academicYearIdParamsSchema,
  collegeIdParamsSchema,
  createAcademicYearSchema,
  createCollegeSchema,
  createDepartmentSchema,
  departmentIdParamsSchema,
  listAcademicYearsQuerySchema,
  listCollegesQuerySchema,
  listDepartmentsQuerySchema,
  updateAcademicYearSchema,
  updateCollegeSchema,
  updateDepartmentSchema,
  type AcademicYearIdParams,
  type CollegeIdParams,
  type CreateAcademicYearInput,
  type CreateCollegeInput,
  type CreateDepartmentInput,
  type DepartmentIdParams,
  type ListAcademicYearsQuery,
  type ListCollegesQuery,
  type ListDepartmentsQuery,
  type UpdateAcademicYearInput,
  type UpdateCollegeInput,
  type UpdateDepartmentInput,
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

// Permission keys 'organization.view' / 'organization.manage' do NOT exist
// in schema.sql's seed `permissions` data yet (same situation as
// 'users.update'/'users.manage_roles' were before them) — every route below
// will deny everyone, including Super Admin, until a migration/seed inserts
// these two rows into `permissions` and grants them via `role_permissions`.
//
// One pair covering colleges + departments + academic_years, not split
// finer (e.g. not separate 'colleges.manage' vs 'departments.manage'):
// matches the granularity already used elsewhere in schema.sql's seed data
// ('batches.manage', 'training_programs.manage', 'training_sessions.manage'
// are each one permission per whole sub-domain, not one per CRUD verb or
// per sub-entity). Splitting further wasn't clearly warranted by anything
// in this phase's requirements.
export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  // --- Colleges ---

  fastify.get<{ Querystring: ListCollegesQuery }>(
    '/colleges',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.view')],
      preValidation: validateQuery(listCollegesQuerySchema),
    },
    organizationController.listColleges,
  );

  fastify.get<{ Params: CollegeIdParams }>(
    '/colleges/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.view')],
      preValidation: validateParams(collegeIdParamsSchema),
    },
    organizationController.getCollegeById,
  );

  fastify.post<{ Body: CreateCollegeInput }>(
    '/colleges',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
      preValidation: validateBody(createCollegeSchema),
    },
    organizationController.createCollege,
  );

  fastify.patch<{ Params: CollegeIdParams; Body: UpdateCollegeInput }>(
    '/colleges/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
      preValidation: [validateParams(collegeIdParamsSchema), validateBody(updateCollegeSchema)],
    },
    organizationController.updateCollege,
  );

  fastify.delete<{ Params: CollegeIdParams }>(
    '/colleges/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
      preValidation: validateParams(collegeIdParamsSchema),
    },
    organizationController.deleteCollege,
  );

  // --- Departments ---

  fastify.get<{ Querystring: ListDepartmentsQuery }>(
    '/departments',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.view')],
      preValidation: validateQuery(listDepartmentsQuerySchema),
    },
    organizationController.listDepartments,
  );

  fastify.get<{ Params: DepartmentIdParams }>(
    '/departments/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.view')],
      preValidation: validateParams(departmentIdParamsSchema),
    },
    organizationController.getDepartmentById,
  );

  fastify.post<{ Body: CreateDepartmentInput }>(
    '/departments',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
      preValidation: validateBody(createDepartmentSchema),
    },
    organizationController.createDepartment,
  );

  fastify.patch<{ Params: DepartmentIdParams; Body: UpdateDepartmentInput }>(
    '/departments/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
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
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
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
      preHandler: [fastify.authenticate, requirePermission('organization.view')],
      preValidation: validateQuery(listAcademicYearsQuerySchema),
    },
    organizationController.listAcademicYears,
  );

  fastify.get<{ Params: AcademicYearIdParams }>(
    '/academic-years/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.view')],
      preValidation: validateParams(academicYearIdParamsSchema),
    },
    organizationController.getAcademicYearById,
  );

  fastify.post<{ Body: CreateAcademicYearInput }>(
    '/academic-years',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
      preValidation: validateBody(createAcademicYearSchema),
    },
    organizationController.createAcademicYear,
  );

  fastify.patch<{ Params: AcademicYearIdParams; Body: UpdateAcademicYearInput }>(
    '/academic-years/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('organization.manage')],
      preValidation: [
        validateParams(academicYearIdParamsSchema),
        validateBody(updateAcademicYearSchema),
      ],
    },
    organizationController.updateAcademicYear,
  );
}

export default organizationRoutes;
