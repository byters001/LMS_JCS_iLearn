// Centralizes the one raw getUserMedia call every camera/microphone feature
// in this app makes — features/attempts/components/CameraPreview.tsx (a
// live, persistent proctoring preview that stays open for the whole
// attempt) and features/assessments/components/SystemCheckCard.tsx's
// pre-attempt camera/microphone checks (a one-shot probe that immediately
// releases the device again) both go through requestMediaStream below, so
// there's exactly one place that calls the browser API and one place that
// decides what "not supported" means, not two independently hand-rolled
// checks that could quietly drift apart.
export function requestMediaStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('getUserMedia is not supported in this browser'))
  }
  return navigator.mediaDevices.getUserMedia(constraints)
}

// Shared shape for every System Check card item that runs asynchronously
// (camera, microphone, and lib/networkCheck.ts's network check, which
// imports this same type — only the synchronous fullscreen-support check
// skips it, since document.fullscreenEnabled has no failure "reason" beyond
// the one fixed, generic string the card supplies itself).
export type CheckResult = { ok: true } | { ok: false; reason: string }

// One-shot permission probe: request, then immediately stop every track —
// unlike CameraPreview's stream, nothing here is meant to keep hardware
// live. A live camera/mic light staying on after a completed check would be
// the same real privacy issue CameraPreview's own unmount cleanup already
// guards against, just at check-time instead of attempt-end.
async function checkMediaAccess(
  constraints: MediaStreamConstraints,
  deviceLabel: string,
): Promise<CheckResult> {
  try {
    const stream = await requestMediaStream(constraints)
    stream.getTracks().forEach((track) => track.stop())
    return { ok: true }
  } catch (error) {
    // NotAllowedError (the user, or the browser/OS on their behalf, denied
    // the prompt) is the common, recoverable case — worded so the student
    // knows a retry can work. Anything else (NotFoundError - no device
    // present, the API missing entirely, etc.) gets the same honest
    // "unavailable" framing CameraPreview.tsx already uses, rather than
    // surfacing a raw DOMException name.
    const reason =
      error instanceof DOMException && error.name === 'NotAllowedError'
        ? `${deviceLabel} access was denied.`
        : `${deviceLabel} unavailable — check your browser permissions.`
    return { ok: false, reason }
  }
}

export function checkCameraAccess(): Promise<CheckResult> {
  return checkMediaAccess({ video: true }, 'Camera')
}

export function checkMicrophoneAccess(): Promise<CheckResult> {
  return checkMediaAccess({ audio: true }, 'Microphone')
}
