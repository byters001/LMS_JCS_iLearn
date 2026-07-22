// Cross-browser Fullscreen API wrappers. Safari (desktop and iOS) still only
// exposes the webkit-prefixed entry points as of this writing, so every call
// site needs both the standard API and the prefix, not just the standard one.
// Used by the assessment-attempt lockdown flow — see
// features/assessments/pages/AssessmentInstructionsPage.tsx (request) and
// features/attempts/pages/AttemptPage.tsx (exit + state checks/listeners).

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export function isFullscreenActive(): boolean {
  const doc = document as FullscreenDocument
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement)
}

// Pre-flight signal only, used by AssessmentInstructionsPage's System Check
// card — confirms the Fullscreen API exists and reports itself allowed in
// this context (browser support + any embedding iframe's permissions
// policy), NOT that fullscreen is currently active or that entering it will
// succeed. It CANNOT attempt real entry itself: requestFullscreen() above
// must run synchronously inside a live user-gesture click handler, and the
// System Check's checks run automatically on mount, well outside any click.
// Real entry still only ever happens where it already did — inside
// AssessmentInstructionsPage's handleStart, on the "I understand, start
// assessment" click.
export function isFullscreenSupported(): boolean {
  const doc = document as FullscreenDocument & { webkitFullscreenEnabled?: boolean }
  return Boolean(document.fullscreenEnabled ?? doc.webkitFullscreenEnabled)
}

// Must be called SYNCHRONOUSLY inside a user-gesture event handler (a click,
// not a callback fired after an awaited request resolves) — browsers reject
// requestFullscreen() called outside "user activation," and relying on
// Chrome's transient-activation window surviving an async gap is not
// something to depend on cross-browser. See AssessmentInstructionsPage.tsx's
// handleStart for exactly where this is called relative to useStartAttempt's
// mutate() call.
export function requestFullscreen(element: HTMLElement): Promise<void> {
  const el = element as FullscreenElement
  if (el.requestFullscreen) return el.requestFullscreen()
  if (el.webkitRequestFullscreen) return Promise.resolve(el.webkitRequestFullscreen())
  return Promise.reject(new Error('Fullscreen API is not supported in this browser'))
}

export function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument
  if (!isFullscreenActive()) return Promise.resolve()
  if (document.exitFullscreen) return document.exitFullscreen()
  if (doc.webkitExitFullscreen) return Promise.resolve(doc.webkitExitFullscreen())
  return Promise.reject(new Error('Fullscreen API is not supported in this browser'))
}

// Safari fires the webkit-prefixed event name, not the standard one — callers
// register the SAME handler under both names (see AttemptPage.tsx's lockdown
// effect) rather than picking one.
export const FULLSCREEN_CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const
