// Deliberately still a stub in this phase. The coding-submission endpoint
// (POST /attempts/:attemptId/responses/:questionVersionId/submit-code) is
// owned and registered by attempts.routes.ts — it's fundamentally an
// attempt-response mutation (ownership/status/frozen-selection checks all
// belong to attempts), which calls into codingService.gradeSubmission as
// a cross-module SERVICE call for the Judge0-specific part
// (coding.service.ts). modules/coding has no HTTP surface of its own to
// register here yet.
export {};
