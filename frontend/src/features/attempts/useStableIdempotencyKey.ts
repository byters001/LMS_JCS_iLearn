import { useRef } from 'react'

// Idempotency-Key generation for submitResponse/submitCode (CLAUDE1.md
// non-negotiable #8). Unlike Part 1's once-per-page-mount key (start
// attempt is a single logical operation for the whole page visit), a
// question's save/submit action can legitimately happen many times across
// one page visit — selecting a different MCQ option, editing code — and
// each of THOSE is a genuinely new operation that must get its own key, not
// share Part 1's page-lifetime one.
//
// The rule this hook encodes: the key is derived from (and only
// regenerated when) the submission's own content changes.
//   - Same content submitted twice in a row (e.g. the student re-clicks
//     Save/Submit after a network error, without changing anything) =>
//     `signature` is unchanged => the SAME key is reused => the backend's
//     idempotency cache replays the first outcome instead of re-running
//     the mutation (exactly "retry of the same submission").
//   - Different content (a different option selected, different
//     likertValue, edited source code) => `signature` changes => a fresh
//     crypto.randomUUID() => the backend treats it as a genuinely new
//     operation (exactly "not a retry, a new submission").
// This works whether the previous attempt with that signature succeeded,
// failed, or is still in flight — content is the only thing that
// invalidates a key, not success/failure state, which is what makes this
// simple derivation correct instead of needing manual invalidation logic.
export function useStableIdempotencyKey(signature: string): string {
  const ref = useRef<{ signature: string; key: string } | null>(null)
  if (!ref.current || ref.current.signature !== signature) {
    ref.current = { signature, key: crypto.randomUUID() }
  }
  return ref.current.key
}
