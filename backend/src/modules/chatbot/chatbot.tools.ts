// The allowlist. This is the ONLY set of operations the chatbot can ever
// execute — chatbot.service.ts's validateToolCall rejects any function
// name that isn't a key of CHATBOT_TOOLS below, and rejects any arguments
// that don't parse against that tool's own `argsSchema` (every schema is
// `.strict()`, matching this codebase's established Zod convention).
// Nothing in this file executes raw SQL, accepts a SQL string from the
// LLM, or interpolates LLM output into a query — every `execute` below
// calls a normal, already-existing service function with typed,
// validated arguments, exactly the same as a real HTTP route handler
// would. This is the CRITICAL, non-negotiable boundary the whole feature
// is built around.
import { z } from 'zod';
import { analyticsService } from '../analytics/analytics.service';
import type { AttendanceByDateResult, FailedStudentsResult } from '../analytics/analytics.types';
import { ForbiddenError } from '../../shared/errors/app-error';
import { studentsService, studentExportRowToCsvRow, STUDENT_EXPORT_CSV_HEADER } from '../students/students.service';
import type { StudentExportRow } from '../students/students.repository';
import { trainersService } from '../trainers/trainers.service';
import type { TrainerPerformanceResult } from '../trainers/trainers.types';
import type { ChatbotCsvExport, ChatbotToolContext } from './chatbot.types';

// --- Registry plumbing ---
//
// `defineTool` lets each individual tool below be authored with PRECISE
// typing — TS infers `execute`'s `args` parameter as exactly
// `z.infer<Schema>` from that tool's own `argsSchema`, so a typo (e.g.
// `args.trainrId`) is a compile error, not a runtime surprise. The
// REGISTRY itself (`CHATBOT_TOOLS`, below) stores every tool under one
// erased `ChatbotToolDefinition` shape, where `execute`/`toCsv` take
// `any` — that's the one specific, contained place a validated-but-erased
// value crosses from "generic dispatch by string name" (chatbot.
// service.ts's runChatbotTool, which only knows "some tool" until it
// looks the name up) into "this specific tool's logic." It is safe
// because `argsSchema.parse()` has ALREADY run (chatbot.service.ts's
// validateToolCall) before `args` ever reaches `execute` — not a
// general-purpose `any` escape hatch, just where dispatch and
// implementation meet.
export interface ChatbotToolDefinition {
  name: string;
  description: string;
  argsSchema: z.ZodTypeAny;
  execute: (args: any, context: ChatbotToolContext) => Promise<unknown>;
  // Absent (undefined) means "this tool's result isn't a flat, tabular
  // shape — no CSV export available for it." See getTrainerPerformance/
  // getAttendanceByDate below for tools that deliberately have no toCsv.
  toCsv?: (result: any) => ChatbotCsvExport | null;
}

function defineTool<Schema extends z.ZodTypeAny>(tool: {
  name: string;
  description: string;
  argsSchema: Schema;
  execute: (args: z.infer<Schema>, context: ChatbotToolContext) => Promise<unknown>;
  toCsv?: (result: any) => ChatbotCsvExport | null;
}): ChatbotToolDefinition {
  return tool;
}

const DATE_ARG_SCHEMA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format');

// --- getAttendanceByDate ---
// analytics module owns this (cross-cutting aggregation, per CLAUDE.md's
// reports/analytics exception) — see analytics.service.ts's
// getAttendanceByDate for the full "no attendance table exists in this
// schema" design decision. Surfaced here too, in the tool's own
// `description`, since that text is what the LLM (and therefore,
// indirectly, the end user reading its phrased answer) actually sees —
// a code comment alone wouldn't stop the model from implying real
// per-student presence data exists.
const getAttendanceByDateTool = defineTool({
  name: 'getAttendanceByDate',
  description:
    'Lists training sessions scheduled on a given date (YYYY-MM-DD), optionally scoped to one college. IMPORTANT: this reports which SESSIONS occurred on that date, not per-student physical presence/roll-call — this platform has no student-level attendance table.',
  argsSchema: z
    .object({
      date: DATE_ARG_SCHEMA,
      collegeId: z.string().uuid('collegeId must be a valid UUID').optional(),
    })
    .strict(),
  execute: async (args, context) => {
    return analyticsService.getAttendanceByDate(args.date, args.collegeId, context.activeCollegeId);
  },
  toCsv: (result: AttendanceByDateResult) => {
    if (result.sessions.length === 0) return null;
    return {
      filename: `attendance-${result.date}.csv`,
      header: ['session_title', 'session_type', 'status', 'college', 'department'],
      rows: result.sessions.map((session) => [
        session.title,
        session.sessionType,
        session.status,
        session.collegeName,
        session.departmentName,
      ]),
    };
  },
});

