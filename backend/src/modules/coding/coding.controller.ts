// Deliberately still a stub in this phase — see coding.routes.ts's
// comment. There is no HTTP handler here because there is no route
// registered by this module yet; attempts.controller.ts's submitCode
// handler is the actual entry point, calling attemptsService.submitCode,
// which in turn calls codingService.gradeSubmission directly.
export {};
