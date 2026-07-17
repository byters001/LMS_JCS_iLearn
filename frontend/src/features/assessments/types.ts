// Frontend-side types for the "assessments" feature (own copy, not shared
// with the backend's *.types.ts). Matches the raw `assessments` row shape
// returned by GET /assessments/available (backend/src/db/schema/assessments.schema.ts).
export type TestCategory = 'mcq' | 'coding' | 'psychometric' | 'mixed'

export type AssessmentStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'live'
  | 'completed'
  | 'archived'

export interface Assessment {
  id: string
  // Nullable (item 4) — assessment_batches, not training session, is what
  // actually controls student visibility (item 8A's diagnosis), so a
  // training session is no longer required at creation.
  trainingSessionId: string | null
  title: string
  description: string | null
  testCategory: TestCategory
  timerMinutes: number | null
  startAt: string | null
  endAt: string | null
  maxAttempts: number
  shuffleQuestions: boolean
  randomQuestionCount: number | null
  negativeMarking: boolean
  negativeMarkingValue: string | null
  proctoringCameraRequired: boolean
  proctoringFullscreenRequired: boolean
  isPractice: boolean
  status: AssessmentStatus
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

// Matches backend/src/modules/assessments/assessments.schema.ts's
// listAvailableAssessmentsQuerySchema — student-scoped (batch-authorized
// only), status restricted to 'scheduled' | 'live'.
export interface ListAvailableAssessmentsParams {
  page?: number
  pageSize?: number
  status?: 'scheduled' | 'live'
}

export interface ListAvailableAssessmentsResponse {
  items: Assessment[]
  total: number
  page: number
  pageSize: number
}

// Staff-facing GET /assessments (NOT /assessments/available — that one's
// student-scoped, resolved from the caller's own batch membership; this is
// the full platform-wide list, gated by the assessments.create permission
// per assessments.routes.ts). Matches backend/assessments.schema.ts's
// listAssessmentsQuerySchema exactly: trainingSessionId/status/testCategory
// are all optional filters the backend already supports, kept here for
// type completeness even though this phase's UI doesn't expose filter
// controls yet (read-only listing only, same scope discipline as
// StudentListPage.tsx).
export interface ListAssessmentsParams {
  page?: number
  pageSize?: number
  trainingSessionId?: string
  status?: AssessmentStatus
  testCategory?: TestCategory
}

export interface ListAssessmentsResult {
  items: Assessment[]
  total: number
  page: number
  pageSize: number
}

// --- Staff write operations (assessment creation/edit) ---

// Matches backend/assessments.schema.ts's createAssessmentSchema exactly.
// startAt/endAt deliberately NOT exposed on CreateAssessmentPage's form even
// though the backend schema allows them at creation — the dedicated
// Schedule workflow action already requires (and is the only OTHER place
// that can ever set) these two fields, so asking for them twice would be
// redundant; see WorkflowActions.tsx. randomQuestionCount also isn't
// exposed on the create form — it only matters once pool-based sections
// are actually in use, which this phase's minimal pool-attach UI (paste a
// questionPoolId) doesn't need a default count for yet.
export interface CreateAssessmentInput {
  trainingSessionId?: string
  title: string
  description?: string
  testCategory: TestCategory
  timerMinutes?: number
  maxAttempts?: number
  shuffleQuestions?: boolean
  negativeMarking?: boolean
  negativeMarkingValue?: number
  proctoringCameraRequired?: boolean
  proctoringFullscreenRequired?: boolean
  isPractice?: boolean
  batchIds?: string[]
}

// Matches updateAssessmentSchema — every field optional, `status` excluded
// (the dedicated action endpoints own status transitions), batchIds has its
// OWN gate on the backend (assertBatchesEditable) separate from every
// other field's assertAssessmentEditable (see assessments.service.ts) —
// reflected here by useUpdateAssessmentBatches being a distinct hook from
// useUpdateAssessment, not because the wire shape differs.
export interface UpdateAssessmentInput {
  title?: string
  description?: string | null
  timerMinutes?: number | null
  startAt?: string | null
  endAt?: string | null
  maxAttempts?: number
  shuffleQuestions?: boolean
  randomQuestionCount?: number | null
  negativeMarking?: boolean
  negativeMarkingValue?: number | null
  proctoringCameraRequired?: boolean
  proctoringFullscreenRequired?: boolean
  isPractice?: boolean
  batchIds?: string[]
}

// batchIds surfaced alongside the bare assessment row — assessment_batches
// is modeled as part of create/update, not its own CRUD resource (see
// backend's assessments.service.ts module comment), but callers still need
// to see which batches are currently linked.
export interface AssessmentWithBatches extends Assessment {
  batchIds: string[]
}

export type SelectionMode = 'manual' | 'pool'

export interface AssessmentSection {
  id: string
  assessmentId: string
  title: string
  instructions: string | null
  sectionOrder: number
  timerMinutes: number | null
  passingMarks: string | null
  negativeMarking: boolean
  negativeMarkingValue: string | null
  shuffleQuestions: boolean
  selectionMode: SelectionMode
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface CreateAssessmentSectionInput {
  title: string
  instructions?: string
  sectionOrder?: number
  timerMinutes?: number
  passingMarks?: number
  negativeMarking?: boolean
  negativeMarkingValue?: number
  shuffleQuestions?: boolean
  selectionMode?: SelectionMode
}

// One question as it will actually appear to a test-taker, regardless of
// which selection_mode produced it — manual rows and pool-resolved rows are
// both normalized to this same shape by the backend (see
// assessments.types.ts's ResolvedAssessmentQuestion), so this page never
// has to branch on source to render a section's current questions.
export interface ResolvedAssessmentQuestion {
  questionVersionId: string
  questionText: string
  marks: string
  sortOrder: number
  source: 'manual' | 'pool'
}

// A section as returned by GET /assessments/:id/full — poolResolutions
// (the granular per-criterion "why a pool came up short" diagnostic) is
// deliberately NOT included here: this phase's edit page shows
// resolvedQuestions (populated for both manual and pool sections) but
// doesn't need that deeper diagnostic detail.
export interface AssessmentSectionWithResolvedQuestions extends AssessmentSection {
  resolvedQuestions: ResolvedAssessmentQuestion[]
}

// GET /assessments/:id/full's response shape — the assessment (with
// batchIds) plus every section in order, each carrying its resolved
// questions. This is what AssessmentEditPage fetches to render current
// state.
export interface FullAssessment extends AssessmentWithBatches {
  sections: AssessmentSectionWithResolvedQuestions[]
}

// The raw assessment_questions/assessment_section_pools junction row —
// returned directly by POST .../questions and POST .../pools (distinct
// from ResolvedAssessmentQuestion, which is the normalized read-back shape
// GET /assessments/:id/full uses).
export interface AssessmentQuestion {
  id: string
  assessmentSectionId: string
  questionVersionId: string
  marksOverride: string | null
  sortOrder: number
}

export interface AssessmentSectionPool {
  id: string
  assessmentSectionId: string
  questionPoolId: string
  createdAt: string
}

export interface CreateAssessmentQuestionInput {
  questionVersionId: string
  marksOverride?: number
  sortOrder?: number
}

export interface CreateAssessmentSectionPoolInput {
  questionPoolId: string
}

// Shared by submit/approve/reject/publish — schedule has its own shape
// below (startAt/endAt are required there, not just optional notes).
export interface AssessmentApprovalActionInput {
  notes?: string
}

export interface ScheduleAssessmentInput {
  startAt: string
  endAt: string
  notes?: string
}