// --- getFailedStudents ---
// analytics module owns this — reuses getBatchPerformance's own pass/fail
// classification verbatim (see analytics.service.ts's getFailedStudents),
// no duplicated scoring logic.
const getFailedStudentsTool = defineTool({
  name: 'getFailedStudents',
  description:
    'Lists students who failed a given assessment (by assessmentId), optionally narrowed to one batch (batchId). If batchId is omitted, checks every batch assigned to that assessment.',
  argsSchema: z
    .object({
      assessmentId: z.string().uuid('assessmentId must be a valid UUID'),
      batchId: z.string().uuid('batchId must be a valid UUID').optional(),
    })
    .strict(),
  execute: async (args, context) => {
    return analyticsService.getFailedStudents(args.assessmentId, args.batchId, context.activeCollegeId);
  },
  toCsv: (result: FailedStudentsResult) => {
    const rows = result.batches.flatMap((batch) =>
      batch.students.map((student) => [batch.batchName, student.fullName, student.totalScore ?? '']),
    );
    if (rows.length === 0) return null;
    return {
      filename: `failed-students-${result.assessmentId}.csv`,
      header: ['batch', 'student_name', 'score'],
      rows,
    };
  },
});

// --- getTrainerPerformance ---
// Reused VERBATIM from Phase 5 (trainers.service.ts's getTrainerPerformance
// — zero duplication of its batch-resolution or trend-computation logic).
const getTrainerPerformanceTool = defineTool({
  name: 'getTrainerPerformance',
  description:
    "Returns a trainer's assigned batches and their performance trend across them (average score / pass rate per assessment over time). Super Admin only.",
  argsSchema: z
    .object({
      trainerId: z.string().uuid('trainerId must be a valid UUID'),
    })
    .strict(),
  execute: async (args, context) => {
    // The real HTTP route for this data (trainers.routes.ts's GET
    // /trainers/:trainerId/performance) is gated by 'trainers.view', a
    // permission ONLY super_admin holds (confirmed against drizzle/
    // migrations/0003_add-trainers-permissions.sql — Faculty holds no
    // trainers.* key at all). trainersService.getTrainerPerformance
    // ITSELF has no internal college/caller scoping — its only real
    // protection today IS that route-level gate. 'chatbot.query' (this
    // whole module's own permission key) is granted to Faculty too (per
    // this phase's own "super_admin/faculty only" requirement), so
    // calling this service function here for a Faculty caller, unchecked,
    // would silently grant them broader access than the equivalent HTTP
    // endpoint does — ANY trainer's performance, ANY college. This check
    // holds that same line inside the chatbot's call path; it is not a
    // new, separate restriction invented for this tool alone.
    if (!context.isSuperAdmin) {
      throw new ForbiddenError('Only Super Admin can query trainer performance via the chatbot');
    }
    return trainersService.getTrainerPerformance(args.trainerId);
  },
  toCsv: (result: TrainerPerformanceResult) => {
    if (result.trend.length === 0) return null;
    const batchNameById = new Map(result.batches.map((batch) => [batch.id, batch.name]));
    return {
      filename: `trainer-performance-${result.trainerId}.csv`,
      header: ['assessment', 'batch', 'average_score', 'pass_rate_percent', 'attempted', 'total'],
      rows: result.trend.map((point) => [
        point.assessmentTitle,
        batchNameById.get(point.batchId) ?? '',
        point.averageScore ?? '',
        point.passRate !== null ? String(Math.round(point.passRate * 100)) : '',
        String(point.studentsAttempted),
        String(point.totalStudents),
      ]),
    };
  },
});

// --- getBatchRoster ---
// students module owns this — reuses Phase 3's exact roster-fetch +
// authorization logic (students.service.ts's getBatchRoster, extracted
// from that phase's own exportStudentsCsv so both this tool and the real
// CSV export route share one implementation).
const getBatchRosterTool = defineTool({
  name: 'getBatchRoster',
  description:
    'Lists the student roster for a batch (by batchId), optionally filtered by department or status (active/archived).',
  argsSchema: z
    .object({
      batchId: z.string().uuid('batchId must be a valid UUID'),
      departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
      status: z.enum(['active', 'archived']).optional(),
      limit: z.number().int().positive().max(5000).optional(),
    })
    .strict(),
  execute: async (args, context) => {
    return studentsService.getBatchRoster(
      args.batchId,
      { departmentId: args.departmentId, status: args.status, limit: args.limit },
      context.activeCollegeId,
      context.userId,
    );
  },
  toCsv: (result: StudentExportRow[]) => {
    if (result.length === 0) return null;
    return {
      filename: 'batch-roster.csv',
      header: STUDENT_EXPORT_CSV_HEADER,
      rows: result.map(studentExportRowToCsvRow),
    };
  },
});

export const CHATBOT_TOOLS: Record<string, ChatbotToolDefinition> = Object.freeze({
  getAttendanceByDate: getAttendanceByDateTool,
  getFailedStudents: getFailedStudentsTool,
  getTrainerPerformance: getTrainerPerformanceTool,
  getBatchRoster: getBatchRosterTool,
});
